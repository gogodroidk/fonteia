import type { CamaraProposicao } from "@fonteia/sources";
import { getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";

export type JuridicoDataSource = "supabase" | "empty";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Proposições (kind=legal_proposition) ────────────────────────────────────

/** Proposição lida do Supabase (entities kind=legal_proposition). */
export type ProposicaoItem = CamaraProposicao;

export interface JuridicoLoadResult {
  source: JuridicoDataSource;
  proposicoes: ProposicaoItem[];
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
}

interface SupabaseProposicaoRow {
  attributes: CamaraProposicao;
  updated_at?: string;
}

async function fetchSupabaseProposicoes(
  fetcher: typeof fetch,
): Promise<{ proposicoes: ProposicaoItem[]; lastSyncedAt?: string | undefined }> {
  const { url: supabaseUrl, key: publishableKey } = getSupabasePublicConfig();

  // kind = legal_proposition é a entidade de proposição (Câmara — Dados Abertos).
  const rows = await fetchAllRows<SupabaseProposicaoRow>(
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

// ─── Processos judiciais (kind=legal_process) ─────────────────────────────────

/** Atributos de um processo judicial armazenados em entities.attributes. */
export interface ProcessoJudicialAttributes {
  tribunal?: string;
  grau?: string;
  classe?: string;
  /** Lista de assuntos do processo (CNJ). Pode ser array de strings ou objetos. */
  assuntos?: unknown[];
  orgaoJulgador?: string;
  dataAjuizamento?: string;
  qtdMovimentos?: number;
}

/** Processo judicial normalizado — lido de entities (kind=legal_process). */
export interface ProcessoJudicialItem {
  /** UUID do registro em entities. */
  id: string;
  /** Número CNJ do processo (ex.: "0000001-00.2024.8.26.0000"). */
  numeroProcesso: string;
  /** Atributos estruturados (tribunal, grau, classe, assuntos…). */
  attributes: ProcessoJudicialAttributes;
}

export interface ProcessosLoadResult {
  source: JuridicoDataSource;
  processos: ProcessoJudicialItem[];
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
}

/** Linha crua devolvida pelo PostgREST para kind=legal_process. */
interface SupabaseProcessoRow {
  id: string;
  external_ids: Record<string, unknown>;
  attributes: ProcessoJudicialAttributes;
  updated_at?: string;
}

/** Extrai o assunto principal (primeiro da lista) como string legível. */
export function assuntoPrincipal(attributes: ProcessoJudicialAttributes): string {
  const list = attributes.assuntos ?? [];
  if (list.length === 0) return "";
  const first = list[0];
  if (typeof first === "string") return first;
  if (first !== null && typeof first === "object") {
    const obj = first as Record<string, unknown>;
    const nome = obj["nome"] ?? obj["descricao"] ?? obj["titulo"] ?? obj["assunto"];
    if (typeof nome === "string" && nome.trim() !== "") return nome.trim();
  }
  return "";
}

async function fetchSupabaseProcessos(
  fetcher: typeof fetch,
): Promise<{ processos: ProcessoJudicialItem[]; lastSyncedAt?: string | undefined }> {
  const { url: supabaseUrl, key: publishableKey } = getSupabasePublicConfig();

  const rows = await fetchAllRows<SupabaseProcessoRow>(
    fetcher,
    supabaseUrl,
    publishableKey,
    "entities?kind=eq.legal_process&select=id,external_ids,attributes,updated_at&order=updated_at.desc",
    5, // 130 registros — uma página basta, folga de 5
    "processos",
  );

  const processos: ProcessoJudicialItem[] = rows.map((row) => ({
    id: row.id,
    numeroProcesso: typeof row.external_ids?.["numeroProcesso"] === "string"
      ? row.external_ids["numeroProcesso"]
      : "",
    attributes: row.attributes ?? {},
  }));

  return { processos, lastSyncedAt: rows.find((r) => r.updated_at)?.updated_at };
}

export async function listProcessos(fetcher: typeof fetch = fetch): Promise<ProcessosLoadResult> {
  const errors: string[] = [];

  try {
    const { processos, lastSyncedAt } = await fetchSupabaseProcessos(fetcher);

    if (processos.length > 0) {
      return {
        source: "supabase",
        processos,
        message: "Processos judiciais carregados do Supabase.",
        lastSyncedAt,
        errors,
      };
    }
  } catch (error) {
    errors.push(`Supabase: ${toErrorMessage(error)}`);
  }

  return {
    source: "empty",
    processos: [],
    message: "Nenhum processo judicial disponível no momento.",
    errors,
  };
}
