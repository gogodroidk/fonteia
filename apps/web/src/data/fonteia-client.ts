import type { ReceitaLeilaoLot } from "@fonteia/sources";

export type LeiloesDataSource = "api" | "supabase" | "sample";

export interface LeiloesLoadResult {
  source: LeiloesDataSource;
  lots: ReceitaLeilaoLot[];
  message?: string;
}

interface SupabaseEntityRow {
  attributes: ReceitaLeilaoLot;
  updated_at?: string;
}

const DEFAULT_API_URL = "http://localhost:4000";

function getEnv(name: string): string | undefined {
  const value = import.meta.env[name];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

async function fetchApiLots(fetcher: typeof fetch): Promise<ReceitaLeilaoLot[]> {
  const apiUrl = trimTrailingSlash(getEnv("VITE_API_URL") ?? DEFAULT_API_URL);
  const response = await fetcher(`${apiUrl}/leiloes/lotes`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  const payload = (await response.json()) as { lots?: ReceitaLeilaoLot[] };

  if (!Array.isArray(payload.lots)) {
    throw new Error("API response did not include lots");
  }

  return payload.lots;
}

async function fetchSupabaseLots(fetcher: typeof fetch): Promise<ReceitaLeilaoLot[]> {
  const supabaseUrl = getEnv("VITE_SUPABASE_URL");
  const publishableKey = getEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase public environment is not configured");
  }

  const query =
    "entities?kind=eq.auction_lot&select=attributes,updated_at&order=updated_at.desc&limit=50";
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
  return rows.map((row) => row.attributes).filter((lot) => lot?.sourceId === "receita-leiloes-sle");
}

export async function loadLeiloesLots(fetcher: typeof fetch = fetch): Promise<LeiloesLoadResult> {
  try {
    const lots = await fetchApiLots(fetcher);

    if (lots.length > 0) {
      return { source: "api", lots };
    }
  } catch {
    // The web shell can run before the API is up; Supabase REST is the next alpha path.
  }

  try {
    const lots = await fetchSupabaseLots(fetcher);

    if (lots.length > 0) {
      return { source: "supabase", lots };
    }
  } catch {
    // The local sample keeps the product usable when public credentials are absent.
  }

  return {
    source: "sample",
    lots: [],
    message: "Usando amostras locais ate a API ou o Supabase ficarem disponiveis.",
  };
}
