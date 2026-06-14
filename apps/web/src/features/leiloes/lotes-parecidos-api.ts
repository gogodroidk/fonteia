import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";

/**
 * Feature "Lotes parecidos / referência de valor".
 *
 * Reusa o embedding JÁ salvo do próprio lote (zero custo de embedding por
 * visualização): chama a RPC `similar_entities_by_external` via PostgREST,
 * que resolve a entity pelo external id (kind='auction_lot',
 * key='receitaLotId') e devolve os lotes do mesmo kind mais similares.
 *
 * Degradação elegante: qualquer falha (lote sem embedding, sem parecidos,
 * rede, RPC ausente) devolve lista vazia — a tela esconde a seção, sem erro.
 */

/** Uma linha crua da RPC similar_entities / similar_entities_by_external. */
interface SimilarEntityRow {
  id: string;
  name: string;
  /** `attributes` é o eco do lote normalizado (mesma forma de ReceitaLeilaoLot). */
  attributes: ReceitaLeilaoLot;
  /** Similaridade de cosseno: 1.0 = idêntico, 0.0 = sem relação. */
  score: number;
}

/** Um lote parecido pronto para a UI: o lote completo + o score de similaridade. */
export interface LoteParecido {
  /** UUID da entity (não usado pela navegação, que usa `lot.id`). */
  entityId: string;
  lot: ReceitaLeilaoLot;
  score: number;
}

/** Resumo de faixa de valor (lance mínimo) dos lotes parecidos, em centavos. */
export interface FaixaValor {
  minCents: number;
  medianCents: number;
  maxCents: number;
}

export interface LotesParecidosResult {
  parecidos: LoteParecido[];
  /** Faixa do lance mínimo dos parecidos; null quando nenhum tem valor. */
  faixaLanceMinimo: FaixaValor | null;
  /** Faixa da avaliação oficial dos parecidos; null quando nenhum tem valor. */
  faixaAvaliacao: FaixaValor | null;
}

const EMPTY: LotesParecidosResult = {
  parecidos: [],
  faixaLanceMinimo: null,
  faixaAvaliacao: null,
};

/** Mediana de uma lista já não-vazia de números (ordena uma cópia). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    // Média dos dois centrais — `at` garante number sob noUncheckedIndexedAccess.
    return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
  }
  return sorted[mid] ?? 0;
}

/** Constrói a faixa (min/mediana/max) a partir de centavos > 0; null se vazio. */
function buildFaixa(centsList: Array<number | undefined>): FaixaValor | null {
  const valid = centsList.filter((c): c is number => typeof c === "number" && c > 0);
  if (valid.length === 0) return null;
  return {
    minCents: Math.min(...valid),
    medianCents: median(valid),
    maxCents: Math.max(...valid),
  };
}

/**
 * Busca os lotes parecidos com o lote dado, reusando seu embedding salvo.
 *
 * @param lot          lote atual (usa `lot.id` como receitaLotId — é o external id).
 * @param count        quantos parecidos pedir (default 6).
 * @param accessToken  token da sessão; cai para a chave pública (dados públicos).
 */
export async function fetchLotesParecidos(
  lot: Pick<ReceitaLeilaoLot, "id">,
  options?: { count?: number; accessToken?: string | undefined; fetcher?: typeof fetch },
): Promise<LotesParecidosResult> {
  const externalId = lot.id;
  if (!externalId) return EMPTY;

  const fetcher = options?.fetcher ?? fetch;
  const { url, key } = getSupabasePublicConfig();
  const endpoint = `${trimTrailingSlash(url)}/rest/v1/rpc/similar_entities_by_external`;
  const bearer =
    options?.accessToken && options.accessToken.length > 0 ? options.accessToken : key;

  let rows: SimilarEntityRow[];
  try {
    const res = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        apikey: key,
        authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        p_kind: "auction_lot",
        p_external_key: "receitaLotId",
        p_external_id: externalId,
        p_count: options?.count ?? 6,
      }),
    });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return EMPTY;
    rows = data as SimilarEntityRow[];
  } catch {
    return EMPTY;
  }

  const parecidos: LoteParecido[] = rows
    .filter((row) => row && typeof row === "object" && row.attributes?.id)
    .map((row) => ({ entityId: row.id, lot: row.attributes, score: row.score }));

  if (parecidos.length === 0) return EMPTY;

  return {
    parecidos,
    faixaLanceMinimo: buildFaixa(parecidos.map((p) => p.lot.minimumBidCents)),
    faixaAvaliacao: buildFaixa(parecidos.map((p) => p.lot.valorAvaliacaoCents)),
  };
}
