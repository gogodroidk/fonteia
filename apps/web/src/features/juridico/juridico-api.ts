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
): Promise<{
  proposicoes: ProposicaoItem[];
  lastSyncedAt?: string | undefined;
  dataSourceDown: boolean;
}> {
  // kind = legal_proposition é a entidade de proposição (Câmara — Dados Abertos).
  // Lê do D1 (primário) com fallback para o Supabase via o cliente compartilhado.
  const { rows, source } = await fetchAllD1Entities<CamaraProposicao>(
    { kind: "legal_proposition" },
    { maxPages: MAX_PROPOSICOES_PAGES, fetcher },
  );

  const proposicoes = rows
    .map((r) => r.attributes)
    .filter((item) => item?.sourceId === "camara-dados-abertos");

  // As proposições vivem só no D1. Origem=Supabase + vazio ⇒ o D1 caiu (não é
  // "sem dados"): sinaliza para o chamador devolver erro honesto, não vazio.
  const dataSourceDown = source === "supabase" && rows.length === 0;
  return { proposicoes, lastSyncedAt: firstUpdatedAt(rows), dataSourceDown };
}

export async function listProposicoes(fetcher: typeof fetch = fetch): Promise<JuridicoLoadResult> {
  const errors: string[] = [];

  try {
    const { proposicoes, lastSyncedAt, dataSourceDown } = await fetchSupabaseProposicoes(fetcher);

    if (proposicoes.length > 0) {
      return {
        source: "supabase",
        proposicoes,
        message: "Proposições da Câmara dos Deputados carregadas do Supabase público.",
        lastSyncedAt,
        errors,
      };
    }

    // D1 indisponível e nada veio: erro honesto e rastreável (não "0 resultados").
    if (dataSourceDown) {
      throw new Error(
        "A base de proposições (Cloudflare D1) está temporariamente indisponível. " +
          "Tente novamente em instantes.",
      );
    }
  } catch (error) {
    errors.push(`Supabase: ${toErrorMessage(error)}`);
    throw error instanceof Error ? error : new Error(toErrorMessage(error));
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

/**
 * Atributos de um processo judicial JÁ NORMALIZADOS para a tela.
 *
 * IMPORTANTE: o CNJ DataJud entrega `classe` e `orgaoJulgador` como OBJETOS
 * (`{ nome, codigo }`), e `assuntos` como array de objetos. Renderizar esses
 * objetos direto no JSX quebra a página ("Objects are not valid as a React
 * child") e cai no ErrorBoundary. Por isso a forma exposta aqui é sempre STRING
 * — a conversão acontece em `normalizeProcessoAttributes` ao ler do D1/Supabase.
 * A tela nunca enxerga objeto.
 */
export interface ProcessoJudicialAttributes {
  tribunal?: string;
  grau?: string;
  /** Nome legível da classe processual (ex.: "Cumprimento de sentença"). */
  classe?: string;
  /** Lista de assuntos do processo (CNJ), já achatada para strings legíveis. */
  assuntos?: string[];
  /** Nome legível do órgão julgador. */
  orgaoJulgador?: string;
  dataAjuizamento?: string;
  qtdMovimentos?: number;
}

/**
 * Forma CRUA de `attributes` como vem do CNJ DataJud no D1: campos que podem
 * chegar como objeto `{ nome, codigo }` em vez de string. Tudo `unknown` porque
 * o DataJud varia por movimentação e a tela jamais deve confiar no formato.
 */
interface ProcessoJudicialAttributesRaw {
  tribunal?: unknown;
  grau?: unknown;
  classe?: unknown;
  assuntos?: unknown;
  orgaoJulgador?: unknown;
  dataAjuizamento?: unknown;
  qtdMovimentos?: unknown;
}

/**
 * Extrai uma string legível de um valor que pode ser string, número ou um objeto
 * do tipo `{ nome | descricao | titulo | assunto, codigo }` (padrão CNJ DataJud).
 * Retorna "" quando não há nada legível. NUNCA devolve objeto — é o que blinda o
 * JSX contra "Objects are not valid as a React child".
 */
function readableLabel(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidate = obj["nome"] ?? obj["descricao"] ?? obj["titulo"] ?? obj["assunto"];
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate.trim();
    if (typeof candidate === "number") return String(candidate);
  }
  return "";
}

/** Achata `assuntos` (array de strings/objetos, ou ausente) em string[] legível. */
function readableAssuntos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(readableLabel).filter((s) => s !== "");
}

