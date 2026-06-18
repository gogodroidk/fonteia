// Conector do IBGE Localidades — catálogo oficial dos municípios brasileiros.
// API pública, aberta e anônima (sem auth, sem chave):
//   https://servicodados.ibge.gov.br/api/v1/localidades/municipios
//
// Uma única chamada devolve TODOS os ~5570 municípios, cada um já com a árvore
// de divisão territorial (microrregião → mesorregião → UF → região). Não há
// paginação nem PDF — só achatamos a estrutura num objeto estável guardado em
// entities.attributes (kind = municipality).
//
// Estratégia JSON-first, igual ao conector do PNCP (pncp-licitacoes.ts): a fonte
// oficial entrega tudo estruturado; só normalizamos.

import { fetchWithRetry } from "../internal/http";

export const IBGE_LOCALIDADES_BASE = "https://servicodados.ibge.gov.br/api/v1/localidades";

/** User-Agent honesto — não fingir navegador (espelha "pncp-contratacoes"). */
export const IBGE_USER_AGENT = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

/** Identificador da fonte gravado em cada item (espelha "pncp-contratacoes"). */
export const IBGE_SOURCE_ID = "ibge-localidades";

const DEFAULT_HEADERS: Record<string, string> = {
  accept: "application/json",
  "user-agent": IBGE_USER_AGENT,
};

// ---------------------------------------------------------------------------
// Tipos crus (subset do que /localidades/municipios devolve — amostra real).
// ---------------------------------------------------------------------------

export interface IbgeRegiaoRaw {
  id?: number;
  sigla?: string;
  nome?: string;
}

export interface IbgeUfRaw {
  id?: number;
  sigla?: string;
  nome?: string;
  regiao?: IbgeRegiaoRaw;
}

export interface IbgeMesorregiaoRaw {
  id?: number;
  nome?: string;
  UF?: IbgeUfRaw;
}

export interface IbgeMicrorregiaoRaw {
  id?: number;
  nome?: string;
  mesorregiao?: IbgeMesorregiaoRaw;
}

export interface IbgeMunicipioRaw {
  id: number;
  nome: string;
  microrregiao?: IbgeMicrorregiaoRaw;
  // A API também devolve "regiao-imediata"/"regiao-intermediaria"; não são
  // necessárias para a normalização, mas ficam preservadas no eco cru.
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Município normalizado — o que o produto lê (guardado em entities.attributes).
// Campos claros em camelCase; chave estável = código IBGE de 7 dígitos.
// ---------------------------------------------------------------------------

export interface IbgeMunicipio {
  /** Id estável = código IBGE (7 dígitos, como string). */
  id: string;
  sourceId: string;
  /** Mesmo valor de `id`; explícito para leitura/depuração. */
  codigoIbge: string;
  /** Nome do município (ex.: "Goiânia"). */
  nome: string;
  /** Sigla da UF (ex.: "GO"). "" quando ausente. */
  uf: string;
  /** Nome da UF (ex.: "Goiás"). "" quando ausente. */
  ufNome: string;
  /** Região (ex.: "Centro-Oeste"). "" quando ausente. */
  regiao: string;
  /** Mesorregião (ex.: "Centro Goiano"). "" quando ausente. */
  mesorregiao: string;
  /** Microrregião (ex.: "Goiânia"). "" quando ausente. */
  microrregiao: string;
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/** URL do catálogo completo de municípios (ordenado por nome). */
export function municipiosUrl(): string {
  return `${IBGE_LOCALIDADES_BASE}/municipios?orderBy=nome`;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function getJson<T>(url: string, fetcher: typeof fetch | undefined): Promise<T> {
  const response = await fetchWithRetry(url, {
    init: { headers: DEFAULT_HEADERS },
    fetcher,
  });
  if (!response.ok) {
    throw new Error(`IBGE respondeu ${response.status} em ${url}`);
  }
  const raw = (await response.json()) as unknown;
  // Guarda mínima: a lista de municípios deve ser um array (fix #6).
  if (!Array.isArray(raw)) {
    throw new Error(
      "IBGE /localidades/municipios: payload inesperado — esperado array de municípios.",
    );
  }
  return raw as T;
}

/** Busca a lista completa (crua) de municípios do IBGE. Uma única chamada. */
export function fetchMunicipiosRaw(fetcher?: typeof fetch): Promise<IbgeMunicipioRaw[]> {
  return getJson(municipiosUrl(), fetcher);
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

export function normalizeMunicipio(raw: IbgeMunicipioRaw): IbgeMunicipio {
  const micro = raw.microrregiao ?? {};
  const meso = micro.mesorregiao ?? {};
  const uf = meso.UF ?? {};
  const regiao = uf.regiao ?? {};

  return {
    id: String(raw.id),
    sourceId: IBGE_SOURCE_ID,
    codigoIbge: String(raw.id),
    nome: (raw.nome ?? "").trim(),
    uf: (uf.sigla ?? "").trim(),
    ufNome: (uf.nome ?? "").trim(),
    regiao: (regiao.nome ?? "").trim(),
    mesorregiao: (meso.nome ?? "").trim(),
    microrregiao: (micro.nome ?? "").trim(),
  };
}

/** Normaliza a lista inteira de municípios crus. */
export function normalizeMunicipios(items: IbgeMunicipioRaw[]): IbgeMunicipio[] {
  return items.map((raw) => normalizeMunicipio(raw));
}
