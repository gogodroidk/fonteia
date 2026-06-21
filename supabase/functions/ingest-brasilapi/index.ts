// Supabase Edge Function: "ingest-brasilapi"
// Enriquecimento de CNPJs via BrasilAPI — consulta ON-DEMAND por lista de CNPJs.
//
// Fonte: BrasilAPI (brasilapi.com.br) — REST gratuita, sem chave, sem autenticação:
//   GET https://brasilapi.com.br/api/cnpj/v1/{cnpj14digitos}
//
//   Retorna: uf, cep, cnpj, email, porte, codigo_porte, razao_social, nome_fantasia,
//   capital_social, bairro, municipio, logradouro, numero, complemento,
//   codigo_municipio_ibge, cnae_fiscal, cnae_fiscal_descricao, cnaes_secundarios
//   (array: {codigo, descricao}), situacao_cadastral, descricao_situacao_cadastral,
//   data_situacao_cadastral, data_inicio_atividade, natureza_juridica,
//   codigo_natureza_juridica, ente_federativo_responsavel,
//   qualificacao_do_responsavel, opcao_pelo_simples, opcao_pelo_mei,
//   qsa (array: {nome_socio, identificador_de_socio, cpf_representante_legal,
//               nome_representante_legal, qualificacao_socio, data_entrada_sociedade})
//
// Fluxo:
//   1. Resolve a lista de CNPJs (de ?cnpjs= OU do backfill ?backfill=top).
//   2. CACHE-FIRST (a menos que ?force=true): consulta o D1 e PULA os CNPJs que já
//      existem como kind='company' — não rebusca a BrasilAPI à toa (respeita o
//      rate limit gratuito). Os já-cacheados voltam em `skipped`.
//   3. Para cada CNPJ faltante: GET com retry (3 tentativas, backoff 800 ms)
//      - 404 → grava item com situacao_cadastral="NAO_ENCONTRADO"
//      - 429 → pausa 2 s extra + 1 retentativa antes de registrar em errors[]
//   4. Pausa RATE_MS=800 ms entre consultas (BrasilAPI é gratuita, sem SLA).
//   5. Normaliza resposta bem-sucedida em item estruturado.
//   6. PERSISTE em DOIS destinos (ambos idempotentes):
//        a) Cloudflare D1 (kind='company') — é o que o Cérebro/Dossiê leem.
//           id = CNPJ; attributes = item (inclui qsa/sócios, CNAE, capital…);
//           external_ids = {cnpj}; source_ids = ['brasilapi']. Via _shared/d1.ts.
//        b) Supabase Postgres (RPC ingest_brasilapi_cnpj) — fonte de
//           rastreabilidade (source_runs + raw_records + evidence: link+data+hash).
//   7. Degradação elegante: CNPJ com erro → errors[], continua; se o D1 não estiver
//      configurado (faltam segredos no Vault), responde com aviso honesto e ainda
//      grava no Postgres (não falha 200 escondendo erro).
//
// IDEMPOTÊNCIA: id = CNPJ com 14 dígitos (perene). D1 usa INSERT OR REPLACE; a RPC
//   faz upsert. Rodar de novo com o mesmo CNPJ apenas atualiza o registro.
//
// RATE LIMIT — LIMITAÇÃO ESTRUTURAL DA FONTE: a BrasilAPI é POR-CNPJ (1 request =
//   1 CNPJ). NÃO existe dump/bulk de "todos os CNPJs do Brasil" por ela. Por isso o
//   cadastro `company` cresce ON-DEMAND (lazy, por consulta) + backfill bounded dos
//   CNPJs que mais aparecem. O teto MAX_CNPJS=50/invocação protege a Edge Function
//   (~150 s) e a própria BrasilAPI (gratuita, sem SLA).
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente
// pelo Supabase nas Edge Functions — não precisa configurar nada.
// CF_API_TOKEN e CF_ACCOUNT_ID vêm do Vault (lidos em runtime por _shared/d1.ts) —
//   obrigatórios para a escrita no D1. Sem eles, só a parte Postgres roda.
// INGEST_CRON_SECRET (opcional) — se definido, exige Bearer correspondente.
//
// Parâmetros de query:
//   ?cnpjs=12345678000190,98765432000100
//       Lista de CNPJs separados por vírgula (com ou sem máscara). Máx 50.
//       Obrigatório, EXCETO quando ?backfill=top é usado.
//   ?backfill=top   (admin — exige o Bearer de INGEST_CRON_SECRET se definido)
//       Backfill BOUNDED de demonstração: pega os CNPJs com mais contratos no D1
//       (kind='public_contract') e enriquece o cadastro deles. Sempre inclui o
//       Banco do Brasil (00000000000191) como semente. Use com ?max=N (1..50).
//   ?force=true
//       Ignora o cache-first e re-busca mesmo CNPJs já presentes no D1.
//   ?max=N
//       Teto efetivo de CNPJs nesta invocação (1..50). Default 50.
//
// Deploy: Edge Functions -> "ingest-brasilapi". Verify JWT LIGADO.
//   Esta função é invocada ON-DEMAND (enriquecimento), não como cron batch.
//   Pode ser chamada pelo front-end ou por um pipeline de enriquecimento.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { digitsOnly } from "../_shared/br.ts";
import {
  type CfCreds,
  type D1EntityInput,
  existingCompanyCnpjs,
  resolveCfCreds,
  topContractCnpjs,
  upsertD1Entities,
} from "../_shared/d1.ts";

