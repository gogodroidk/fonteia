import type { IbamaInfracao } from "@fonteia/sources";
import { fetchAllD1Entities, firstUpdatedAt } from "../../lib/d1-client";

export type AmbientalDataSource = "supabase" | "empty";

export interface AmbientalLoadResult {
  source: AmbientalDataSource;
  infracoes: IbamaInfracao[];
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Paginação via D1 (primário) com fallback para Supabase; cada página traz até 1000 linhas.
const MAX_PAGES = 10; // até 10.000 linhas

async function fetchSupabaseInfracoes(
  fetcher: typeof fetch,
): Promise<{ infracoes: IbamaInfracao[]; lastSyncedAt?: string | undefined }> {
  // kind = environmental_infraction é o auto de infração ambiental (IBAMA).
  // Lê do D1 (primário) com fallback para o Supabase via o cliente compartilhado.
  const { rows } = await fetchAllD1Entities<IbamaInfracao>(
    { kind: "environmental_infraction" },
    { maxPages: MAX_PAGES, fetcher },
  );

  // Garante que só pegamos autos do IBAMA (entities mistura outras fontes).
  const infracoes = rows
    .map((r) => r.attributes)
    .filter((item) => item?.sourceId === "ibama-dados-abertos");

  return { infracoes, lastSyncedAt: firstUpdatedAt(rows) };
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
