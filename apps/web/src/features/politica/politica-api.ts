import type { CamaraDeputado } from "@fonteia/sources";
import { getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";

export type PoliticaDataSource = "supabase" | "empty";

export interface PoliticaLoadResult {
  source: PoliticaDataSource;
  deputados: CamaraDeputado[];
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
}

interface SupabaseEntityRow {
  attributes: CamaraDeputado;
  updated_at?: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Máximo de páginas por requisição — protege contra loop infinito.
// Com pageSize=1000 e maxPages=2 buscamos até 2.000 deputados (são ~513).
const MAX_SUPABASE_PAGES = 2;

async function fetchSupabaseDeputados(
  fetcher: typeof fetch,
): Promise<{ deputados: CamaraDeputado[]; lastSyncedAt?: string | undefined }> {
  const { url: supabaseUrl, key: publishableKey } = getSupabasePublicConfig();

  // Paginação por Range: o PostgREST corta em 1000 linhas por padrão (max-rows).
  // kind = politician é a entidade de deputado/político (ENTITY_KINDS).
  const pageSize = 1000;
  const rows: SupabaseEntityRow[] = [];
  for (let page = 0; page < MAX_SUPABASE_PAGES; page++) {
    const offset = page * pageSize;
    const query =
      "entities?kind=eq.politician&select=attributes,updated_at&order=normalized_name.asc";
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

    const batch = (await response.json()) as SupabaseEntityRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  // Garante que só pegamos deputados da Câmara (entities mistura outras fontes).
  const deputados = rows
    .map((row) => row.attributes)
    .filter((item) => item?.sourceId === "camara-dados-abertos");

  return { deputados, lastSyncedAt: rows.find((row) => row.updated_at)?.updated_at };
}

export async function listDeputados(fetcher: typeof fetch = fetch): Promise<PoliticaLoadResult> {
  const errors: string[] = [];

  try {
    const { deputados, lastSyncedAt } = await fetchSupabaseDeputados(fetcher);

    if (deputados.length > 0) {
      return {
        source: "supabase",
        deputados,
        message: "Deputados em exercício carregados do Supabase público com dados da Câmara.",
        lastSyncedAt,
      };
    }
  } catch (error) {
    errors.push(`Supabase: ${toErrorMessage(error)}`);
  }

  return {
    source: "empty",
    deputados: [],
    message: "Nenhum deputado disponível no momento. A coleta da Câmara roda periodicamente.",
    errors,
  };
}

export const loadDeputados = listDeputados;
