import type { IbgeMunicipio } from "@fonteia/sources";
import { fetchAllD1Entities, fetchAllD1EntitiesStatic, firstUpdatedAt } from "../../lib/d1-client";

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

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Máximo de páginas por requisição — protege contra loop infinito em datasets
// grandes. Municípios são ~5570, então precisamos de algumas páginas; bidding
// pode crescer mais.
const MAX_MUNICIPIOS_PAGES = 8; // até 8.000 linhas (>5570)
const MAX_BIDDING_PAGES = 30; // até 30.000 linhas

/**
 * Conta licitações (kind=bidding_opportunity) por código IBGE, lendo o campo
 * attributes->>codigoIbge. Mantemos a leitura simples e agregamos no cliente —
 * mesmo padrão da listagem de licitações (robusto a RLS e sem depender de RPC).
 */
async function fetchBiddingCountsByIbge(fetcher: typeof fetch): Promise<Map<string, number>> {
  // Pegamos o objeto attributes e lemos codigoIbge no cliente (mesmo padrão do
  // licitacoes-api — leitura simples, robusta a RLS e sem depender de RPC).
  const { rows } = await fetchAllD1Entities<{ codigoIbge?: string }>(
    { kind: "bidding_opportunity" },
    { maxPages: MAX_BIDDING_PAGES, fetcher },
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
  // kind = municipality é a entidade de município (IBGE Localidades).
  // Usa a variante static (TTL=5min) pois os ~5570 municípios só mudam em
  // ingestões diárias do IBGE — evita refetch a cada navegação SPA.
  const { rows } = await fetchAllD1EntitiesStatic<IbgeMunicipio>(
    { kind: "municipality" },
    { maxPages: MAX_MUNICIPIOS_PAGES, fetcher },
  );

  // Cruza com a contagem de licitações por código IBGE. Se falhar, segue com 0.
  let counts = new Map<string, number>();
  try {
    counts = await fetchBiddingCountsByIbge(fetcher);
  } catch (error) {
    console.warn("[municipios-api] Falha ao cruzar licitações por IBGE:", toErrorMessage(error));
  }

  const municipiosBase = rows
    .map((r) => r.attributes)
    .filter((item) => item?.sourceId === "ibge-localidades");

  const municipios = municipiosBase.map<MunicipioWithStats>((item) => ({
    ...item,
    licitacoesCount: counts.get(item.codigoIbge) ?? 0,
  }));

  return { municipios, lastSyncedAt: firstUpdatedAt(rows) };
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
