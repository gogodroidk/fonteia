import type { PncpLicitacao } from "@fonteia/sources";
import { fetchJsonFromApi } from "../../lib/api-client";
import { fetchAllD1Entities, firstUpdatedAt } from "../../lib/d1-client";

export type LicitacoesDataSource = "api" | "supabase" | "empty";

export interface LicitacoesLoadResult {
  source: LicitacoesDataSource;
  licitacoes: PncpLicitacao[];
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
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
  // BULK no Cloudflare D1 (primário) com fallback transparente para o Supabase REST,
  // via cliente compartilhado. kind = bidding_opportunity é a entidade de
  // licitação/contratação (ENTITY_KINDS). O cliente pagina em lotes de 1000 até
  // maxPages=10 (até 10.000 linhas), preservando o corte de antes.
  const { rows } = await fetchAllD1Entities<PncpLicitacao>(
    { kind: "bidding_opportunity" },
    { maxPages: 10, fetcher },
  );

  // Garante que só pegamos licitações do PNCP (entities pode misturar fontes futuras).
  const licitacoes = rows
    .map((row) => row.attributes)
    .filter((item) => item?.sourceId === "pncp-contratacoes");

  return { licitacoes, lastSyncedAt: firstUpdatedAt(rows) };
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
