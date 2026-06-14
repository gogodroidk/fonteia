import type { CamaraProposicao } from "@fonteia/sources";
import { getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";

export type JuridicoDataSource = "supabase" | "empty";

/** Proposição lida do Supabase (entities kind=legal_proposition). */
export type ProposicaoItem = CamaraProposicao;

export interface JuridicoLoadResult {
  source: JuridicoDataSource;
  proposicoes: ProposicaoItem[];
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
}

interface SupabaseEntityRow {
  attributes: CamaraProposicao;
  updated_at?: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Máximo de páginas por requisição — protege contra loop infinito em datasets
// grandes. O PostgREST corta em 1000 linhas por padrão (max-rows). Proposições
// recentes ficam na casa dos milhares, então precisamos de algumas páginas.
const PAGE_SIZE = 1000;
const MAX_PROPOSICOES_PAGES = 12; // até 12.000 linhas

/** Lê todas as linhas de uma view PostgREST paginando por Range. */
async function fetchAllRows<T>(
  fetcher: typeof fetch,
  supabaseUrl: string,
  publishableKey: string,
  query: string,
  maxPages: number,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const offset = page * PAGE_SIZE;
    const response = await fetcher(`${trimTrailingSlash(supabaseUrl)}/rest/v1/${query}`, {
      headers: {
        accept: "application/json",
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        Range: `${offset}-${offset + PAGE_SIZE - 1}`,
        "Range-Unit": "items",
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase REST returned ${response.status}`);
    }

    const batch = (await response.json()) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;

    if (page === maxPages - 1) {
      console.warn(
        `[juridico-api] Atingido o limite de ${maxPages} páginas (${rows.length} linhas em ${label}). Pode haver mais dados não carregados.`,
      );
    }
  }
  return rows;
}

async function fetchSupabaseProposicoes(
  fetcher: typeof fetch,
): Promise<{ proposicoes: ProposicaoItem[]; lastSyncedAt?: string | undefined }> {
  const { url: supabaseUrl, key: publishableKey } = getSupabasePublicConfig();

  // kind = legal_proposition é a entidade de proposição (Câmara — Dados Abertos).
  const rows = await fetchAllRows<SupabaseEntityRow>(
    fetcher,
    supabaseUrl,
    publishableKey,
    "entities?kind=eq.legal_proposition&select=attributes,updated_at&order=updated_at.desc",
    MAX_PROPOSICOES_PAGES,
    "proposicoes",
  );

  const proposicoes = rows
    .map((row) => row.attributes)
    .filter((item) => item?.sourceId === "camara-dados-abertos");

  return { proposicoes, lastSyncedAt: rows.find((row) => row.updated_at)?.updated_at };
}

export async function listProposicoes(fetcher: typeof fetch = fetch): Promise<JuridicoLoadResult> {
  const errors: string[] = [];

  try {
    const { proposicoes, lastSyncedAt } = await fetchSupabaseProposicoes(fetcher);

    if (proposicoes.length > 0) {
      return {
        source: "supabase",
        proposicoes,
        message: "Proposições da Câmara dos Deputados carregadas do Supabase público.",
        lastSyncedAt,
        errors,
      };
    }
  } catch (error) {
    errors.push(`Supabase: ${toErrorMessage(error)}`);
  }

  return {
    source: "empty",
    proposicoes: [],
    message: "Nenhuma proposição disponível no momento. A coleta da Câmara roda periodicamente.",
    errors,
  };
}

export const loadProposicoes = listProposicoes;
