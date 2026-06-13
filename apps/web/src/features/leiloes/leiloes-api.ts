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

// isDemo is kept for backwards compatibility but always false — no sample data is shown
/** @deprecated Use `source === "empty"` instead */
export function isLeiloesDemo(_result: LeiloesLoadResult): boolean {
  return false;
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

async function fetchSupabaseLots(fetcher: typeof fetch): Promise<{ lots: ReceitaLeilaoLot[]; lastSyncedAt?: string | undefined }> {
  const { url: supabaseUrl, key: publishableKey } = getSupabasePublicConfig();

  const query = "entities?kind=eq.auction_lot&select=attributes,updated_at&order=updated_at.desc&limit=2000";
  const response = await fetcher(`${trimTrailingSlash(supabaseUrl)}/rest/v1/${query}`, {
    headers: {
      accept: "application/json",
      apikey: publishableKey,
      authorization: `Bearer ${publishableKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase REST returned ${response.status}`);
  }

  const rows = (await response.json()) as SupabaseEntityRow[];
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
        message: "Dados carregados pela API Fonte.ia com trilha de fonte e normalizacao do produto.",
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
        message: "Dados carregados do Supabase publico com RLS e evidencias da Receita Federal.",
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
    message: "Nenhum lote disponivel no momento. A coleta dos leiloes da Receita roda periodicamente.",
    errors,
  };
}

export async function getLeilaoLotById(lotId: string, fetcher: typeof fetch = fetch): Promise<LeilaoLotResult> {
  const errors: string[] = [];

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

  const result = await listLeilaoLots(fetcher);
  const lot = result.lots.find((item) => item.id === lotId) ?? null;

  return {
    ...result,
    lot,
    errors: [...errors, ...(result.errors ?? [])],
    message: lot
      ? result.message
      : `Nao encontramos o lote ${lotId} nas fontes carregadas agora.`,
  };
}

export const loadLeiloesLots = listLeilaoLots;
