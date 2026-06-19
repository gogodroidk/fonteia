import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { fetchJsonFromApi, getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";

export type LeiloesDataSource = "api" | "supabase" | "empty";

export interface LeiloesLoadResult {
  source: LeiloesDataSource;
  lots: ReceitaLeilaoLot[];
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
}

export interface LeilaoLotResult extends LeiloesLoadResult {
  lot: ReceitaLeilaoLot | null;
}

interface SupabaseEntityRow {
  attributes: ReceitaLeilaoLot;
  updated_at?: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchApiLots(fetcher: typeof fetch): Promise<ReceitaLeilaoLot[]> {
  const payload = await fetchJsonFromApi<{ lots?: ReceitaLeilaoLot[] }>("/leiloes/lotes", fetcher);

  if (!Array.isArray(payload.lots)) {
    throw new Error("API response did not include lots");
  }

  return payload.lots;
}

async function fetchApiLotById(lotId: string, fetcher: typeof fetch): Promise<ReceitaLeilaoLot> {
  const payload = await fetchJsonFromApi<ReceitaLeilaoLot>(`/leiloes/lotes/${encodeURIComponent(lotId)}`, fetcher);

  if (!payload?.id) {
    throw new Error("API response did not include a lot");
  }

  return payload;
}

// Máximo de páginas por requisição — protege contra loop infinito em datasets grandes.
// Com pageSize=1000 e maxPages=10 buscamos até 10.000 lotes, mais que suficiente para leilões da Receita.
const MAX_SUPABASE_PAGES = 10;

async function fetchSupabaseLots(fetcher: typeof fetch): Promise<{ lots: ReceitaLeilaoLot[]; lastSyncedAt?: string | undefined }> {
  const { url: supabaseUrl, key: publishableKey } = getSupabasePublicConfig();

  // Paginação por Range: o PostgREST corta em 1000 linhas por padrão (max-rows),
  // então buscamos em páginas de 1000 até acabar (limitado a MAX_SUPABASE_PAGES páginas).
  const pageSize = 1000;
  const rows: SupabaseEntityRow[] = [];
  for (let page = 0; page < MAX_SUPABASE_PAGES; page++) {
    const offset = page * pageSize;
    const query = "entities?kind=eq.auction_lot&select=attributes,updated_at&order=updated_at.desc";
    const response = await fetcher(`${trimTrailingSlash(supabaseUrl)}/rest/v1/${query}`, {
      headers: {
        accept: "application/json",
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        Range: `${offset}-${offset + pageSize - 1}`,
        "Range-Unit": "items",
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase REST returned ${response.status}`);
    }

    const batch = (await response.json()) as unknown;
    if (!Array.isArray(batch)) {
      throw new Error(`Supabase REST: resposta da página ${page} não é uma lista`);
    }
    rows.push(...(batch as SupabaseEntityRow[]));
    if (batch.length < pageSize) break;

    if (page === MAX_SUPABASE_PAGES - 1) {
      console.warn(`[leiloes-api] Atingido o limite de ${MAX_SUPABASE_PAGES} páginas (${rows.length} linhas). Pode haver mais lotes não carregados.`);
    }
  }
  const lots = rows.map((row) => row.attributes).filter((lot) => lot?.sourceId === "receita-leiloes-sle");

  return { lots, lastSyncedAt: rows.find((row) => row.updated_at)?.updated_at };
}

export async function listLeilaoLots(fetcher: typeof fetch = fetch): Promise<LeiloesLoadResult> {
  const errors: string[] = [];

  try {
    const lots = await fetchApiLots(fetcher);

    if (lots.length > 0) {
      return {
        source: "api",
        lots,
        message: "Dados carregados pela API Fonte.ia com trilha de fonte e normalização do produto.",
      };
    }
  } catch (error) {
    errors.push(`API: ${toErrorMessage(error)}`);
  }

  try {
    const { lots, lastSyncedAt } = await fetchSupabaseLots(fetcher);

    if (lots.length > 0) {
      return {
        source: "supabase",
        lots,
        message: "Dados carregados do Supabase público com RLS e evidências da Receita Federal.",
        lastSyncedAt,
        errors,
      };
    }
  } catch (error) {
    errors.push(`Supabase: ${toErrorMessage(error)}`);
  }

  return {
    source: "empty",
    lots: [],
    message: "Nenhum lote disponível no momento. A coleta dos leilões da Receita roda periodicamente.",
    errors,
  };
}

/**
 * Faz uma query pontual no Supabase REST para um único lote por id.
 * Usa o filtro JSONB `attributes->>id=eq.{id}` em vez de paginar tudo.
 * Retorna null (sem lançar) quando o lote não existe ou ocorre qualquer erro.
 */
async function fetchSupabaseLotById(
  lotId: string,
  fetcher: typeof fetch,
): Promise<ReceitaLeilaoLot | null> {
  const { url: supabaseUrl, key: publishableKey } = getSupabasePublicConfig();

  const query =
    `entities?kind=eq.auction_lot` +
    `&attributes->>id=eq.${encodeURIComponent(lotId)}` +
    `&select=attributes,updated_at` +
    `&limit=1`;

  let response: Response;
  try {
    response = await fetcher(`${trimTrailingSlash(supabaseUrl)}/rest/v1/${query}`, {
      headers: {
        accept: "application/json",
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
      },
    });
  } catch (networkError) {
    console.warn("[leiloes-api] fetchSupabaseLotById: erro de rede", networkError);
    return null;
  }

  if (!response.ok) {
    console.warn(`[leiloes-api] fetchSupabaseLotById: Supabase REST retornou ${response.status}`);
    return null;
  }

  let batch: unknown;
  try {
    batch = await response.json();
  } catch {
    console.warn("[leiloes-api] fetchSupabaseLotById: resposta não é JSON válido");
    return null;
  }

  if (!Array.isArray(batch) || batch.length === 0) {
    return null;
  }

  const row = batch[0] as SupabaseEntityRow;
  const lot = row.attributes;

  // Garante que é um lote da Receita Federal (mesmo filtro do fetchSupabaseLots).
  if (!lot || lot.sourceId !== "receita-leiloes-sle") {
    return null;
  }

  return lot;
}

export async function getLeilaoLotById(lotId: string, fetcher: typeof fetch = fetch): Promise<LeilaoLotResult> {
  const errors: string[] = [];

  // 1ª tentativa: endpoint dedicado da API Fonte.ia.
  try {
    const lot = await fetchApiLotById(lotId, fetcher);

    return {
      source: "api",
      lot,
      lots: [lot],
      message: "Lote carregado pela API Fonte.ia.",
    };
  } catch (error) {
    errors.push(`API detail: ${toErrorMessage(error)}`);
  }

  // 2ª tentativa: query pontual no Supabase REST — busca apenas 1 linha.
  // Substitui o antigo listLeilaoLots() que paginava todo o dataset (~1 MB).
  try {
    const lot = await fetchSupabaseLotById(lotId, fetcher);

    if (lot !== null) {
      return {
        source: "supabase",
        lot,
        lots: [lot],
        message: "Lote carregado do Supabase público com RLS e evidências da Receita Federal.",
        errors,
      };
    }
  } catch (error) {
    errors.push(`Supabase single: ${toErrorMessage(error)}`);
  }

  // Lote não encontrado em nenhuma fonte — retorna not-found sem baixar o dataset inteiro.
  return {
    source: "empty",
    lot: null,
    lots: [],
    message: `Não encontramos o lote ${lotId} nas fontes carregadas agora.`,
    errors,
  };
}

export const loadLeiloesLots = listLeilaoLots;
