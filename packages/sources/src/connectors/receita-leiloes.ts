import { RECEITA_DEFAULT_HEADERS, parseReceitaDate } from "../internal/receita-shared";
import { fetchWithRetry } from "../internal/http";

export const RECEITA_LEILOES_DESTAQUES_URL =
  "https://www25.receita.fazenda.gov.br/sle-sociedade/api/portal/destaques";

/** URL humana do portal (base para montar links clicáveis de lote/edital). */
export const RECEITA_SLE_PORTAL_BASE =
  "https://www25.receita.fazenda.gov.br/sle-sociedade";

export interface ReceitaLeiloesDestaqueRaw {
  permitePF: boolean;
  orgao: string;
  cidade: string;
  edital: string;
  edle: string;
  dtFimProposta: string;
  destaque: boolean;
  imagemDestaque?: string;
  numero: number;
  lote: number;
  valor: number;
}

export interface ReceitaLeiloesDestaquesPayload {
  agora: string;
  destaques: ReceitaLeiloesDestaqueRaw[];
}

export interface ReceitaCache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface ReceitaLeilaoLot {
  id: string;
  sourceId: "receita-leiloes-sle";
  edital: string;
  edle: string;
  lotNumber: string;
  displayNumber: string;
  city: string;
  agency: string;
  minimumBidCents: number;
  proposalDeadline: string;
  eligiblePersonTypes: Array<"pf" | "pj">;
  imageUrl?: string;
  /** Campos ricos do catálogo (preenchidos pela ingestão completa; opcionais no destaque). */
  imageUrls?: string[];
  /** Valor de avaliação oficial em centavos — base da "economia real" (avaliação − mínimo). */
  valorAvaliacaoCents?: number;
  /** Categoria/natureza do bem (ex.: "VEÍCULO", "PRODUTO MINERAL"). */
  category?: string;
  sourceUrl: string;
  collectedAt: string;
  raw: ReceitaLeiloesDestaqueRaw;
}

function buildLotId(raw: ReceitaLeiloesDestaqueRaw): string {
  return `${raw.edle.replaceAll("/", "-")}-${raw.lote}`;
}

/**
 * URL humana do portal para um lote de destaque (fix #5: sourceUrl aponta para
 * a página navegável, não para o endpoint JSON interno).
 * edle = "unidade/numero/exercicio" → /portal/edital/unidade/numero/exercicio/lote/N
 */
function loteDestaquePortalUrl(edle: string, lote: number): string {
  const parts = edle.split("/");
  if (parts.length === 3) {
    return `${RECEITA_SLE_PORTAL_BASE}/portal/edital/${parts[0]}/${parts[1]}/${parts[2]}/lote/${lote}`;
  }
  // Fallback: tela de editais disponíveis (nunca devolve link quebrado).
  return `${RECEITA_SLE_PORTAL_BASE}/portal/editais-disponiveis`;
}

export function normalizeReceitaDestaque(raw: ReceitaLeiloesDestaqueRaw, collectedAt: string): ReceitaLeilaoLot {
  const lot: ReceitaLeilaoLot = {
    id: buildLotId(raw),
    sourceId: "receita-leiloes-sle",
    edital: raw.edital,
    edle: raw.edle,
    lotNumber: String(raw.lote),
    displayNumber: String(raw.numero),
    city: raw.cidade,
    agency: raw.orgao,
    minimumBidCents: Math.round(raw.valor * 100),
    proposalDeadline: parseReceitaDate(raw.dtFimProposta),
    eligiblePersonTypes: raw.permitePF ? ["pf", "pj"] : ["pj"],
    // fix #5: URL humana do portal, não o endpoint JSON da API interna.
    sourceUrl: loteDestaquePortalUrl(raw.edle, raw.lote),
    collectedAt,
    raw,
  };

  if (raw.imagemDestaque) {
    lot.imageUrl = raw.imagemDestaque;
  }

  return lot;
}

export function normalizeReceitaDestaquesPayload(payload: ReceitaLeiloesDestaquesPayload): ReceitaLeilaoLot[] {
  const collectedAt = parseReceitaDate(payload.agora);
  return payload.destaques.map((raw) => normalizeReceitaDestaque(raw, collectedAt));
}

export async function fetchReceitaLeiloesDestaques(fetcher?: typeof fetch): Promise<ReceitaLeilaoLot[]> {
  const response = await fetchWithRetry(RECEITA_LEILOES_DESTAQUES_URL, {
    init: { headers: RECEITA_DEFAULT_HEADERS },
    fetcher,
  });

  if (!response.ok) {
    throw new Error(`Receita Leiloes request failed with status ${response.status}`);
  }

  const raw = (await response.json()) as unknown;
  // Guarda mínima: verifica shape do envelope (fix #6).
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("destaques" in raw) ||
    !Array.isArray((raw as Record<string, unknown>).destaques)
  ) {
    throw new Error(
      "Receita Leiloes: payload inesperado — esperado objeto com 'destaques' (array).",
    );
  }
  const payload = raw as ReceitaLeiloesDestaquesPayload;
  return normalizeReceitaDestaquesPayload(payload);
}

export async function fetchReceitaLeiloesDestaquesWithCache(
  cache: ReceitaCache,
  fetcher?: typeof fetch,
): Promise<{ lots: ReceitaLeilaoLot[]; fromCache: boolean }> {
  const CACHE_KEY = "receita-leiloes:destaques";
  const TTL_SECONDS = 900; // 15 min

  const cached = await cache.get(CACHE_KEY);
  if (cached) {
    try {
      const payload = JSON.parse(cached) as ReceitaLeiloesDestaquesPayload;
      return { lots: normalizeReceitaDestaquesPayload(payload), fromCache: true };
    } catch {
      // cache corrompido, buscar de novo
    }
  }

  const response = await fetchWithRetry(RECEITA_LEILOES_DESTAQUES_URL, {
    init: { headers: RECEITA_DEFAULT_HEADERS },
    fetcher,
  });
  if (!response.ok) {
    throw new Error(`Receita Leiloes request failed with status ${response.status}`);
  }
  const raw = (await response.json()) as unknown;
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("destaques" in raw) ||
    !Array.isArray((raw as Record<string, unknown>).destaques)
  ) {
    throw new Error(
      "Receita Leiloes: payload inesperado — esperado objeto com 'destaques' (array).",
    );
  }
  const payload = raw as ReceitaLeiloesDestaquesPayload;
  await cache.put(CACHE_KEY, JSON.stringify(payload), { expirationTtl: TTL_SECONDS });
  return { lots: normalizeReceitaDestaquesPayload(payload), fromCache: false };
}