const BASE = "https://brasilapi.com.br/api/cnpj/v1";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "brasilapi";

// Lotes por chamada de RPC (payloads CNPJ são grandes — QSA, sócios etc.).
const RPC_BATCH = 50;
// Pausa educada entre consultas à BrasilAPI (ms) — serviço gratuito, sem SLA.
const RATE_MS = 800;
// Teto de CNPJs por invocação (proteção da Edge Function e rate limit da BrasilAPI).
const MAX_CNPJS = 50;
// Semente sempre incluída no backfill de demonstração (Banco do Brasil S.A.).
const SEED_CNPJ = "00000000000191";

// ---------- Tipos da API BrasilAPI ----------

interface CnaeSecundario {
  codigo: number | string;
  descricao?: string;
}

interface QsaSocio {
  nome_socio?: string;
  identificador_de_socio?: number | string;
  cpf_representante_legal?: string;
  nome_representante_legal?: string;
  qualificacao_socio?: string;
  data_entrada_sociedade?: string;
}

interface RawCnpj {
  uf?: string;
  cep?: string;
  cnpj?: string;
  email?: string;
  porte?: string;
  codigo_porte?: number | string;
  razao_social?: string;
  nome_fantasia?: string;
  capital_social?: number;
  bairro?: string;
  municipio?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  codigo_municipio_ibge?: number | string;
  cnae_fiscal?: number | string;
  cnae_fiscal_descricao?: string;
  cnaes_secundarios?: CnaeSecundario[];
  situacao_cadastral?: number | string;
  descricao_situacao_cadastral?: string;
  data_situacao_cadastral?: string;
  data_inicio_atividade?: string;
  natureza_juridica?: string;
  codigo_natureza_juridica?: number | string;
  ente_federativo_responsavel?: string;
  qualificacao_do_responsavel?: string;
  opcao_pelo_simples?: boolean | null;
  opcao_pelo_mei?: boolean | null;
  qsa?: QsaSocio[];
}

// ---------- Normalização ----------

function normalizeQsa(raw: QsaSocio[]): Array<Record<string, unknown>> {
  return raw.map((s) => ({
    nomeSocio: (s.nome_socio ?? "").trim(),
    identificador: s.identificador_de_socio != null ? String(s.identificador_de_socio) : null,
    cpfRepresentante: (s.cpf_representante_legal ?? "").trim() || null,
    nomeRepresentante: (s.nome_representante_legal ?? "").trim() || null,
    qualificacao: (s.qualificacao_socio ?? "").trim() || null,
    dataEntrada: (s.data_entrada_sociedade ?? "").trim() || null,
  }));
}

