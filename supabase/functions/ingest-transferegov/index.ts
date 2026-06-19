// Supabase Edge Function: "ingest-transferegov"
// Ingestão de TRANSFERÊNCIAS FEDERAIS (Fundo a Fundo + TED) — Transferegov / +Brasil.
//
// Fontes públicas, sem autenticação (PostgREST):
//   Fundo a Fundo (FAF):
//     GET https://api.transferegov.gestao.gov.br/fundoafundo/plano_acao
//         ?limit=N&offset=N&order=id_plano_acao.asc
//   Termo de Execução Descentralizada (TED):
//     GET https://api.transferegov.gestao.gov.br/ted/plano_acao
//         ?limit=N&offset=N&order=id_plano_acao.asc
//
// As APIs são PostgREST puro: paginação via limit+offset; total no header
// Content-Range ("0-49/12345"). Nenhum token é necessário.
//
// Fluxo por execução (≤150s / Edge Function):
//   1. Processa UM módulo por vez, na ordem (padrão: faf, depois ted).
//   2. Para o módulo corrente, busca até maxPaginas páginas a partir do offset
//      do cursor; só avança para o próximo módulo quando o atual se esgota.
//   3. Normaliza cada item: kind="federal_transfer" (atribuído pela RPC),
//      attributes JSON, sourceUrl.
//   4. Grava em lotes de RPC_BATCH via RPC public.ingest_transferegov (upsert por id).
//   5. Retorna progresso com nextCursor ("modulo:offset") para retomada sem
//      duplicação NEM regressão (o cursor preserva o progresso por módulo).
//
// Idempotente: id = "<modulo>:<id_plano_acao>" — a RPC faz upsert por esse id,
//   portanto rodar de novo na mesma janela não duplica.
//
// Secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — injetados automaticamente pelo Supabase.
//   INGEST_CRON_SECRET                       — opcional; se definido, exige o header
//                                              x-ingest-cron-secret (não o Authorization).
//
// Parâmetros de query (todos opcionais):
//   ?modulos=faf,ted  — módulos a coletar (faf=Fundo a Fundo, ted=TED; default: faf,ted)
//   ?limit=50         — itens por página da API (default 50; máx 500)
//   ?maxPaginas=N     — teto de páginas por módulo (0 = todas; default 5)
//   ?cursor=faf:200   — retoma a partir do offset indicado ("modulo:offset")
//
// Deploy: Edge Functions -> "ingest-transferegov" com verify_jwt = true (igual
//   às demais ingest-*). O cron manda Authorization: Bearer <ANON_KEY>; o segredo
//   OPCIONAL INGEST_CRON_SECRET viaja em header próprio (x-ingest-cron-secret).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidCronSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { extractCnpj, parseDateBrt } from "../_shared/br.ts";

// ── Constantes ────────────────────────────────────────────────────────────────

const BASE_FAF = "https://api.transferegov.gestao.gov.br/fundoafundo";
const BASE_TED = "https://api.transferegov.gestao.gov.br/ted";
const PORTAL = "https://transferegov.gestao.gov.br";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "transferegov-dados-abertos";

// Itens por lote de RPC (≤ 500 conforme regra D1 / Postgres).
const RPC_BATCH = 200;
// Pausa educada entre páginas (ms) — PostgREST governamental.
const RATE_MS = 400;
// Limite padrão de itens por página da API.
const DEFAULT_API_LIMIT = 50;
// Teto padrão de páginas por módulo por execução (para caber em ≤150s).
const DEFAULT_MAX_PAGINAS = 5;

// ── Tipos ─────────────────────────────────────────────────────────────────────

/** Módulos suportados */
type Modulo = "faf" | "ted";

