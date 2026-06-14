import type { IbgeMunicipio } from "@fonteia/sources";
import { getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";

export type MunicipiosDataSource = "supabase" | "empty";

/** Município enriquecido com a contagem de licitações cruzada por código IBGE. */
export interface MunicipioWithStats extends IbgeMunicipio {
  /** Nº de licitações (entities kind=bidding_opportunity) neste município. */
  licitacoesCount: number;
}

export interface MunicipiosLoadResult {
  source: MunicipiosDataSource;
  municipios: MunicipioWithStats[];
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
}

interface SupabaseEntityRow {
  attributes: IbgeMunicipio;
  updated_at?: string;
}

interface BiddingIbgeRow {
  attributes: { codigoIbge?: string };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Máximo de páginas por requisição — protege contra loop infinito em datasets
// grandes. O PostgREST corta em 1000 linhas por padrão (max-rows). Municípios
// são ~5570, então precisamos de algumas páginas; bidding pode crescer mais.
const PAGE_SIZE = 1000;
const MAX_MUNICIPIOS_PAGES = 8; // até 8.000 linhas (>5570)
const MAX_BIDDING_PAGES = 30; // até 30.000 linhas

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
        `[municipios-api] Atingido o limite de ${maxPages} páginas (${rows.length} linhas em ${label}). Pode haver mais dados não carregados.`,
      );
    }
  }
  return rows;
}

/**
 * Conta licitações (kind=bidding_opportunity) por código IBGE, lendo o campo
 * attributes->>codigoIbge. Mantemos a leitura simples e agregamos no cliente —
 * mesmo padrão da listagem de licitações (robusto a RLS e sem depender de RPC).
 */
async function fetchBiddingCountsByIbge(
  fetcher: typeof fetch,
  supabaseUrl: string,
  publishableKey: string,
): Promise<Map<string, number>> {
  // Pegamos o objeto attributes e lemos codigoIbge no cliente (mesmo padrão do
  // licitacoes-api — leitura simples, robusta a RLS e sem depender de RPC).
  const rows = await fetchAllRows<BiddingIbgeRow>(
    fetcher,
    supabaseUrl,
    publishableKey,
    "entities?kind=eq.bidding_opportunity&select=attributes&order=updated_at.desc",
    MAX_BIDDING_PAGES,
    "licitacoes",
  );

  const counts = new Map<string, number>();
  for (const row of rows) {
    const codigo = row.attributes?.codigoIbge;
    if (typeof codigo === "string" && codigo.length > 0) {
      counts.set(codigo, (counts.get(codigo) ?? 0) + 1);
    }
  }
  return counts;
}

async function fetchSupabaseMunicipios(
  fetcher: typeof fetch,
): Promise<{ municipios: MunicipioWithStats[]; lastSyncedAt?: string | undefined }> {
  const { url: supabaseUrl, key: publishableKey } = getSupabasePublicConfig();

  // kind = municipality é a entidade de município (IBGE Localidades).
  const rows = await fetchAllRows<SupabaseEntityRow>(
    fetcher,
    supabaseUrl,
    publishableKey,
    "entities?kind=eq.municipality&select=attributes,updated_at&order=normalized_name.asc",
    MAX_MUNICIPIOS_PAGES,
    "municipios",
  );

  // Cruza com a contagem de licitações por código IBGE. Se falhar, segue com 0.
  let counts = new Map<string, number>();
  try {
    counts = await fetchBiddingCountsByIbge(fetcher, supabaseUrl, publishableKey);
  } catch (error) {
    console.warn("[municipios-api] Falha ao cruzar licitações por IBGE:", toErrorMessage(error));
  }

  const municipios = rows
    .map((row) => row.attributes)
    .filter((item) => item?.sourceId === "ibge-localidades")
    .map<MunicipioWithStats>((item) => ({
      ...item,
      licitacoesCount: counts.get(item.codigoIbge) ?? 0,
    }));

  return { municipios, lastSyncedAt: rows.find((row) => row.updated_at)?.updated_at };
}

export async function listMunicipios(fetcher: typeof fetch = fetch): Promise<MunicipiosLoadResult> {
  const errors: string[] = [];

  try {
    const { municipios, lastSyncedAt } = await fetchSupabaseMunicipios(fetcher);

    if (municipios.length > 0) {
      return {
        source: "supabase",
        municipios,
        message: "Municípios do IBGE carregados do Supabase público, cruzados com as licitações do PNCP.",
        lastSyncedAt,
        errors,
      };
    }
  } catch (error) {
    errors.push(`Supabase: ${toErrorMessage(error)}`);
  }

  return {
    source: "empty",
    municipios: [],
    message: "Nenhum município disponível no momento. A coleta do IBGE roda periodicamente.",
    errors,
  };
}

export const loadMunicipios = listMunicipios;
