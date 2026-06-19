// Supabase Edge Function: "ingest-camara-despesas"
// Ingestão de DESPESAS DO CEAP (Cota para o Exercício da Atividade Parlamentar)
// dos Deputados Federais — Câmara dos Deputados Dados Abertos.
//
// Fonte: API pública de Dados Abertos da Câmara (sem auth, sem chave):
//   Base: https://dadosabertos.camara.leg.br/api/v2
//   GET /deputados?ordem=ASC&ordenarPor=nome
//       Paginação HATEOAS rel="next"
//   GET /deputados/{id}/despesas?ano={ano}&pagina={n}&itens=100
//
// Fluxo:
//   1. Varre todos os deputados (paginação rel="next"), aplicando filtros uf/maxDeputados.
//   2. Para cada deputado, busca suas despesas do ano (paginação ?pagina=N), aplicando
//      maxPaginasDespesas.
//   3. Dedup por codDocumento dentro da execução (Set<string>).
//   4. Normaliza cada despesa e grava em lotes de RPC_BATCH via a RPC
//      public.ingest_camara_despesas.
//   5. Degradação elegante: erro em página/deputado -> registra em errors[], continua.
//
// Idempotente: id = codDocumento (string) — a RPC faz upsert por índice único parcial,
// portanto reexecuções não duplicam registros.
//
// Secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — injetados automaticamente pelo Supabase.
//   INGEST_CRON_SECRET — opcional; se definido, exige Bearer correspondente.
//
// Parâmetros de query (todos opcionais):
//   ?ano=YYYY              — ano a coletar (default: ano corrente)
//   ?maxDeputados=N        — teto de deputados a processar (0 = todos; default 0)
//   ?maxPaginasDespesas=N  — teto de páginas de despesas por deputado (0 = todas; default 10)
//   ?uf=XX                 — filtra deputados por UF (ex.: SP, RJ)
//
// Deploy: Edge Functions -> "ingest-camara-despesas". Verify JWT LIGADO
// (o cron/admin manda Authorization, igual às outras).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { extractCnpj, parseDateBrt } from "../_shared/br.ts";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "camara-dados-abertos";

// Lotes menores pois despesas têm payloads maiores que entidades simples.
const RPC_BATCH = 100;
// Pausa educada entre páginas — a API da Câmara é pública mas temperamental.
const RATE_MS = 300;

// Teto de páginas de despesas por deputado quando ?maxPaginasDespesas não for fornecido.
const DEFAULT_MAX_PAGINAS_DESPESAS = 10;

// ── Tipos da API da Câmara ─────────────────────────────────────────────────

interface CamaraLink {
  rel: string;
  href: string;
}

interface RawDeputado {
  id: number;
  nome: string;
  siglaPartido?: string;
  siglaUf?: string;
  urlFoto?: string;
  email?: string;
}

interface CamaraPageDeputados {
  dados?: RawDeputado[];
  links?: CamaraLink[];
}

interface RawDespesa {
  ano?: number;
  mes?: number;
  tipoDespesa?: string;
  codDocumento?: number | string;
  tipoDocumento?: string;
  codTipoDocumento?: number;
  dataDocumento?: string;
  numDocumento?: string;
  valorDocumento?: number;
  urlDocumento?: string;
  nomeFornecedor?: string;
  cnpjCpfFornecedor?: string;
  valorLiquido?: number;
  valorGlosa?: number;
  numRessarcimento?: string;
  codLote?: number;
  parcela?: number;
}

interface CamaraPageDespesas {
  dados?: RawDespesa[];
  links?: CamaraLink[];
}

// ── Helpers HATEOAS ────────────────────────────────────────────────────────

function nextLink(links: CamaraLink[] | undefined): string | null {
  const next = (links ?? []).find((l) => l.rel === "next");
  return next?.href ?? null;
}

// ── Fetch genérico com retry ───────────────────────────────────────────────

async function getJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url, {
    timeoutMs: 20000,
    retries: 3,
    backoffMs: 800,
    init: { headers: HEADERS },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return (await res.json()) as T;
}

// ── Coleta de deputados (paginação HATEOAS) ────────────────────────────────

function deputadosUrl(uf: string | null): string {
  const params = new URLSearchParams({ ordem: "ASC", ordenarPor: "nome" });
  if (uf) params.set("siglaUf", uf);
  return `${BASE}/deputados?${params.toString()}`;
}

async function fetchDeputados(
  uf: string | null,
  maxDeputados: number,
): Promise<RawDeputado[]> {
  const deputados: RawDeputado[] = [];
  let target: string | null = deputadosUrl(uf);

  while (target) {
    const page = await getJson<CamaraPageDeputados>(target);
    for (const d of page.dados ?? []) {
      if (d?.id == null) continue;
      deputados.push(d);
      if (maxDeputados > 0 && deputados.length >= maxDeputados) return deputados;
    }
    if ((page.dados ?? []).length === 0) break;
    target = nextLink(page.links);
    if (target && RATE_MS > 0) await sleep(RATE_MS);
  }
  return deputados;
}

