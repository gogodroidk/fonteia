// =============================================================================
// source-health.ts — saúde REAL das fontes da página /sources.
//
// Em vez de pintar "conectado" a partir de um mapa hardcoded, derivamos o status
// de cada fonte da última coleta registrada em public.source_runs. A leitura é
// feita pela RPC pública, agregada e somente-leitura `source_health()`
// (infra/migrations/0021_source_health_public_rpc.sql) — a tabela source_runs
// não é legível por anon sob RLS.
//
// Regra de ouro: SEM dado de saúde → "sem dados de saúde" (nunca "conectado").
// =============================================================================

import type { PublicSource, SourceStatus } from "@fonteia/domain";
import { getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";

// ---------------------------------------------------------------------------
// Formato cru devolvido pela RPC source_health() (PostgREST /rpc).
// Campos podem vir null quando a fonte nunca teve sucesso.
// ---------------------------------------------------------------------------
interface SourceHealthRow {
  source_id: string;
  last_success_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_inserted: number | null;
  success_runs: number | null;
}

/** Saúde já normalizada de uma fonte do catálogo. */
export interface SourceHealth {
  /** Verde = saudável e recente; amarelo = obsoleto/instável; vermelho = falhando; cinza = sem dados. */
  level: "green" | "yellow" | "red" | "unknown";
  /** Status efetivo a exibir no badge — derivado da realidade, não hardcoded. */
  effectiveStatus: SourceStatus;
  /** ISO da última coleta bem-sucedida (se houver). */
  lastSuccessAt?: string;
  /** ISO da coleta mais recente de qualquer status (se houver). */
  lastRunAt?: string;
  /** Registros gravados na última coleta de sucesso. */
  lastInserted?: number;
  /** Total de coletas bem-sucedidas — sinal de maturidade. */
  successRuns?: number;
  /** Frase curta e honesta para o usuário leigo. */
  note: string;
}

export type SourceHealthMap = Record<string, SourceHealth>;

// ---------------------------------------------------------------------------
// Mapeamento catálogo (packages/sources) -> source_id(s) usados em source_runs.
//
// Os coletores gravam em source_runs.source_id com chaves internas que NEM
// sempre batem com o id do catálogo. Quando uma fonte do catálogo é alimentada
// por mais de um coletor (ex.: PNCP = contratações + contratos), listamos todos
// e a saúde agregada usa a MAIS RECENTE entre eles.
//
// Fontes sem coletor conhecido ficam de fora deste mapa -> aparecem como
// "sem dados de saúde" (honesto: não há coleta registrada para elas).
// ---------------------------------------------------------------------------
const CATALOG_TO_RUN_SOURCE_IDS: Record<string, string[]> = {
  "receita-leiloes-sle": ["receita-leiloes-sle"],
  "pncp-consulta": ["pncp-contratacoes", "pncp-contratos"],
  "compras-gov-dados-abertos": ["orgaos-publicos"], // órgãos públicos (Compras.gov) → PNCP
  "portal-transparencia-api": ["portal-transparencia-api"],
  "camara-dados-abertos": ["camara-dados-abertos"],
  "senado-dados-abertos": ["senado-dados-abertos"],
  "cnj-datajud": ["cnj-datajud"],
  "inpi-dados-abertos": ["inpi-dados-abertos"],
  "ibama-dados-abertos": ["ibama-dados-abertos"],
  "dados-prefeitura-sp-ckan": ["sp-capital-contratos"],
  // ── sem coletor próprio em source_runs (ficam "sem dados de saúde") ──
  // tse-dados-abertos, inpe-terrabrasilis, inpe-queimadas, mapbiomas-alerta,
  // ana-hidrowebservice, tesouro-siconfi, transferegov-dados-abertos,
  // bndes-dados-abertos, dados-gov-br-ckan, dou-inlabs.
  //
  // NOTA: ibge-localidades / tce-sp existem em source_runs mas não têm entrada
  // própria no catálogo público; entram no Cérebro/módulos por outras vias.
};

/** Limiar de frescor (em dias) por cadência declarada no catálogo. */
function freshnessWindowDays(cadence: PublicSource["refreshCadence"]): number {
  switch (cadence) {
    case "realtime":
    case "hourly":
      return 2;
    case "daily":
      return 4;
    case "weekly":
      return 10;
    case "monthly":
      return 45;
    case "manual":
    case "unknown":
    default:
      return 120;
  }
}

function daysSince(iso: string, now: number): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (now - t) / 86_400_000;
}

/** "há 3 dias", "ontem", "hoje" — rótulo humano, pt-BR, sem libs. */
export function humanizeAge(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months === 1) return "há 1 mês";
  if (months < 12) return `há ${months} meses`;
  const years = Math.floor(days / 365);
  return years === 1 ? "há 1 ano" : `há ${years} anos`;
}

