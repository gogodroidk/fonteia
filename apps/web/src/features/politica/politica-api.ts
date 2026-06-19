import type { CamaraDeputado } from "@fonteia/sources";
import { fetchAllD1Entities, firstUpdatedAt } from "../../lib/d1-client";

export type PoliticaDataSource = "supabase" | "empty";

// ─── Casa (house of the legislator) ─────────────────────────────────────────

/** Casa legislativa derivada do sourceId ou do campo attributes.casa. */
export type CasaLegislativa = "camara" | "senado" | "outro";

function deriveCasa(sourceId: unknown, attrCasa: unknown): CasaLegislativa {
  // Prefer an explicit attributes.casa written by the ingestor.
  if (typeof attrCasa === "string") {
    if (attrCasa === "camara") return "camara";
    if (attrCasa === "senado") return "senado";
  }
  // Fall back to sourceId.
  if (typeof sourceId === "string") {
    if (sourceId === "camara-dados-abertos") return "camara";
    if (sourceId === "senado-dados-abertos") return "senado";
  }
  return "outro";
}

// ─── Parlamentar (unified across houses) ─────────────────────────────────────

/**
 * Parlamentar normalizado — superset de CamaraDeputado.
 *
 * `CamaraDeputado` keeps all its original fields intact; we add `casa` and
 * optional Senado-specific fields without removing anything, so callers that
 * consume the old shape continue to work.
 *
 * NOTE: For Câmara rows `nome` is the parliamentary name; for Senado rows
 * the ingestor stores NomeParlamentar in `nome` at the top-level of attributes.
 */
export interface Parlamentar extends CamaraDeputado {
  /** Casa legislativa do mandato. */
  casa: CasaLegislativa;
  /** URL da página oficial no portal da casa (Senado usa urlPagina). */
  urlPagina?: string | undefined;
  /** Nome completo (Senado: NomeCompletoParlamentar). */
  nomeCompleto?: string | undefined;
}

// ─── PoliticaLoadResult ───────────────────────────────────────────────────────

