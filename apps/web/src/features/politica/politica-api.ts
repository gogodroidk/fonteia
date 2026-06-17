import type { CamaraDeputado } from "@fonteia/sources";
import { fetchAllD1Entities, firstUpdatedAt } from "../../lib/d1-client";

export type PoliticaDataSource = "supabase" | "empty";

export interface PoliticaLoadResult {
  source: PoliticaDataSource;
  deputados: CamaraDeputado[];
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
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
  // kind = politician é a entidade de deputado/político (ENTITY_KINDS).
  const { rows } = await fetchAllD1Entities<CamaraDeputado>(
    { kind: "politician" },
    { maxPages: MAX_SUPABASE_PAGES, fetcher },
  );

  // Garante que só pegamos deputados da Câmara (entities mistura outras fontes).
  const deputados = rows
    .map((r) => r.attributes)
    .filter((item) => item?.sourceId === "camara-dados-abertos");

  return { deputados, lastSyncedAt: firstUpdatedAt(rows) };
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