/** Data curta dd/mm/aaaa para tooltip. */
export function shortDate(iso: string | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Derivação pura: catálogo + linha(s) de saúde -> SourceHealth.
// Exportada para teste e reuso. NÃO faz I/O.
// ---------------------------------------------------------------------------
export function deriveHealth(
  source: PublicSource,
  rows: SourceHealthRow[],
  now: number = Date.now(),
): SourceHealth {
  // Agrega múltiplos coletores: pega a coleta de sucesso e a coleta mais recentes.
  let lastSuccessAt: string | undefined;
  let lastRunAt: string | undefined;
  let lastStatus: string | undefined;
  let lastInserted: number | undefined;
  let successRuns = 0;
  let mostRecentRunMs = -Infinity;

  for (const row of rows) {
    if (row.last_success_at) {
      if (!lastSuccessAt || Date.parse(row.last_success_at) > Date.parse(lastSuccessAt)) {
        lastSuccessAt = row.last_success_at;
        if (typeof row.last_inserted === "number") lastInserted = row.last_inserted;
      }
    }
    if (row.last_run_at) {
      const ms = Date.parse(row.last_run_at);
      if (!lastRunAt || ms > Date.parse(lastRunAt)) lastRunAt = row.last_run_at;
      // O status "mais recente" é o do coletor cuja última coleta é a mais nova.
      if (ms > mostRecentRunMs) {
        mostRecentRunMs = ms;
        lastStatus = row.last_status ?? undefined;
      }
    }
    if (typeof row.success_runs === "number") successRuns += row.success_runs;
  }

  // ── 1. Nenhum dado de saúde: NUNCA "conectado". ───────────────────────────
  if (!lastRunAt && !lastSuccessAt) {
    return {
      level: "unknown",
      effectiveStatus: source.status,
      note: "Sem dados de saúde — nenhuma coleta registrada para esta fonte.",
    };
  }

  const base = {
    ...(lastSuccessAt ? { lastSuccessAt } : {}),
    ...(lastRunAt ? { lastRunAt } : {}),
    ...(typeof lastInserted === "number" ? { lastInserted } : {}),
    successRuns,
  };

  // ── 2. Já rodou, mas nunca teve sucesso → falha real. ─────────────────────
  if (!lastSuccessAt) {
    return {
      ...base,
      level: "red",
      effectiveStatus: source.status,
      note: "Coletas registradas, mas nenhuma concluída com sucesso.",
    };
  }

  const ageDays = daysSince(lastSuccessAt, now);
  const windowDays = freshnessWindowDays(source.refreshCadence);
  const fresh = ageDays <= windowDays;
  // "Tolerância" antes do vermelho: stale por mais de 3x a janela = crítico.
  const veryStale = ageDays > windowDays * 3;
  const lastFailed = lastStatus === "failed";

  // ── 3. Última coleta falhou (mesmo com sucessos no passado). ──────────────
  if (lastFailed) {
    return {
      ...base,
      level: fresh ? "yellow" : "red",
      // Frágil continua frágil; estável que falhou agora some do "conectado".
      effectiveStatus: source.reliability === "official_fragile" ? "fragile_operational" : source.status,
      note: `Última coleta falhou; último sucesso ${humanizeAge(lastSuccessAt, now)}.`,
    };
  }

  // ── 4. Sucesso recente → saudável (VERDE). ────────────────────────────────
  if (fresh) {
    // Reliability frágil = honesto manter "operacional frágil" (sem API oficial),
    // mesmo saudável. Demais: conectado de verdade, comprovado pela coleta.
    const effectiveStatus: SourceStatus =
      source.reliability === "official_fragile" ? "fragile_operational" : "connected";
    return {
      ...base,
      level: "green",
      effectiveStatus,
      note: `Coleta saudável — última atualização ${humanizeAge(lastSuccessAt, now)}.`,
    };
  }

  // ── 5. Sucesso antigo → degradado (AMARELO/VERMELHO conforme idade). ───────
  return {
    ...base,
    level: veryStale ? "red" : "yellow",
    // Não promovemos a "conectado" algo obsoleto; preservamos o status do catálogo.
    effectiveStatus: source.reliability === "official_fragile" ? "fragile_operational" : source.status,
    note: `Sem coleta recente — último sucesso ${humanizeAge(lastSuccessAt, now)}.`,
  };
}

// ---------------------------------------------------------------------------
// Fetch + montagem do mapa de saúde para todo o catálogo.
// Chama a RPC pública source_health() via PostgREST. Falhas de rede NÃO
// derrubam a página: retornamos {} e a UI cai para "sem dados de saúde".
// ---------------------------------------------------------------------------
export async function fetchSourceHealth(
  catalog: PublicSource[],
  fetcher: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<SourceHealthMap> {
  const { url, key } = getSupabasePublicConfig();

  let rows: SourceHealthRow[] = [];
  try {
    const response = await fetcher(`${trimTrailingSlash(url)}/rest/v1/rpc/source_health`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      body: "{}",
    });
    if (!response.ok) {
      // 404 = migration 0021 ainda não aplicada; outros = transitório. Em ambos,
      // a UI mostra "sem dados de saúde" — honesto e sem crashar.
      console.warn(`[source-health] RPC source_health retornou ${response.status}`);
      return {};
    }
    const body = (await response.json()) as unknown;
    if (Array.isArray(body)) rows = body as SourceHealthRow[];
  } catch (error) {
    console.warn("[source-health] falha ao consultar source_health:", error);
    return {};
  }

  // Indexa por source_id de coleta para junção rápida.
  const byRunId = new Map<string, SourceHealthRow>();
  for (const row of rows) {
    if (row && typeof row.source_id === "string") byRunId.set(row.source_id, row);
  }

  const map: SourceHealthMap = {};
  for (const source of catalog) {
    const runIds = CATALOG_TO_RUN_SOURCE_IDS[source.id] ?? [];
    const matched = runIds.map((id) => byRunId.get(id)).filter((r): r is SourceHealthRow => Boolean(r));
    map[source.id] = deriveHealth(source, matched, now);
  }
  return map;
}