/**
 * Normaliza os atributos crus do CNJ DataJud para a forma que a tela consome:
 * `classe`/`orgaoJulgador` viram string (nunca objeto) e `assuntos` vira string[].
 * Defensivo: nunca lança; valores ausentes viram `undefined`/[].
 */
function normalizeProcessoAttributes(
  raw: ProcessoJudicialAttributesRaw | null | undefined,
): ProcessoJudicialAttributes {
  const a = raw ?? {};
  const tribunal = readableLabel(a.tribunal);
  const grau = readableLabel(a.grau);
  const classe = readableLabel(a.classe);
  const orgaoJulgador = readableLabel(a.orgaoJulgador);
  const dataAjuizamento = readableLabel(a.dataAjuizamento);
  const qtd = typeof a.qtdMovimentos === "number" ? a.qtdMovimentos : undefined;

  // Monta só com as chaves presentes (exactOptionalPropertyTypes: não setar undefined).
  const out: ProcessoJudicialAttributes = { assuntos: readableAssuntos(a.assuntos) };
  if (tribunal !== "") out.tribunal = tribunal;
  if (grau !== "") out.grau = grau;
  if (classe !== "") out.classe = classe;
  if (orgaoJulgador !== "") out.orgaoJulgador = orgaoJulgador;
  if (dataAjuizamento !== "") out.dataAjuizamento = dataAjuizamento;
  if (qtd !== undefined) out.qtdMovimentos = qtd;
  return out;
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

/**
 * Extrai o assunto principal (primeiro da lista) como string legível. Como
 * `assuntos` já vem achatado em string[] por `normalizeProcessoAttributes`,
 * basta pegar o primeiro item não-vazio. Tolerante a dados crus por segurança.
 */
export function assuntoPrincipal(attributes: ProcessoJudicialAttributes): string {
  const list = attributes.assuntos ?? [];
  for (const item of list) {
    const label = readableLabel(item);
    if (label !== "") return label;
  }
  return "";
}

async function fetchSupabaseProcessos(
  fetcher: typeof fetch,
): Promise<{
  processos: ProcessoJudicialItem[];
  lastSyncedAt?: string | undefined;
  dataSourceDown: boolean;
}> {
  // kind = legal_process é o processo judicial. Lê do D1 (primário) com
  // fallback para o Supabase via o cliente compartilhado. Lemos como forma CRUA
  // (campos podem ser objeto) e normalizamos para string ANTES de devolver — a
  // tela nunca recebe objeto, então nunca quebra ("Objects are not valid as a
  // React child").
  const { rows, source } = await fetchAllD1Entities<ProcessoJudicialAttributesRaw>(
    { kind: "legal_process" },
    { maxPages: 5, fetcher },
  );

  const processos: ProcessoJudicialItem[] = rows.map((row) => ({
    id: row.id,
    numeroProcesso:
      typeof row.external_ids["numeroProcesso"] === "string"
        ? (row.external_ids["numeroProcesso"] as string)
        : "",
    attributes: normalizeProcessoAttributes(row.attributes),
  }));

  // Processos vivem só no D1. Origem=Supabase + vazio ⇒ o D1 caiu, não é "vazio".
  const dataSourceDown = source === "supabase" && rows.length === 0;
  return { processos, lastSyncedAt: firstUpdatedAt(rows), dataSourceDown };
}

export async function listProcessos(fetcher: typeof fetch = fetch): Promise<ProcessosLoadResult> {
  const errors: string[] = [];

  try {
    const { processos, lastSyncedAt, dataSourceDown } = await fetchSupabaseProcessos(fetcher);

    if (processos.length > 0) {
      return {
        source: "supabase",
        processos,
        message: "Processos judiciais carregados do Supabase.",
        lastSyncedAt,
        errors,
      };
    }

    // D1 indisponível e nada veio: erro honesto e rastreável (não "0 resultados").
    if (dataSourceDown) {
      throw new Error(
        "A base de processos judiciais (Cloudflare D1) está temporariamente indisponível. " +
          "Tente novamente em instantes.",
      );
    }
  } catch (error) {
    errors.push(`Supabase: ${toErrorMessage(error)}`);
    throw error instanceof Error ? error : new Error(toErrorMessage(error));
  }

  return {
    source: "empty",
    processos: [],
    message: "Nenhum processo judicial disponível no momento.",
    errors,
  };
}
