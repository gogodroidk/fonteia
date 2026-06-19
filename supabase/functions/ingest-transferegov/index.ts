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
//   1. Varre os módulos requisitados (padrão: faf,ted) em sequência.
//   2. Para cada módulo, busca até maxPaginas páginas a partir de ?offset= cursor.
//   3. Normaliza cada item: kind="public_contract", attributes JSON, sourceUrl.
//   4. Grava em lotes de RPC_BATCH via RPC public.ingest_transferegov (upsert por id).
//   5. Retorna progresso parcial com nextCursor para retomada sem duplicação.
//
// Idempotente: id = "<modulo>:<id_plano_acao>" — a RPC faz upsert por esse id,
//   portanto rodar de novo na mesma janela não duplica.
//
// Secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — injetados automaticamente pelo Supabase.
//   INGEST_CRON_SECRET                       — opcional; se definido, exige Bearer correspondente.
//
// Parâmetros de query (todos opcionais):
//   ?modulos=faf,ted  — módulos a coletar (faf=Fundo a Fundo, ted=TED; default: faf,ted)
//   ?limit=50         — itens por página da API (default 50; máx 500)
//   ?maxPaginas=N     — teto de páginas por módulo (0 = todas; default 5)
//   ?cursor=faf:200   — retoma a partir do offset indicado ("modulo:offset")
//
// Deploy: Edge Functions -> "ingest-transferegov". Verify JWT LIGADO
//   (o cron/admin manda Authorization com o INGEST_CRON_SECRET, igual às outras).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
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

function normalizeTed(
  raw: RawPlanoAcaoTed,
  collectedAt: string,
): TransferegovItem {
  // TED plano_acao tem estrutura diferente — campo names distintos.
  // O modelo real tem campos prefixados de forma diferente; normalizamos
  // de modo defensivo lendo qualquer key presente.
  const r = raw as Record<string, unknown>;
  const id = `ted:${raw.id_plano_acao}`;
  const codigo =
    trimStr(r["codigo_plano_acao"]) ||
    trimStr(r["tx_numero_instrumento"]) ||
    String(raw.id_plano_acao);

  const orgaoRepassador =
    trimStr(r["nome_orgao_descentralizador"]) ||
    trimStr(r["sigla_orgao_descentralizador"]) ||
    "Órgão não informado";
  const cnpjRepassador = extractCnpj(r["cnpj_orgao_descentralizador"] as string);

  const orgaoRecebedor =
    trimStr(r["nome_unidade_descentralizada"]) ||
    trimStr(r["nome_ente_recebedor"]) ||
    "Ente não informado";
  const cnpjRecebedor = extractCnpj(
    (r["cnpj_unidade_descentralizada"] ?? r["cnpj_ente_recebedor"]) as string,
  );

  const objeto =
    trimStr(r["objeto_plano_acao"]).slice(0, 500) ||
    trimStr(r["objetivos_plano_acao"]).slice(0, 500) ||
    trimStr(r["tx_objeto"]).slice(0, 500) ||
    "Objeto não informado";

  const ibge =
    trimStr(r["codigo_ibge_municipio"] ?? r["cod_ibge_municipio"]) || null;
  const municipio =
    trimStr(r["nome_municipio"] ?? r["nm_municipio"]) || null;
  const uf = trimStr(r["uf"] ?? r["sigla_uf"]) || null;

  const valorTotal = nullableNumber(
    r["valor_total_plano_acao"] ?? r["vl_global"],
  );
  const valorRepasse = nullableNumber(
    r["valor_repasse_plano_acao"] ?? r["vl_repasse"],
  );

  return {
    id,
    sourceId: SOURCE_ID,
    modulo: "ted",
    nome: orgaoRecebedor,
    cnpj: cnpjRecebedor,
    codigoIbge: ibge,
    municipio,
    uf,
    objeto,
    orgaoRepassador,
    cnpjOrgaoRepassador: cnpjRepassador,
    orgaoRecebedor,
    cnpjOrgaoRecebedor: cnpjRecebedor,
    situacao:
      trimStr(r["situacao_plano_acao"] ?? r["tx_situacao"]) || "Não informada",
    valorTotal,
    valorRepasse,
    dataInicio: parseDateBrt(
      (r["data_inicio_vigencia_plano_acao"] ??
        r["dt_inicio_vigencia"]) as string | undefined,
    ),
    dataFim: parseDateBrt(
      (r["data_fim_vigencia_plano_acao"] ??
        r["dt_fim_vigencia"]) as string | undefined,
    ),
    codigoPlanoAcao: codigo,
    sourceUrl: buildSourceUrl("ted", codigo),
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

  // Defense-in-depth: se INGEST_CRON_SECRET estiver definido, exige Bearer correspondente.
  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (cronSecret) {
    if (!hasValidBearerSecret(req, cronSecret)) {
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
    let nextCursor: string | null = null;
    let processedPages = 0;

    for (const modulo of modulos) {
      // Calcula offset inicial a partir do cursor
      let startOffset = 0;
      if (cursorParam) {
        const [cursorModulo, cursorOffset] = cursorParam.split(":");
        if (cursorModulo === modulo && cursorOffset) {
          startOffset = Number(cursorOffset) || 0;
        }
      }

      const baseUrl = modulo === "faf" ? BASE_FAF : BASE_TED;
      const endpoint = "plano_acao";
      let offset = startOffset;
      let paginasDesse = 0;
      let totalKnown: number | null = null;

      while (true) {
        // Respeita o teto de páginas por módulo (0 = ilimitado)
        if (maxPaginas > 0 && paginasDesse >= maxPaginas) {
          // Há mais dados — registra nextCursor para retomada
          nextCursor = `${modulo}:${offset}`;
          break;
        }

        let page: PgRestPage;
        try {
          page = await fetchPage(baseUrl, endpoint, apiLimit, offset);
        } catch (e) {
          errors.push({ modulo, offset, error: String(e) });
          break; // Não insiste nesse módulo se a página falhou
        }

        if (totalKnown === null && page.total !== null) {
          totalKnown = page.total;
        }

        if (page.items.length === 0) {
          // Dataset esgotado para este módulo
          break;
        }

        for (const raw of page.items) {
          try {
            let item: TransferegovItem;
            if (modulo === "faf") {
              item = normalizeFaf(raw as RawPlanoAcaoFaf, collectedAt);
            } else {
              item = normalizeTed(raw as RawPlanoAcaoTed, collectedAt);
            }
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            allItems.push(item);
          } catch (normErr) {
            // Registro mal formado — registra e continua
            errors.push({
              modulo,
              offset,
              error: `normalize: ${String(normErr)}`,
            });
          }
        }

        processedPages += 1;
        offset += page.items.length;

        // Se a página veio incompleta, chegamos ao fim do dataset
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
