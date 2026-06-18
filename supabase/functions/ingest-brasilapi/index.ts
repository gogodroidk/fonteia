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
//   1. Valida ?cnpjs= (ao menos 1, teto 50 por invocação)
//   2. Para cada CNPJ: GET com retry (3 tentativas, backoff 800 ms)
//      - 404 → grava item com situacao_cadastral="NAO_ENCONTRADO"
//      - 429 → pausa 2 s extra + 1 retentativa antes de registrar em errors[]
//   3. Pausa RATE_MS=800 ms entre consultas (BrasilAPI é gratuita, sem SLA)
//   4. Normaliza resposta bem-sucedida em item estruturado
//   5. Grava em lotes via RPC ingest_brasilapi_cnpj
//   6. Degradação elegante: CNPJ com erro → errors[], continua
//
// Idempotente: id = CNPJ com 14 dígitos (perene). A RPC faz upsert; rodar de
// novo com o mesmo CNPJ apenas atualiza o registro existente.
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente
// pelo Supabase nas Edge Functions — não precisa configurar nada.
// INGEST_CRON_SECRET (opcional) — se definido, exige Bearer correspondente.
//
// Parâmetros de query (todos opcionais exceto cnpjs):
//   ?cnpjs=12345678000190,98765432000100
//       Lista de CNPJs separados por vírgula (com ou sem máscara).
//       Obrigatório. Mínimo 1, máximo 50 por invocação.
//   ?mode=enrich
//       Modo de operação (default: "enrich"). Reservado para expansão futura.
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
    const raw = (await retry.json()) as RawCnpj;
    return { item: normalize(cnpj14, raw), error: null };
  }

  if (!res.ok) {
    return { item: null, error: `status ${res.status} para CNPJ ${cnpj14}` };
  }

  const raw = (await res.json()) as RawCnpj;
  return { item: normalize(cnpj14, raw), error: null };
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // Defense-in-depth: se INGEST_CRON_SECRET estiver definido, exige Bearer correspondente.
  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (cronSecret) {
    if (!hasValidBearerSecret(req, cronSecret)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 }, req);
    }
  } else {
    console.warn("[ingest-brasilapi] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const reqUrl = new URL(req.url);

  // Valida parâmetro ?cnpjs=
  const cnpjsParam = reqUrl.searchParams.get("cnpjs") ?? "";
  if (!cnpjsParam.trim()) {
    return jsonResponse(
      {
        ok: false,
        error: "Parâmetro obrigatório ausente: ?cnpjs=",
        hint: "Forneça ao menos um CNPJ (14 dígitos, com ou sem máscara), separados por vírgula. Ex: ?cnpjs=12345678000190,98765432000100",
      },
      { status: 400 },
      req,
    );
  }

  // Normaliza entradas: aceita com ou sem máscara, filtra inválidos
  const rawList = cnpjsParam.split(",").map((s) => s.trim()).filter(Boolean);
  const cnpjs: string[] = [];
  const invalidos: string[] = [];
  for (const raw of rawList) {
    const digits = digitsOnly(raw);
    if (digits.length === 14) {
      if (!cnpjs.includes(digits)) cnpjs.push(digits); // dedup
    } else {
      invalidos.push(raw);
    }
  }

  if (cnpjs.length === 0) {
    return jsonResponse(
      {
        ok: false,
        error: "Nenhum CNPJ válido encontrado.",
        invalidos,
        hint: "CNPJs devem ter 14 dígitos (com ou sem máscara). Ex: 12.345.678/0001-90 ou 12345678000190",
      },
      { status: 400 },
      req,
    );
  }

  if (cnpjs.length > MAX_CNPJS) {
    return jsonResponse(
      {
        ok: false,
        error: `Máximo de ${MAX_CNPJS} CNPJs por invocação. Você enviou ${cnpjs.length}.`,
      },
      { status: 400 },
      req,
    );
  }

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const items: Array<Record<string, unknown>> = [];
    const errors: Array<{ cnpj: string; error: string }> = [];

    // Coleta — 1 request por CNPJ com pausa RATE_MS entre eles
    for (let i = 0; i < cnpjs.length; i++) {
      const cnpj14 = cnpjs[i]!;
      const { item, error } = await fetchCnpj(cnpj14);
      if (error) {
        errors.push({ cnpj: cnpj14, error });
      } else if (item) {
        items.push(item);
      }
      // Pausa entre consultas (exceto após a última)
      if (i < cnpjs.length - 1 && RATE_MS > 0) await sleep(RATE_MS);
    }

    // Grava em lotes via a RPC
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_brasilapi_cnpj", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    return jsonResponse(
      {
        ok: true,
        solicitados: cnpjs.length,
        coletados: items.length,
        ingested,
        invalidos: invalidos.length > 0 ? invalidos : undefined,
        errors,
      },
      {},
      req,
    );
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, { status: 500 }, req);
  }
});