/** Shape do plano_acao no módulo Fundo a Fundo */
interface RawPlanoAcaoFaf {
  id_plano_acao: number;
  codigo_plano_acao?: string | null;
  situacao_plano_acao?: string | null;
  data_inicio_vigencia_plano_acao?: string | null;
  data_fim_vigencia_plano_acao?: string | null;
  objetivos_plano_acao?: string | null;
  diagnostico_plano_acao?: string | null;
  valor_total_plano_acao?: number | null;
  valor_total_repasse_plano_acao?: number | null;
  valor_repasse_emenda_plano_acao?: number | null;
  valor_repasse_especifico_plano_acao?: number | null;
  valor_repasse_voluntario_plano_acao?: number | null;
  valor_saldo_disponivel_plano_acao?: number | null;
  nome_orgao_repassador_plano_acao?: string | null;
  sigla_orgao_repassador_plano_acao?: string | null;
  cnpj_orgao_repassador_plano_acao?: string | null;
  nome_ente_recebedor_plano_acao?: string | null;
  cnpj_ente_recebedor_plano_acao?: string | null;
  uf_ente_recebedor_plano_acao?: string | null;
  nome_municipio_ente_recebedor_plano_acao?: string | null;
  codigo_ibge_municipio_ente_recebedor_plano_acao?: string | null;
  nome_fundo_repassador_plano_acao?: string | null;
  cnpj_fundo_repassador_plano_acao?: string | null;
  nome_fundo_recebedor_plano_acao?: string | null;
  cnpj_fundo_recebedor_plano_acao?: string | null;
  id_programa?: number | null;
  [key: string]: unknown;
}

/** Shape do plano_acao no módulo TED */
interface RawPlanoAcaoTed {
  id_plano_acao: number;
  [key: string]: unknown;
}