function normalize(cnpj14: string, raw: RawCnpj): Record<string, unknown> {
  const cnaePrincipal = raw.cnae_fiscal != null
    ? {
      codigo: String(raw.cnae_fiscal),
      descricao: (raw.cnae_fiscal_descricao ?? "").trim(),
    }
    : null;

  const cnaesSecundarios = (raw.cnaes_secundarios ?? []).map((c) => ({
    codigo: String(c.codigo),
    descricao: (c.descricao ?? "").trim(),
  }));

  return {
    id: cnpj14,
    sourceId: SOURCE_ID,
    cnpj: cnpj14,
    razaoSocial: (raw.razao_social ?? "").trim(),
    nomeFantasia: (raw.nome_fantasia ?? "").trim() || null,
    uf: (raw.uf ?? "").trim() || null,
    municipio: (raw.municipio ?? "").trim() || null,
    codigoIbge: raw.codigo_municipio_ibge != null ? String(raw.codigo_municipio_ibge) : null,
    situacaoCadastral: (raw.descricao_situacao_cadastral ?? String(raw.situacao_cadastral ?? "")).trim() || null,
    cnaePrincipal,
    cnaesSecundarios,
    capitalSocial: raw.capital_social ?? null,
    simples: raw.opcao_pelo_simples ?? null,
    mei: raw.opcao_pelo_mei ?? null,
    qsa: normalizeQsa(raw.qsa ?? []),
    dataInicioAtividade: (raw.data_inicio_atividade ?? "").trim() || null,
    naturezaJuridica: (raw.natureza_juridica ?? "").trim() || null,
    raw,
  };
}

function normalizeNaoEncontrado(cnpj14: string): Record<string, unknown> {
  return {
    id: cnpj14,
    sourceId: SOURCE_ID,
    cnpj: cnpj14,
    razaoSocial: "",
    nomeFantasia: null,
    uf: null,
    municipio: null,
    codigoIbge: null,
    situacaoCadastral: "NAO_ENCONTRADO",
    cnaePrincipal: null,
    cnaesSecundarios: [],
    capitalSocial: null,
    simples: null,
    mei: null,
    qsa: [],
    dataInicioAtividade: null,
    naturezaJuridica: null,
    raw: null,
  };
}

// ---------- Linha do D1 (kind='company') ----------
//
// Espelha EXATAMENTE o que a RPC ingest_brasilapi_cnpj grava no Postgres, para que
// D1 e Postgres fiquem consistentes e o Cérebro encontre os mesmos campos:
//   name            = razaoSocial (truncado em 300)
//   normalized_name = lower(razao + fantasia + municipio + uf) (truncado em 500)
//   cnpj            = chave estável de 14 dígitos (também a coluna cnpj do D1)
//   ibge_code       = codigoIbge (ou null)
//   external_ids    = { cnpj }
//   attributes      = item completo (inclui qsa/sócios, cnaes, capital, simples…)
//   source_ids      = ['brasilapi']
function buildCompanyRow(item: Record<string, unknown>): D1EntityInput {
  const cnpj = String(item["cnpj"] ?? item["id"] ?? "");
  const razaoRaw = String(item["razaoSocial"] ?? "").trim();
  const razao = razaoRaw !== "" ? razaoRaw : "Empresa nao identificada";
  const fantasia = String(item["nomeFantasia"] ?? "").trim();
  const municipio = String(item["municipio"] ?? "").trim();
  const uf = String(item["uf"] ?? "").trim();
  const ibge = String(item["codigoIbge"] ?? "").trim();
  const normalized = `${razao} ${fantasia} ${municipio} ${uf}`.toLowerCase().slice(0, 500);
  return {
    id: cnpj,
    kind: "company",
    name: razao.slice(0, 300),
    normalized_name: normalized,
    cnpj,
    ibge_code: ibge !== "" ? ibge : null,
    external_ids: { cnpj },
    attributes: item,
    source_ids: [SOURCE_ID],
  };
}

// ---------- Fetch CNPJ individual ----------

async function fetchCnpj(cnpj14: string): Promise<{ item: Record<string, unknown> | null; error: string | null }> {
  const url = `${BASE}/${cnpj14}`;

  // Primeira tentativa normal (fetchWithRetry cuida de 5xx; trata 429 manualmente)
  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      timeoutMs: 15000,
      retries: 3,
      backoffMs: 800,
      retryOnStatus: (s) => s >= 500, // 429 tratado separadamente abaixo
      init: { headers: HEADERS },
    });
  } catch (e) {
    return { item: null, error: String(e) };
  }

  // 404 — CNPJ não encontrado na base da Receita Federal
  if (res.status === 404) {
    return { item: normalizeNaoEncontrado(cnpj14), error: null };
  }

  // 429 — rate limit: pausa 2 s extra + 1 retentativa
  if (res.status === 429) {
    await sleep(2000);
    let retry: Response;
    try {
      retry = await fetchWithRetry(url, {
        timeoutMs: 15000,
        retries: 1,
        backoffMs: 800,
        retryOnStatus: (s) => s >= 500,
        init: { headers: HEADERS },
      });
    } catch (e) {
      return { item: null, error: `429 + retry falhou: ${String(e)}` };
    }
    if (!retry.ok) {
      return { item: null, error: `429 após retry: status ${retry.status}` };
    }
    let raw: RawCnpj;
    try {
      raw = (await retry.json()) as RawCnpj;
    } catch (e) {
      // 200 com corpo não-JSON (página de erro de proxy/CDN, resposta truncada):
      // erro POR-CNPJ, nunca derruba a invocação inteira (preserva os já coletados).
      return { item: null, error: `JSON inválido após 429 para CNPJ ${cnpj14}: ${String(e)}` };
    }
    return { item: normalize(cnpj14, raw), error: null };
  }

  if (!res.ok) {
    return { item: null, error: `status ${res.status} para CNPJ ${cnpj14}` };
  }

  let raw: RawCnpj;
  try {
    raw = (await res.json()) as RawCnpj;
  } catch (e) {
    // 200 com corpo não-JSON: erro POR-CNPJ (degradação elegante), não exceção
    // que escaparia para o handler e descartaria todo o lote já coletado.
    return { item: null, error: `JSON inválido para CNPJ ${cnpj14}: ${String(e)}` };
  }
  return { item: normalize(cnpj14, raw), error: null };
}

