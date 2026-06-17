import type { CamaraProposicao } from "@fonteia/sources";
import { fetchAllD1Entities, firstUpdatedAt } from "../../lib/d1-client";

export type JuridicoDataSource = "supabase" | "empty";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Máximo de páginas por requisição — protege contra loop infinito em datasets
// grandes. A paginação é feita pelo cliente D1 (primário) com fallback Supabase.
const MAX_PROPOSICOES_PAGES = 12; // até 12.000 linhas

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

async function fetchSupabaseProposicoes(
  fetcher: typeof fetch,
): Promise<{ proposicoes: ProposicaoItem[]; lastSyncedAt?: string | undefined }> {
  // kind = legal_proposition é a entidade de proposição (Câmara — Dados Abertos).
  // Lê do D1 (primário) com fallback para o Supabase via o cliente compartilhado.
  const { rows } = await fetchAllD1Entities<CamaraProposicao>(
    { kind: "legal_proposition" },
    { maxPages: MAX_PROPOSICOES_PAGES, fetcher },
  );

  const proposicoes = rows
    .map((r) => r.attributes)
    .filter((item) => item?.sourceId === "camara-dados-abertos");

  return { proposicoes, lastSyncedAt: firstUpdatedAt(rows) };
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
  // kind = legal_process é o processo judicial. Lê do D1 (primário) com
  // fallback para o Supabase via o cliente compartilhado.
  const { rows } = await fetchAllD1Entities<ProcessoJudicialAttributes>(
    { kind: "legal_process" },
    { maxPages: 5, fetcher },
  );

  const processos: ProcessoJudicialItem[] = rows.map((row) => ({
    id: row.id,
    numeroProcesso:
      typeof row.external_ids["numeroProcesso"] === "string"
        ? (row.external_ids["numeroProcesso"] as string)
        : "",
    attributes: row.attributes ?? {},
  }));

  return { processos, lastSyncedAt: firstUpdatedAt(rows) };
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
