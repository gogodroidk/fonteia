import type { IbamaInfracao } from "@fonteia/sources";
import { getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";

export type AmbientalDataSource = "supabase" | "empty";

export interface AmbientalLoadResult {
  source: AmbientalDataSource;
  infracoes: IbamaInfracao[];
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
}

interface SupabaseEntityRow {
  attributes: IbamaInfracao;
  updated_at?: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Paginação por Range: o PostgREST corta em 1000 linhas por padrão (max-rows).
// A amostra ingerida do IBAMA fica na casa de poucos milhares — algumas páginas.
const PAGE_SIZE = 1000;
const MAX_PAGES = 10; // até 10.000 linhas

async function fetchSupabaseInfracoes(
  fetcher: typeof fetch,
): Promise<{ infracoes: IbamaInfracao[]; lastSyncedAt?: string | undefined }> {
  const { url: supabaseUrl, key: publishableKey } = getSupabasePublicConfig();

  // kind = environmental_infraction é o auto de infração ambiental (IBAMA).
  // Ordena pela data do auto (desc) via attributes->>data, mais recentes primeiro.
  const rows: SupabaseEntityRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const query =
      "entities?kind=eq.environmental_infraction&select=attributes,updated_at&order=updated_at.desc";
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

    const batch = (await response.json()) as SupabaseEntityRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  // Garante que só pegamos autos do IBAMA (entities mistura outras fontes).
  const infracoes = rows
    .map((row) => row.attributes)
    .filter((item) => item?.sourceId === "ibama-dados-abertos");

  return { infracoes, lastSyncedAt: rows.find((row) => row.updated_at)?.updated_at };
}

export async function listInfracoes(fetcher: typeof fetch = fetch): Promise<AmbientalLoadResult> {
  const errors: string[] = [];

  try {
    const { infracoes, lastSyncedAt } = await fetchSupabaseInfracoes(fetcher);

    if (infracoes.length > 0) {
      return {
        source: "supabase",
        infracoes,
        message:
          "Autos de infração ambiental carregados do Supabase público, com dados do IBAMA Dados Abertos.",
        lastSyncedAt,
        errors,
      };
    }
  } catch (error) {
    errors.push(`Supabase: ${toErrorMessage(error)}`);
  }

  return {
    source: "empty",
    infracoes: [],
    message:
      "Nenhum auto de infração disponível no momento. A coleta do IBAMA roda periodicamente.",
    errors,
  };
}

export const loadInfracoes = listInfracoes;

// ─── Helpers de formatação reutilizáveis pela tela ─────────────────────────────

/** Formata centavos -> "R$ 1.234,56". undefined -> "—". */
export function formatMultaCents(cents: number | undefined): string {
  if (cents === undefined || !Number.isFinite(cents) || cents <= 0) return "—";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Formata uma data ISO (ou string crua) -> "dd/mm/aaaa". "" -> "—". */
export function formatDataInfracao(value: string | undefined): string {
  if (!value || value.trim() === "") return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