// ── Coleta de despesas de um deputado ─────────────────────────────────────

async function fetchDespesas(
  deputadoId: number,
  ano: number,
  maxPaginas: number,
): Promise<RawDespesa[]> {
  const despesas: RawDespesa[] = [];
  let pagina = 0;

  while (true) {
    pagina += 1;
    const params = new URLSearchParams({
      ano: String(ano),
      pagina: String(pagina),
      itens: "100",
    });
    const url = `${BASE}/deputados/${deputadoId}/despesas?${params.toString()}`;
    const page = await getJson<CamaraPageDespesas>(url);
    const dados = page.dados ?? [];
    despesas.push(...dados);
    if (dados.length === 0) break;
    // A API da Câmara retorna link "next" apenas se há mais páginas.
    const hasNext = nextLink(page.links) !== null;
    if (!hasNext) break;
    if (maxPaginas > 0 && pagina >= maxPaginas) break;
    if (RATE_MS > 0) await sleep(RATE_MS);
  }
  return despesas;
}

// ── Normalização ───────────────────────────────────────────────────────────

interface NormalizedDespesa {
  id: string;
  sourceId: string;
  deputadoId: string;
  deputadoNome: string;
  partido: string;
  uf: string;
  tipo: string;
  fornecedor: string;
  cnpjFornecedor: string | null;
  valorDocumento: number | null;
  valorLiquido: number | null;
  valorGlosa: number | null;
  dataDocumento: string;
  ano: number | null;
  mes: number | null;
  urlDocumento: string;
  numDocumento: string;
  numRessarcimento: string;
}

function normalizeDespesa(
  raw: RawDespesa,
  deputado: RawDeputado,
): NormalizedDespesa {
  const id = String(raw.codDocumento ?? "");
  return {
    id,
    sourceId: SOURCE_ID,
    deputadoId: String(deputado.id),
    deputadoNome: (deputado.nome ?? "").trim(),
    partido: (deputado.siglaPartido ?? "").trim(),
    uf: (deputado.siglaUf ?? "").trim(),
    tipo: (raw.tipoDespesa ?? "").trim(),
    fornecedor: (raw.nomeFornecedor ?? "").trim(),
    cnpjFornecedor: extractCnpj(raw.cnpjCpfFornecedor ?? ""),
    valorDocumento: raw.valorDocumento != null ? raw.valorDocumento : null,
    valorLiquido: raw.valorLiquido != null ? raw.valorLiquido : null,
    valorGlosa: raw.valorGlosa != null ? raw.valorGlosa : null,
    dataDocumento: parseDateBrt(raw.dataDocumento ?? ""),
    ano: raw.ano ?? null,
    mes: raw.mes ?? null,
    urlDocumento: (raw.urlDocumento ?? "").trim(),
    numDocumento: (raw.numDocumento ?? "").trim(),
    numRessarcimento: (raw.numRessarcimento ?? "").trim(),
  };
}

// ── HTTP handler ───────────────────────────────────────────────────────────

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
    console.warn("[ingest-camara-despesas] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const reqUrl = new URL(req.url);
  const anoParam = Number(reqUrl.searchParams.get("ano") ?? "0");
  const ano = anoParam > 0 ? anoParam : new Date().getFullYear();
  const maxDeputados = Number(reqUrl.searchParams.get("maxDeputados") ?? "0"); // 0 = todos
  const maxPaginasDespesas = Number(reqUrl.searchParams.get("maxPaginasDespesas") ?? "0") ||
    DEFAULT_MAX_PAGINAS_DESPESAS;
  const ufFilter = (reqUrl.searchParams.get("uf") ?? "").trim().toUpperCase() || null;

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Lista completa de deputados, aplicando filtros uf/maxDeputados.
    const deputados = await fetchDeputados(ufFilter, maxDeputados);

    const items: NormalizedDespesa[] = [];
    const seen = new Set<string>(); // dedup por codDocumento dentro da execução
    const errors: Array<{ deputadoId: number; deputadoNome: string; pagina?: number; error: string }> = [];

    // 2) Para cada deputado, coleta as despesas do ano.
    for (const deputado of deputados) {
      try {
        const despesasRaw = await fetchDespesas(deputado.id, ano, maxPaginasDespesas);
        for (const raw of despesasRaw) {
          const id = String(raw.codDocumento ?? "");
          if (!id || seen.has(id)) continue;
          seen.add(id);
          items.push(normalizeDespesa(raw, deputado));
        }
      } catch (e) {
        errors.push({
          deputadoId: deputado.id,
          deputadoNome: deputado.nome,
          error: String(e),
        });
        // Degradação elegante: continua com os próximos deputados.
      }
    }

    // 3) Grava em lotes via a RPC.
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_camara_despesas", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    return jsonResponse({
      ok: true,
      ano,
      uf: ufFilter ?? null,
      deputados: deputados.length,
      coletados: items.length,
      ingested,
      errors,
    }, {}, req);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, { status: 500 }, req);
  }
});