export interface PoliticaLoadResult {
  source: PoliticaDataSource;
  /** Todos os parlamentares — Câmara + Senado (quando ingeridos). */
  deputados: Parlamentar[];
  /**
   * @deprecated Use `deputados` instead. Kept for backwards-compat with
   * existing callers that destructure `{ deputados }` as CamaraDeputado[].
   * Contains the same array as `deputados`.
   */
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Máximo de páginas por requisição — protege contra loop infinito.
// Com pageSize=1000 e maxPages=3 buscamos até 3.000 parlamentares (Câmara
// ~513 + Senado ~81 = ~594 no total quando ambas as ingestões tiverem rodado).
const MAX_SUPABASE_PAGES = 3;

/**
 * Normaliza qualquer linha de kind="politician" para Parlamentar.
 *
 * Câmara: attributes é CamaraDeputado { id, sourceId, nome, partido, uf, foto, email }.
 * Senado: attributes é o payload do ingest-senado {
 *   id, sourceId, nome, partido, uf, email, foto, urlPagina,
 *   attributes: { casa, partido, uf, email, foto, ... }, raw
 * }.
 *
 * Ambos têm nome/partido/uf/email/foto no topo de attributes, portanto a
 * leitura é uniforme.
 *
 * NOTE: Senado depende de ingest-senado ter rodado. Se a ingestão ainda não
 * ocorreu, apenas a Câmara aparece — isso é correto e esperado.
 */
function normalizePolitician(
  attrs: Record<string, unknown>,
  rowId: string,
): Parlamentar {
  const sourceId = attrs["sourceId"];
  const attrNested = attrs["attributes"];
  const attrCasa =
    typeof attrNested === "object" && attrNested !== null
      ? (attrNested as Record<string, unknown>)["casa"]
      : undefined;

  const casa = deriveCasa(sourceId, attrCasa);

  // Common scalar fields — safe with exactOptionalPropertyTypes because we
  // always produce a string (never leave as undefined for required fields).
  const id = typeof attrs["id"] === "string" && attrs["id"] !== "" ? attrs["id"] : rowId;
  const nome = typeof attrs["nome"] === "string" ? attrs["nome"] : "";
  const partido = typeof attrs["partido"] === "string" ? attrs["partido"] : "";
  const uf = typeof attrs["uf"] === "string" ? attrs["uf"] : "";
  const foto = typeof attrs["foto"] === "string" ? attrs["foto"] : "";
  const email = typeof attrs["email"] === "string" ? attrs["email"] : "";
  const urlPagina =
    typeof attrs["urlPagina"] === "string" && attrs["urlPagina"] !== ""
      ? attrs["urlPagina"]
      : undefined;
  const nomeCompleto =
    typeof attrs["nomeCompleto"] === "string" && attrs["nomeCompleto"] !== ""
      ? attrs["nomeCompleto"]
      : undefined;

  return {
    id,
    sourceId: typeof sourceId === "string" ? sourceId : "",
    nome,
    partido,
    uf,
    foto,
    email,
    casa,
    ...(urlPagina !== undefined ? { urlPagina } : {}),
    ...(nomeCompleto !== undefined ? { nomeCompleto } : {}),
  };
}

async function fetchAllParlamentares(
  fetcher: typeof fetch,
): Promise<{ parlamentares: Parlamentar[]; lastSyncedAt?: string | undefined }> {
  // kind = politician abrange deputados (camara-dados-abertos) e senadores
  // (senado-dados-abertos). Nenhum filtro de sourceId — aceitamos tudo.
  const { rows } = await fetchAllD1Entities<Record<string, unknown>>(
    { kind: "politician" },
    { maxPages: MAX_SUPABASE_PAGES, fetcher },
  );

  const parlamentares = rows
    .filter((r) => r.attributes != null)
    .map((r) => normalizePolitician(r.attributes, r.id));

  return { parlamentares, lastSyncedAt: firstUpdatedAt(rows) };
}

/**
 * Carrega TODOS os parlamentares em exercício de TODAS as casas disponíveis
 * no D1 (Câmara e Senado quando ingerido).
 *
 * Degrada graciosamente: se apenas a Câmara estiver disponível (Senado ainda
 * não ingerido), retorna somente os deputados. Nunca fabrica senadores.
 */
export async function listDeputados(fetcher: typeof fetch = fetch): Promise<PoliticaLoadResult> {
  const errors: string[] = [];

  try {
    const { parlamentares, lastSyncedAt } = await fetchAllParlamentares(fetcher);

    if (parlamentares.length > 0) {
      const camaraCount = parlamentares.filter((p) => p.casa === "camara").length;
      const senadoCount = parlamentares.filter((p) => p.casa === "senado").length;

      const parts: string[] = [];
      if (camaraCount > 0) parts.push(`${camaraCount} deputados`);
      if (senadoCount > 0) parts.push(`${senadoCount} senadores`);

      return {
        source: "supabase",
        deputados: parlamentares,
        message:
          parts.length > 0
            ? `${parts.join(" e ")} em exercício carregados do D1.`
            : "Parlamentares carregados do D1.",
        lastSyncedAt,
      };
    }
  } catch (error) {
    errors.push(`D1: ${toErrorMessage(error)}`);
  }

  return {
    source: "empty",
    deputados: [],
    message:
      "Nenhum parlamentar disponível no momento. A coleta da Câmara e do Senado roda periodicamente.",
    errors,
  };
}

/** Alias mantido para compatibilidade com importadores existentes. */
export const loadDeputados = listDeputados;

// ─── parliamentary_expense ───────────────────────────────────────────────────

export type DespesaAttributes = {
  deputadoId: string;
  partido: string;
  uf: string;
  tipo: string;
  fornecedor: string;
  cnpjFornecedor: string;
  valorDocumento: number;
  valorLiquido: number;
  dataDocumento: string;
  ano: number;
  mes: number;
  urlDocumento: string;
};

export type DespesaItem = {
  id: string;
  attributes: DespesaAttributes;
};

export interface DespesasLoadResult {
  source: PoliticaDataSource;
  despesas: DespesaItem[];
  lastSyncedAt?: string | undefined;
  errors?: string[];
}

export async function listDespesas(fetcher: typeof fetch = fetch): Promise<DespesasLoadResult> {
  const errors: string[] = [];

  try {
    const { rows } = await fetchAllD1Entities<DespesaAttributes>(
      { kind: "parliamentary_expense" },
      { maxPages: 10, fetcher },
    );

    const despesas: DespesaItem[] = rows.map((r) => ({ id: r.id, attributes: r.attributes }));

    if (despesas.length > 0) {
      return {
        source: "supabase",
        despesas,
        lastSyncedAt: firstUpdatedAt(rows),
      };
    }
  } catch (error) {
    errors.push(`Supabase: ${toErrorMessage(error)}`);
  }

  return {
    source: "empty",
    despesas: [],
    errors,
  };
}

// ─── legislative_vote ────────────────────────────────────────────────────────

export type ProposicaoRef = {
  id?: number;
  sigla?: string;
  numero?: number;
  ano?: number;
  ementa?: string;
};

export type VotoDeputado = {
  deputadoId: string;
  voto: string;
};

export type VotacaoAttributes = {
  data: string;
  siglaOrgao: string;
  aprovacao: boolean;
  placarSim: number;
  placarNao: number;
  placarAbstencoes: number;
  proposicao: ProposicaoRef;
  votos: VotoDeputado[];
};

export type VotacaoItem = {
  id: string;
  /**
   * ID numérico da votação na API da Câmara dos Deputados.
   * Extraído de `external_ids.votacaoId` (escrito pelo ingestor) ou inferido
   * do `row.id` quando este for numérico. Usado para montar o link oficial:
   * `https://www.camara.leg.br/votacoes/{votacaoId}`
   */
  votacaoId?: string | undefined;
  attributes: VotacaoAttributes;
};

export interface VotacoesLoadResult {
  source: PoliticaDataSource;
  votacoes: VotacaoItem[];
  lastSyncedAt?: string | undefined;
  errors?: string[];
}

export async function listVotacoes(fetcher: typeof fetch = fetch): Promise<VotacoesLoadResult> {
  const errors: string[] = [];

  try {
    const { rows } = await fetchAllD1Entities<VotacaoAttributes>(
      { kind: "legislative_vote" },
      { maxPages: 5, fetcher },
    );

    const votacoes: VotacaoItem[] = rows.map((r) => {
      // Tenta extrair o ID numérico da votação para compor o link oficial.
      // O ingestor escreve `external_ids.votacaoId`; se ausente, usamos o
      // próprio `r.id` quando for numérico (alguns ingestors gravam o id da
      // Câmara como primary key do D1 row).
      const extId = r.external_ids["votacaoId"];
      const votacaoId: string | undefined =
        typeof extId === "string" && extId !== ""
          ? extId
          : typeof extId === "number"
            ? String(extId)
            : /^\d+$/.test(r.id)
              ? r.id
              : undefined;
      return { id: r.id, votacaoId, attributes: r.attributes };
    });

    if (votacoes.length > 0) {
      return {
        source: "supabase",
        votacoes,
        lastSyncedAt: firstUpdatedAt(rows),
      };
    }
  } catch (error) {
    errors.push(`Supabase: ${toErrorMessage(error)}`);
  }

  return {
    source: "empty",
    votacoes: [],
    errors,
  };
}