// ---------- Resolução da lista de CNPJs ----------

/** Parseia ?cnpjs=, dedup, separando válidos (14 dígitos) de inválidos. */
function parseCnpjsParam(raw: string): { cnpjs: string[]; invalidos: string[] } {
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const cnpjs: string[] = [];
  const invalidos: string[] = [];
  for (const r of list) {
    const digits = digitsOnly(r);
    if (digits.length === 14) {
      if (!cnpjs.includes(digits)) cnpjs.push(digits);
    } else {
      invalidos.push(r);
    }
  }
  return { cnpjs, invalidos };
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // Defense-in-depth: se INGEST_CRON_SECRET estiver definido, exige Bearer correspondente.
  // O backfill é ADMIN: quando o segredo NÃO está definido, o backfill fica bloqueado
  // (não queremos que qualquer um dispare varreduras do D1 + BrasilAPI sem trava).
  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  const authorized = cronSecret ? hasValidBearerSecret(req, cronSecret) : false;
  if (cronSecret && !authorized) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 }, req);
  }
  if (!cronSecret) {
    console.warn("[ingest-brasilapi] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const reqUrl = new URL(req.url);
  const backfill = (reqUrl.searchParams.get("backfill") ?? "").trim().toLowerCase();
  const force = (reqUrl.searchParams.get("force") ?? "").trim().toLowerCase() === "true";
  const maxRaw = Number(reqUrl.searchParams.get("max"));
  const maxCnpjs = Number.isFinite(maxRaw) && maxRaw > 0
    ? Math.min(Math.floor(maxRaw), MAX_CNPJS)
    : MAX_CNPJS;

  // Resolve as credenciais do D1 cedo. Sem elas: o cache-first e a escrita no D1
  // ficam indisponíveis (degrada para só-Postgres, com aviso honesto). O backfill
  // EXIGE D1 (lê os top CNPJs de lá), então falha cedo se faltar.
  const credsOrMissing = await resolveCfCreds();
  const creds: CfCreds | null = "missing" in credsOrMissing ? null : credsOrMissing;
  const d1Missing: string[] = "missing" in credsOrMissing ? credsOrMissing.missing : [];

  // ── Monta a lista de CNPJs a processar ────────────────────────────────────────
  let cnpjs: string[] = [];
  let invalidos: string[] = [];
  let backfillSource: string | undefined;

  if (backfill === "top") {
    // Backfill BOUNDED de demonstração. Requer D1 (origem dos top CNPJs) e, se
    // INGEST_CRON_SECRET estiver definido, exige o Bearer (já validado acima).
    if (!cronSecret) {
      return jsonResponse(
        {
          ok: false,
          error: "Backfill é restrito: defina INGEST_CRON_SECRET e envie o Bearer correspondente.",
        },
        { status: 401 },
        req,
      );
    }
    if (!creds) return cfUnavailable(req, d1Missing);

    const top = await topContractCnpjs(creds, maxCnpjs);
    backfillSource = "top_public_contract";
    // Semente: Banco do Brasil sempre presente, no topo, sem estourar o teto.
    const merged = [SEED_CNPJ, ...top.filter((c) => c !== SEED_CNPJ)];
    cnpjs = merged.slice(0, maxCnpjs);
  } else {
    const cnpjsParam = reqUrl.searchParams.get("cnpjs") ?? "";
    if (!cnpjsParam.trim()) {
      return jsonResponse(
        {
          ok: false,
          error: "Parâmetro obrigatório ausente: ?cnpjs= (ou use ?backfill=top).",
          hint: "Ex: ?cnpjs=12345678000190,98765432000100 — máx 50, com ou sem máscara.",
        },
        { status: 400 },
        req,
      );
    }
    const parsed = parseCnpjsParam(cnpjsParam);
    cnpjs = parsed.cnpjs;
    invalidos = parsed.invalidos;

    if (cnpjs.length === 0) {
      return jsonResponse(
        {
          ok: false,
          error: "Nenhum CNPJ válido encontrado.",
          invalidos,
          hint: "CNPJs devem ter 14 dígitos (com ou sem máscara). Ex: 12.345.678/0001-90.",
        },
        { status: 400 },
        req,
      );
    }
    if (cnpjs.length > maxCnpjs) {
      return jsonResponse(
        {
          ok: false,
          error: `Máximo de ${maxCnpjs} CNPJs por invocação. Você enviou ${cnpjs.length}.`,
          hint: "Fatie a lista e chame de novo (a função é idempotente e cache-first).",
        },
        { status: 400 },
        req,
      );
    }
  }

  if (cnpjs.length === 0) {
    return jsonResponse(
      { ok: true, solicitados: 0, skipped: [], coletados: 0, d1Written: 0, ingested: 0, errors: [] },
      {},
      req,
    );
  }

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── CACHE-FIRST: pula CNPJs que já existem como company no D1 (a menos de force) ──
    let toFetch = cnpjs;
    let skipped: string[] = [];
    if (creds && !force) {
      const existing = await existingCompanyCnpjs(creds, cnpjs);
      skipped = cnpjs.filter((c) => existing.has(c));
      toFetch = cnpjs.filter((c) => !existing.has(c));
    }

    const items: Array<Record<string, unknown>> = [];
    const errors: Array<{ cnpj: string; error: string }> = [];

    // Coleta SERIAL — 1 request por CNPJ com pausa RATE_MS entre eles (rate limit).
    for (let i = 0; i < toFetch.length; i++) {
      const cnpj14 = toFetch[i]!;
      const { item, error } = await fetchCnpj(cnpj14);
      if (error) {
        errors.push({ cnpj: cnpj14, error });
      } else if (item) {
        items.push(item);
      }
      if (i < toFetch.length - 1 && RATE_MS > 0) await sleep(RATE_MS);
    }

    // ── Destino A: Cloudflare D1 (o que o Cérebro/Dossiê leem) ──────────────────
    // Persistimos TODO item coletado, inclusive os NAO_ENCONTRADO (cache negativo:
    // evita rebuscar um CNPJ inexistente). Idempotente por id (INSERT OR REPLACE).
    let d1Written = 0;
    let d1Error: string | undefined;
    if (creds && items.length > 0) {
      try {
        const rows = items.map(buildCompanyRow);
        d1Written = await upsertD1Entities(creds, rows);
      } catch (e) {
        d1Error = String(e);
        console.error("[ingest-brasilapi] escrita no D1 falhou:", d1Error);
      }
    }

    // ── Destino B: Supabase Postgres (rastreabilidade: runs + raw + evidence) ────
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_brasilapi_cnpj", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    // ok=false APENAS se o destino primário (D1) estava configurado e falhou de fato.
    const ok = d1Error === undefined;
    return jsonResponse(
      {
        ok,
        backfill: backfillSource,
        solicitados: cnpjs.length,
        skipped,
        coletados: items.length,
        d1Written,
        ingested,
        invalidos: invalidos.length > 0 ? invalidos : undefined,
        // Aviso honesto: D1 não configurado ⇒ company NÃO chega ao Cérebro.
        d1Indisponivel: creds ? undefined : { missing: d1Missing },
        d1Error,
        errors,
      },
      { status: ok ? 200 : 502 },
      req,
    );
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, { status: 500 }, req);
  }
});

/** Resposta 503 honesta quando faltam segredos do D1 no Vault. */
function cfUnavailable(req: Request, missing: string[]): Response {
  return jsonResponse(
    {
      ok: false,
      error: "d1_nao_configurado",
      message: "Escrita no D1 indisponível: falta(m) segredo(s) no Vault do Supabase.",
      missing,
      hint: "Vault → New secret: " + missing.join(", "),
    },
    { status: 503 },
    req,
  );
}
