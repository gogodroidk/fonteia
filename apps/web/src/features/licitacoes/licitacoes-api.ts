import type { PncpLicitacao } from "@fonteia/sources";
import { fetchJsonFromApi, getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";

export type LicitacoesDataSource = "api" | "supabase" | "empty";

export interface LicitacoesLoadResult {
  source: LicitacoesDataSource;
  licitacoes: PncpLicitacao[];
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
}

interface SupabaseEntityRow {
  attributes: PncpLicitacao;
  updated_at?: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchApiLicitacoes(fetcher: typeof fetch): Promise<PncpLicitacao[]> {
  const payload = await fetchJsonFromApi<{ licitacoes?: PncpLicitacao[] }>("/licitacoes", fetcher);

  if (!Array.isArray(payload.licitacoes)) {
    throw new Error("API response did not include licitacoes");
  }

  return payload.licitacoes;
}

async function fetchSupabaseLicitacoes(
  fetcher: typeof fetch,
): Promise<{ licitacoes: PncpLicitacao[]; lastSyncedAt?: string | undefined }> {
  const { url: supabaseUrl, key: publishableKey } = getSupabasePublicConfig();

  // Paginação por Range: o PostgREST corta em 1000 linhas por padrão (max-rows),
  // então buscamos em páginas de 1000 até acabar — sem teto artificial.
  // kind = bidding_opportunity é a entidade de licitação/contratação (ENTITY_KINDS).
  const pageSize = 1000;
  const rows: SupabaseEntityRow[] = [];
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const query =
      "entities?kind=eq.bidding_opportunity&select=attributes,updated_at&order=updated_at.desc";
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

  // Garante que só pegamos licitações do PNCP (entities pode misturar fontes futuras).
  const licitacoes = rows
    .map((row) => row.attributes)
    .filter((item) => item?.sourceId === "pncp-contratacoes");

  return { licitacoes, lastSyncedAt: rows.find((row) => row.updated_at)?.updated_at };
}

export async function listLicitacoes(fetcher: typeof fetch = fetch): Promise<LicitacoesLoadResult> {
  const errors: string[] = [];

  try {
    const licitacoes = await fetchApiLicitacoes(fetcher);

    if (licitacoes.length > 0) {
      return {
        source: "api",
        licitacoes,
        message: "Dados carregados pela API Fonte.ia com trilha de fonte e normalização do produto.",
      };
    }
  } catch (error) {
    errors.push(`API: ${toErrorMessage(error)}`);
  }

  try {
    const { licitacoes, lastSyncedAt } = await fetchSupabaseLicitacoes(fetcher);

    if (licitacoes.length > 0) {
      return {
        source: "supabase",
        licitacoes,
        message: "Dados carregados do Supabase público com RLS e evidências do PNCP.",
        lastSyncedAt,
        errors,
      };
    }
  } catch (error) {
    errors.push(`Supabase: ${toErrorMessage(error)}`);
  }

  return {
    source: "empty",
    licitacoes: [],
    message: "Nenhuma licitação disponível no momento. A coleta do PNCP roda periodicamente.",
    errors,
  };
}

export const loadLicitacoes = listLicitacoes;