/** Item normalizado que vai para a RPC */
interface TransferegovItem {
  id: string;
  sourceId: string;
  modulo: string;
  nome: string;
  cnpj: string | null;
  codigoIbge: string | null;
  municipio: string | null;
  uf: string | null;
  objeto: string;
  orgaoRepassador: string;
  cnpjOrgaoRepassador: string | null;
  orgaoRecebedor: string;
  cnpjOrgaoRecebedor: string | null;
  situacao: string;
  valorTotal: number | null;
  valorRepasse: number | null;
  dataInicio: string;
  dataFim: string;
  codigoPlanoAcao: string;
  sourceUrl: string;
  collectedAt: string;
  raw: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function nullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** URL canônica para o plano no portal Transferegov */
function buildSourceUrl(modulo: Modulo, codigoPlanoAcao: string): string {
  if (!codigoPlanoAcao) return PORTAL;
  const encoded = encodeURIComponent(codigoPlanoAcao);
  if (modulo === "faf") {
    return `${PORTAL}/fundoafundo/plano-acao/${encoded}`;
  }
  return `${PORTAL}/ted/plano-acao/${encoded}`;
}

/** Parseia o Content-Range para extrair total: "0-49/5432" -> 5432; retorna null se ausente. */
function parseTotalFromContentRange(raw: string | null): number | null {
  if (!raw) return null;
  const m = /\/(\d+)$/.exec(raw.trim());
  return m ? Number(m[1]) : null;
}

// ── Normalização ──────────────────────────────────────────────────────────────

function normalizeFaf(
  raw: RawPlanoAcaoFaf,
  collectedAt: string,
): TransferegovItem {
  const id = `faf:${raw.id_plano_acao}`;
  const codigo = trimStr(raw.codigo_plano_acao);
  const orgaoRepassador =
    trimStr(raw.nome_fundo_repassador_plano_acao) ||
    trimStr(raw.nome_orgao_repassador_plano_acao) ||
    trimStr(raw.sigla_orgao_repassador_plano_acao) ||
    "Órgão não informado";
  const cnpjRepassador =
    extractCnpj(raw.cnpj_fundo_repassador_plano_acao) ??
    extractCnpj(raw.cnpj_orgao_repassador_plano_acao);
  const orgaoRecebedor =
    trimStr(raw.nome_ente_recebedor_plano_acao) || "Ente não informado";
  const cnpjRecebedor =
    extractCnpj(raw.cnpj_fundo_recebedor_plano_acao) ??
    extractCnpj(raw.cnpj_ente_recebedor_plano_acao);
  const objeto =
    trimStr(raw.objetivos_plano_acao).slice(0, 500) ||
    trimStr(raw.diagnostico_plano_acao).slice(0, 500) ||
    "Objeto não informado";
  const ibge = trimStr(raw.codigo_ibge_municipio_ente_recebedor_plano_acao) || null;

  return {
    id,
    sourceId: SOURCE_ID,
    modulo: "faf",
    nome: orgaoRecebedor,
    cnpj: cnpjRecebedor,
    codigoIbge: ibge,
    municipio: trimStr(raw.nome_municipio_ente_recebedor_plano_acao) || null,
    uf: trimStr(raw.uf_ente_recebedor_plano_acao) || null,
    objeto,
    orgaoRepassador,
    cnpjOrgaoRepassador: cnpjRepassador,
    orgaoRecebedor,
    cnpjOrgaoRecebedor: cnpjRecebedor,
    situacao: trimStr(raw.situacao_plano_acao) || "Não informada",
    valorTotal: nullableNumber(raw.valor_total_plano_acao),
    valorRepasse: nullableNumber(raw.valor_total_repasse_plano_acao),
    dataInicio: parseDateBrt(raw.data_inicio_vigencia_plano_acao ?? undefined),
    dataFim: parseDateBrt(raw.data_fim_vigencia_plano_acao ?? undefined),
    codigoPlanoAcao: codigo,
    sourceUrl: buildSourceUrl("faf", codigo),
    collectedAt,
    raw: raw as Record<string, unknown>,
  };
}

/** Info do órgão descentralizador (repassador) de um programa TED. */
type ProgramaInfo = { sigla: string; nome: string };

/**
 * Enriquece o cache com os programas referenciados nestes itens TED.
 * O repassador (quem descentraliza o recurso) vive em /ted/programa, ligado por
 * id_programa — buscamos com UMA chamada in.(...) por página (não N por item).
 * Falha de rede é tolerada: o repassador apenas fica "não informado".
 */
async function fetchProgramasInto(
  items: Record<string, unknown>[],
  cache: Map<number, ProgramaInfo>,
): Promise<void> {
  const need = new Set<number>();
  for (const it of items) {
    const idp = Number(it["id_programa"]);
    if (Number.isFinite(idp) && !cache.has(idp)) need.add(idp);
  }
  if (need.size === 0) return;
  const ids = [...need];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const url = `${BASE_TED}/programa?id_programa=in.(${chunk.join(",")})` +
      `&select=id_programa,sigla_unidade_descentralizadora,unidade_descentralizadora`;
    try {
      const res = await fetchWithRetry(url, {
        timeoutMs: 20000,
        retries: 2,
        backoffMs: 800,
        init: { headers: HEADERS },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;
      for (const p of data as Record<string, unknown>[]) {
        const idp = Number(p["id_programa"]);
        if (!Number.isFinite(idp)) continue;
        cache.set(idp, {
          sigla: trimStr(p["sigla_unidade_descentralizadora"]),
          nome: trimStr(p["unidade_descentralizadora"]),
        });
      }
    } catch {
      // graceful: sem repassador para este chunk
    }
  }
}

function normalizeTed(
  raw: RawPlanoAcaoTed,
  collectedAt: string,
  programaCache: Map<number, ProgramaInfo>,
): TransferegovItem {
  // Campos REAIS da API /ted/plano_acao (verificados). TED é descentralização
  // ÓRGÃO->ÓRGÃO federal: não há CNPJ, município nem UF.
  const r = raw as Record<string, unknown>;
  const id = `ted:${raw.id_plano_acao}`;

  // Recebedor = unidade descentralizada (quem recebe/executa o recurso).
  const orgaoRecebedor =
    trimStr(r["unidade_descentralizada"]) ||
    trimStr(r["sigla_unidade_descentralizada"]) ||
    "Unidade não informada";

  // Repassador = unidade descentralizadora do PROGRAMA (join por id_programa).
  const idPrograma = Number(r["id_programa"]);
  const prog = Number.isFinite(idPrograma) ? programaCache.get(idPrograma) : undefined;
  const orgaoRepassador = prog
    ? (prog.nome || prog.sigla || "Órgão não informado")
    : "Órgão não informado";

  const objeto =
    trimStr(r["tx_objeto_plano_acao"]).slice(0, 500) ||
    trimStr(r["tx_justificativa_plano_acao"]).slice(0, 500) ||
    "Objeto não informado";

  const situacao = trimStr(r["tx_situacao_plano_acao"]) || "Não informada";
  const valorTotal = nullableNumber(r["vl_total_plano_acao"]);
  const codigo = String(raw.id_plano_acao);

  return {
    id,
    sourceId: SOURCE_ID,
    modulo: "ted",
    nome: orgaoRecebedor,
    cnpj: null,           // TED não expõe CNPJ
    codigoIbge: null,     // TED não tem município/IBGE
    municipio: null,
    uf: null,
    objeto,
    orgaoRepassador,
    cnpjOrgaoRepassador: null,
    orgaoRecebedor,
    cnpjOrgaoRecebedor: null,
    situacao,
    valorTotal,
    valorRepasse: valorTotal, // valor total descentralizado
    dataInicio: parseDateBrt(r["dt_inicio_vigencia"] as string | undefined),
    dataFim: parseDateBrt(r["dt_fim_vigencia"] as string | undefined),
    codigoPlanoAcao: codigo,
    // URL verificável (API filtrada) — rastreabilidade honesta.
    sourceUrl: `${BASE_TED}/plano_acao?id_plano_acao=eq.${raw.id_plano_acao}`,
    collectedAt,
    raw: r,
  };
}

// ── Fetch de uma página PostgREST ──────────────────────────────────────────────

interface PgRestPage {
  items: Record<string, unknown>[];
  total: number | null;
}

async function fetchPage(
  baseUrl: string,
  endpoint: string,
  limit: number,
  offset: number,
): Promise<PgRestPage> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    order: "id_plano_acao.asc",
  });
  const url = `${baseUrl}/${endpoint}?${params.toString()}`;

  const res = await fetchWithRetry(url, {
    timeoutMs: 20000,
    retries: 3,
    backoffMs: 1000,
    init: { headers: HEADERS },
  });

  if (res.status === 416) {
    // Range Not Satisfiable — offset além do total, dataset esgotado.
    return { items: [], total: 0 };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} em ${url}: ${body.slice(0, 200)}`);
  }

  const contentRange = res.headers.get("content-range");
  const total = parseTotalFromContentRange(contentRange);
  const data = await res.json();
  const items = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

  return { items, total };
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // Auth: o gateway valida o JWT (verify_jwt=true). Defense-in-depth opcional:
  // se INGEST_CRON_SECRET estiver definido, exige o header x-ingest-cron-secret.
  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (cronSecret) {
    if (!hasValidCronSecret(req, cronSecret)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 }, req);
    }
  } else {
    console.warn(
      "[ingest-transferegov] INGEST_CRON_SECRET não definido — função sem segredo de cron.",
    );
  }

  const reqUrl = new URL(req.url);

  // Parâmetros de controle
  const modulosParam = reqUrl.searchParams.get("modulos") ?? "faf,ted";
  const modulosSolicitados = modulosParam
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((m): m is Modulo => m === "faf" || m === "ted");
  const modulos: Modulo[] = modulosSolicitados.length > 0
    ? modulosSolicitados
    : ["faf", "ted"];

  const apiLimit = Math.min(
    500,
    Math.max(1, Number(reqUrl.searchParams.get("limit") ?? DEFAULT_API_LIMIT)),
  );
  const maxPaginasParam = Number(
    reqUrl.searchParams.get("maxPaginas") ?? DEFAULT_MAX_PAGINAS,
  );
  // 0 = ilimitado; negativo trata como 0
  const maxPaginas = maxPaginasParam > 0 ? maxPaginasParam : 0;

  // Cursor de retomada: "faf:200" significa módulo=faf, offset=200
  const cursorParam = reqUrl.searchParams.get("cursor") ?? null;

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const allItems: TransferegovItem[] = [];
    const errors: Array<{ modulo: string; offset: number; error: string }> = [];
    const seen = new Set<string>(); // dedup por id dentro da execução
    const programaCache = new Map<number, ProgramaInfo>(); // repassador TED (id_programa -> órgão)
    let nextCursor: string | null = null;
    let processedPages = 0;

    // Cursor de retomada: "modulo:offset". Módulos ANTES do módulo do cursor já
    // foram concluídos em execuções anteriores -> são pulados. O módulo do cursor
    // recomeça em cursorOffset; módulos posteriores começam em 0. Assim NUNCA
    // reiniciamos um módulo já avançado nem sobrescrevemos o progresso de outro.
    let cursorModulo: string | null = null;
    let cursorOffset = 0;
    if (cursorParam) {
      const [cm, co] = cursorParam.split(":");
      if (cm) cursorModulo = cm.trim().toLowerCase();
      cursorOffset = Math.max(0, Number(co) || 0);
    }
    let startModuloIdx = 0;
    if (cursorModulo) {
      const idx = modulos.indexOf(cursorModulo as Modulo);
      if (idx >= 0) startModuloIdx = idx;
    }

    // maxPaginas é o ORÇAMENTO de páginas desta invocação (0 = ilimitado).
    let budgetLeft = maxPaginas; // só decrementa quando maxPaginas > 0

    // Processa um módulo por vez; só avança quando o atual se esgota.
    outer:
    for (let mi = startModuloIdx; mi < modulos.length; mi++) {
      const modulo = modulos[mi]!;
      const baseUrl = modulo === "faf" ? BASE_FAF : BASE_TED;
      const endpoint = "plano_acao";
      // Só o módulo do cursor recomeça no offset salvo; os demais começam em 0.
      let offset = modulo === cursorModulo ? cursorOffset : 0;

      while (true) {
        // Orçamento de páginas esgotado: salva a posição EXATA e encerra.
        if (maxPaginas > 0 && budgetLeft <= 0) {
          nextCursor = `${modulo}:${offset}`;
          break outer;
        }

        let page: PgRestPage;
        try {
          page = await fetchPage(baseUrl, endpoint, apiLimit, offset);
        } catch (e) {
          // Falha persistente (após retries): salva a posição deste módulo para
          // retomar daqui — não regride, não pula para outro módulo.
          errors.push({ modulo, offset, error: String(e) });
          nextCursor = `${modulo}:${offset}`;
          break outer;
        }

        if (page.items.length === 0) {
          break; // dataset do módulo esgotado -> próximo módulo (offset 0)
        }

        // TED: enriquece o repassador (id_programa -> /ted/programa) em 1 chamada/página.
        if (modulo === "ted") {
          await fetchProgramasInto(page.items, programaCache);
        }

        for (const raw of page.items) {
          try {
            const item = modulo === "faf"
              ? normalizeFaf(raw as RawPlanoAcaoFaf, collectedAt)
              : normalizeTed(raw as RawPlanoAcaoTed, collectedAt, programaCache);
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            allItems.push(item);
          } catch (normErr) {
            // Registro mal formado — registra e continua
            errors.push({ modulo, offset, error: `normalize: ${String(normErr)}` });
          }
        }

        processedPages += 1;
        if (maxPaginas > 0) budgetLeft -= 1;
        offset += page.items.length;

        // Página incompleta = fim do dataset deste módulo.
        if (page.items.length < apiLimit) break;

        if (RATE_MS > 0) await sleep(RATE_MS);
      }
    }

    // Grava em lotes via a RPC (upsert por id — idempotente).
    let ingested = 0;
    for (let i = 0; i < allItems.length; i += RPC_BATCH) {
      const batch = allItems.slice(i, i + RPC_BATCH);
      const rpcBatch = batch.map((item) => ({
        id: item.id,
        sourceId: item.sourceId,
        modulo: item.modulo,
        nome: item.nome,
        cnpj: item.cnpj ?? "",
        codigoIbge: item.codigoIbge ?? "",
        municipio: item.municipio ?? "",
        uf: item.uf ?? "",
        objeto: item.objeto,
        orgaoRepassador: item.orgaoRepassador,
        cnpjOrgaoRepassador: item.cnpjOrgaoRepassador ?? "",
        orgaoRecebedor: item.orgaoRecebedor,
        cnpjOrgaoRecebedor: item.cnpjOrgaoRecebedor ?? "",
        situacao: item.situacao,
        valorTotal: item.valorTotal,
        valorRepasse: item.valorRepasse,
        dataInicio: item.dataInicio,
        dataFim: item.dataFim,
        codigoPlanoAcao: item.codigoPlanoAcao,
        sourceUrl: item.sourceUrl,
        collectedAt: item.collectedAt,
        raw: item.raw,
      }));

      const { data, error } = await supabase.rpc("ingest_transferegov", {
        p_payload: { collectedAt, items: rpcBatch },
      });
      if (error) {
        // Falha de RPC é fatal (não silenciada)
        return jsonResponse(
          { ok: false, error: `RPC ingest_transferegov: ${error.message}`, processed: ingested, errors },
          { status: 500 },
          req,
        );
      }
      ingested += typeof data === "number" ? data : batch.length;
    }

    // Amostra dos primeiros 3 itens para facilitar inspeção no manifest
    const sample = allItems.slice(0, 3).map((item) => ({
      id: item.id,
      nome: item.nome,
      objeto: item.objeto.slice(0, 120),
      uf: item.uf,
      municipio: item.municipio,
      valorTotal: item.valorTotal,
      situacao: item.situacao,
      sourceUrl: item.sourceUrl,
    }));

    return jsonResponse(
      {
        ok: true,
        fonte: "Transferegov / +Brasil — Dados Abertos",
        modulos,
        processedPages,
        processed: allItems.length,
        ingested,
        errors,
        nextCursor,
        sample,
      },
      {},
      req,
    );
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, { status: 500 }, req);
  }
});
