// =============================================================================
// precos-historicos-api.ts — referência de preço a partir de lotes ENCERRADOS.
//
// Consome a RPC pública, somente-leitura `auction_price_intelligence`, que
// agrega lotes de leilão JÁ ENCERRADOS por categoria (e, opcionalmente, por
// cidade/UF) e devolve faixas de lance mínimo, avaliação e — quando publicado —
// o VALOR REAL DE ARREMATE. Isso responde, com dado oficial, "por quanto lotes
// parecidos encerrados realmente saíram".
//
// Mesmo padrão de fetch + degradação graciosa de source-health.ts e
// lotes-parecidos-api.ts: qualquer falha (rede, 404, ok=false, n=0) devolve
// `null` e a seção some da tela — nunca crasha, nunca inventa número.
//
// Valores monetários permanecem em CENTAVOS (sufixo *Cents/*_cents), como no
// resto do módulo de leilões; a formatação para BRL acontece na UI.
// =============================================================================

import { getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";

// ---------------------------------------------------------------------------
// Forma normalizada (em centavos) já pronta para a UI.
// ---------------------------------------------------------------------------

/** Faixa de cinco números (min..max + quartis) de um conjunto de valores, em centavos. */
export interface PrecoFaixa {
  /** Quantos lotes entraram nesta faixa. */
  n: number;
  minCents: number;
  p25Cents: number;
  medianCents: number;
  p75Cents: number;
  maxCents: number;
}

/** Faixa reduzida (sem quartis) — usada para o arremate real. */
export interface PrecoFaixaArremate {
  n: number;
  minCents: number;
  medianCents: number;
  maxCents: number;
}

/** Estatísticas agregadas de lotes encerrados parecidos. Tudo derivado da RPC. */
export interface PrecoHistoricoStats {
  /** Categoria consultada (eco do parâmetro). */
  category: string;
  /** Cidade consultada, quando filtrada. */
  city?: string;
  /** UF consultada, quando filtrada. */
  uf?: string;
  /** Janela de tempo considerada, em meses. */
  months: number;
  /** Total de lotes encerrados encontrados na categoria. */
  n: number;
  /** Quantos desses têm valor de arremate publicado. */
  nWithFinal: number;
  /** Faixa do lance mínimo (sempre presente quando n>0). */
  minimumBid: PrecoFaixa | null;
  /** Faixa da avaliação oficial. */
  appraisal: PrecoFaixa | null;
  /** Faixa do arremate REAL — null quando nWithFinal===0 (sem venda publicada). */
  finalValue: PrecoFaixaArremate | null;
}

/** Um lote encerrado de amostra — auditável via `sourceUrl`. */
export interface PrecoHistoricoSample {
  receitaLotId: string;
  title: string;
  category?: string;
  city?: string;
  minimumBidCents?: number;
  appraisalCents?: number;
  /** Valor real de arremate, quando publicado. */
  finalValueCents?: number;
  /** ISO do encerramento, quando disponível. */
  closedAt?: string;
  /** Link para a fonte oficial (Receita Federal SLE). */
  sourceUrl?: string;
  contentHash?: string;
}

/** Citação da fonte oficial — rastreabilidade obrigatória. */
export interface PrecoHistoricoCitation {
  sourceId?: string;
  sourceName: string;
  note?: string;
}

/** Resultado normalizado e pronto para renderizar. */
export interface PrecoHistoricoResult {
  stats: PrecoHistoricoStats;
  sample: PrecoHistoricoSample[];
  citation: PrecoHistoricoCitation;
}

// ---------------------------------------------------------------------------
// Forma crua devolvida pela RPC (centavos, snake_case). Campos podem faltar.
// ---------------------------------------------------------------------------

interface RawFaixa {
  n?: number | null;
  min?: number | null;
  p25?: number | null;
  median?: number | null;
  p75?: number | null;
  max?: number | null;
}

interface RawStats {
  category?: string | null;
  category_norm?: string | null;
  city?: string | null;
  uf?: string | null;
  months?: number | null;
  n?: number | null;
  n_with_final?: number | null;
  minimum_bid?: RawFaixa | null;
  appraisal?: RawFaixa | null;
  final_value?: RawFaixa | null;
}

interface RawSample {
  receita_lot_id?: string | null;
  title?: string | null;
  category?: string | null;
  city?: string | null;
  minimum_bid_cents?: number | null;
  appraisal_cents?: number | null;
  final_value_cents?: number | null;
  closed_at?: string | null;
  source_url?: string | null;
  content_hash?: string | null;
}

interface RawCitation {
  source_id?: string | null;
  source_name?: string | null;
  note?: string | null;
}

interface RawResponse {
  ok?: boolean;
  stats?: RawStats | null;
  sample?: RawSample[] | null;
  citation?: RawCitation | null;
}

// ---------------------------------------------------------------------------
// Helpers de normalização — puros, defensivos contra null/NaN.
// ---------------------------------------------------------------------------

/** Número finito ≥ 0 ou undefined (rejeita null, NaN, negativos). */
function nonNegInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Valor monetário em centavos: número finito > 0 ou undefined. */
function moneyCents(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** String não-vazia ou undefined. */
function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** Normaliza a faixa de cinco números; null quando não há amostra utilizável. */
function normalizeFaixa(raw: RawFaixa | null | undefined): PrecoFaixa | null {
  if (!raw || typeof raw !== "object") return null;
  const n = nonNegInt(raw.n) ?? 0;
  const min = moneyCents(raw.min);
  const median = moneyCents(raw.median);
  const max = moneyCents(raw.max);
  // Sem mediana ou sem amostra → faixa inútil.
  if (n <= 0 || min === undefined || median === undefined || max === undefined) return null;
  // Quartis caem para os extremos quando ausentes (faixa ainda honesta).
  return {
    n,
    minCents: min,
    p25Cents: moneyCents(raw.p25) ?? min,
    medianCents: median,
    p75Cents: moneyCents(raw.p75) ?? max,
    maxCents: max,
  };
}

/** Normaliza a faixa do arremate (sem quartis); null quando não há venda. */
function normalizeFaixaArremate(raw: RawFaixa | null | undefined): PrecoFaixaArremate | null {
  if (!raw || typeof raw !== "object") return null;
  const n = nonNegInt(raw.n) ?? 0;
  const min = moneyCents(raw.min);
  const median = moneyCents(raw.median);
  const max = moneyCents(raw.max);
  if (n <= 0 || min === undefined || median === undefined || max === undefined) return null;
  return { n, minCents: min, medianCents: median, maxCents: max };
}

/** Normaliza um lote de amostra; só inclui chaves opcionais quando há valor (exactOptionalPropertyTypes). */
function normalizeSample(raw: RawSample): PrecoHistoricoSample | null {
  if (!raw || typeof raw !== "object") return null;
  const receitaLotId = nonEmpty(raw.receita_lot_id);
  if (!receitaLotId) return null;
  const title = nonEmpty(raw.title) ?? "Lote encerrado";
  const category = nonEmpty(raw.category);
  const city = nonEmpty(raw.city);
  const minimumBidCents = moneyCents(raw.minimum_bid_cents);
  const appraisalCents = moneyCents(raw.appraisal_cents);
  const finalValueCents = moneyCents(raw.final_value_cents);
  const closedAt = nonEmpty(raw.closed_at);
  const sourceUrl = nonEmpty(raw.source_url);
  const contentHash = nonEmpty(raw.content_hash);
  return {
    receitaLotId,
    title,
    ...(category ? { category } : {}),
    ...(city ? { city } : {}),
    ...(minimumBidCents !== undefined ? { minimumBidCents } : {}),
    ...(appraisalCents !== undefined ? { appraisalCents } : {}),
    ...(finalValueCents !== undefined ? { finalValueCents } : {}),
    ...(closedAt ? { closedAt } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(contentHash ? { contentHash } : {}),
  };
}

/** Transforma o JSON cru da RPC no resultado normalizado; null se inutilizável. */
function normalize(raw: RawResponse, fallbackCategory: string): PrecoHistoricoResult | null {
  if (!raw || typeof raw !== "object" || raw.ok !== true) return null;
  const rawStats = raw.stats;
  if (!rawStats || typeof rawStats !== "object") return null;

  const n = nonNegInt(rawStats.n) ?? 0;
  // Sem lotes encerrados na categoria → nada honesto a mostrar.
  if (n <= 0) return null;

  const nWithFinal = nonNegInt(rawStats.n_with_final) ?? 0;
  const months = nonNegInt(rawStats.months) ?? 0;
  const category = nonEmpty(rawStats.category) ?? fallbackCategory;
  const city = nonEmpty(rawStats.city);
  const uf = nonEmpty(rawStats.uf);

  const stats: PrecoHistoricoStats = {
    category,
    months,
    n,
    nWithFinal,
    minimumBid: normalizeFaixa(rawStats.minimum_bid),
    appraisal: normalizeFaixa(rawStats.appraisal),
    // Arremate só quando há venda publicada — nunca fabricar.
    finalValue: nWithFinal > 0 ? normalizeFaixaArremate(rawStats.final_value) : null,
    ...(city ? { city } : {}),
    ...(uf ? { uf } : {}),
  };

  // Sem nenhuma faixa de referência (mínimo nem avaliação) → seção sem valor.
  if (!stats.minimumBid && !stats.appraisal && !stats.finalValue) return null;

  const sample: PrecoHistoricoSample[] = Array.isArray(raw.sample)
    ? raw.sample.map(normalizeSample).filter((s): s is PrecoHistoricoSample => s !== null)
    : [];

  const rawCitation = raw.citation;
  const citation: PrecoHistoricoCitation = {
    sourceName: nonEmpty(rawCitation?.source_name) ?? "Receita Federal — Sistema de Leilão Eletrônico (SLE)",
    ...(nonEmpty(rawCitation?.source_id) ? { sourceId: nonEmpty(rawCitation?.source_id)! } : {}),
    ...(nonEmpty(rawCitation?.note) ? { note: nonEmpty(rawCitation?.note)! } : {}),
  };

  return { stats, sample, citation };
}

// ---------------------------------------------------------------------------
// Fetch público da RPC. Degrada para null em QUALQUER falha — nunca lança.
// ---------------------------------------------------------------------------

export interface PrecoHistoricoOptions {
  /** Filtra por cidade (a RPC normaliza). */
  city?: string;
  /** Janela em meses (default 36). */
  months?: number;
  /** Quantos lotes de amostra pedir (default 6). */
  sample?: number;
  /** Token da sessão; cai para a chave pública (dados públicos). */
  accessToken?: string | undefined;
  /** Injeção de fetch para teste. */
  fetcher?: typeof fetch;
}

/**
 * Busca a referência de preço de lotes ENCERRADOS para uma categoria.
 *
 * @param category  categoria do bem (ex.: "Veículos"); vazia → null (sem consulta).
 * @param opts      filtros opcionais + token + fetcher.
 * @returns         resultado normalizado, ou `null` em vazio/erro/rede.
 */
export async function fetchPrecoHistorico(
  category: string,
  opts?: PrecoHistoricoOptions,
): Promise<PrecoHistoricoResult | null> {
  const cat = typeof category === "string" ? category.trim() : "";
  if (cat.length === 0) return null;

  const fetcher = opts?.fetcher ?? fetch;
  const { url, key } = getSupabasePublicConfig();
  const endpoint = `${trimTrailingSlash(url)}/rest/v1/rpc/auction_price_intelligence`;
  const bearer =
    opts?.accessToken && opts.accessToken.length > 0 ? opts.accessToken : key;

  const city = typeof opts?.city === "string" && opts.city.trim().length > 0 ? opts.city.trim() : undefined;

  const body: Record<string, unknown> = {
    p_category: cat,
    p_months: opts?.months ?? 36,
    p_sample: opts?.sample ?? 6,
    ...(city ? { p_city: city } : {}),
  };

  try {
    const res = await fetcher(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify(body),
    });
    // 404 = RPC ainda não publicada; outros = transitório. Em ambos: some a seção.
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!data || typeof data !== "object") return null;
    return normalize(data as RawResponse, cat);
  } catch {
    // Rede/JSON inválido → degradação graciosa.
    return null;
  }
}
