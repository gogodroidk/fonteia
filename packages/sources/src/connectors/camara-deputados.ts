// Conector da Câmara dos Deputados — Dados Abertos.
// API pública, aberta e anônima (sem auth, sem chave):
//   https://dadosabertos.camara.leg.br/api/v2/deputados
//
// Endpoint usado (deputados em exercício na legislatura atual):
//   GET /api/v2/deputados
//     ?ordem=ASC
//     &ordenarPor=nome
//     [&pagina={n}]          (1-based; default devolve a lista inteira)
//     [&itens={n}]           (itens por página)
//
// A resposta vem num envelope { dados, links }. Cada item de `dados` já traz a
// estrutura pronta (id, nome, sigla do partido, UF, foto, e-mail) — sem PDF, sem
// OCR. Normalizamos cada deputado num objeto estável guardado em
// entities.attributes (kind = politician).
//
// Paginação: a API expõe links HATEOAS no array `links` (rel = self|next|first|
// last). Seguimos o `next` até ele sumir. Como uma chamada sem `itens` já devolve
// os ~513 deputados em exercício numa página só, na prática raramente há `next` —
// mas seguir os links mantém o conector correto se a Câmara reduzir o teto.
//
// Estratégia JSON-first, igual ao conector do PNCP (pncp-licitacoes.ts): a fonte
// oficial entrega tudo estruturado; só achatamos e normalizamos.

import { fetchWithRetry } from "../internal/http";

export const CAMARA_API_BASE = "https://dadosabertos.camara.leg.br/api/v2";

/** User-Agent honesto — não fingir navegador. */
export const CAMARA_USER_AGENT = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

/** Identificador da fonte gravado em cada item (espelha "pncp-contratacoes"). */
export const CAMARA_SOURCE_ID = "camara-dados-abertos";

const DEFAULT_HEADERS: Record<string, string> = {
  accept: "application/json",
  "user-agent": CAMARA_USER_AGENT,
};

// ---------------------------------------------------------------------------
// Tipos crus (subset do que /deputados devolve — amostra real).
// ---------------------------------------------------------------------------

export interface CamaraDeputadoRaw {
  id: number;
  uri?: string;
  nome: string;
  siglaPartido?: string;
  uriPartido?: string;
  siglaUf?: string;
  idLegislatura?: number;
  urlFoto?: string;
  email?: string;
}

export interface CamaraLink {
  rel: string;
  href: string;
}

/** Envelope padrão das consultas da Câmara (lista + links HATEOAS). */
export interface CamaraPaginatedResponse<T> {
  dados: T[];
  links: CamaraLink[];
}

// ---------------------------------------------------------------------------
// Deputado normalizado — o que o produto lê (guardado em entities.attributes).
// Campos claros, valores como strings estáveis.
// ---------------------------------------------------------------------------

export interface CamaraDeputado {
  /** Id estável = id do deputado na Câmara, como string. */
  id: string;
  sourceId: string;
  /** Nome parlamentar. */
  nome: string;
  /** Sigla do partido (ex.: "MDB", "PT"). "" quando não informado. */
  partido: string;
  /** UF do mandato (ex.: "SP", "AP"). "" quando não informado. */
  uf: string;
  /** URL da foto oficial. "" quando não informada. */
  foto: string;
  /** E-mail institucional. "" quando não informado. */
  email: string;
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

export interface FetchDeputadosParams {
  /** Página 1-based. Default: omitida (a API devolve a lista inteira). */
  pagina?: number;
  /** Itens por página. Default: omitido. */
  itens?: number;
  /** Ordem (ASC | DESC). Default "ASC". */
  ordem?: "ASC" | "DESC";
  /** Campo de ordenação. Default "nome". */
  ordenarPor?: string;
}

export function deputadosUrl(params: FetchDeputadosParams = {}): string {
  const search = new URLSearchParams({
    ordem: params.ordem ?? "ASC",
    ordenarPor: params.ordenarPor ?? "nome",
  });
  if (params.pagina !== undefined) search.set("pagina", String(params.pagina));
  if (params.itens !== undefined) search.set("itens", String(params.itens));
  return `${CAMARA_API_BASE}/deputados?${search.toString()}`;
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
    throw new Error(`Câmara respondeu ${response.status} em ${url}`);
  }
  const raw = (await response.json()) as unknown;
  // Guarda mínima: o envelope deve ter `dados` array (fix #6).
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("dados" in raw) ||
    !Array.isArray((raw as Record<string, unknown>).dados)
  ) {
    throw new Error(
      "Câmara Deputados: payload inesperado — esperado objeto com 'dados' (array).",
    );
  }
  return raw as T;
}

/** Uma página de deputados. */
export function fetchDeputadosPagina(
  params: FetchDeputadosParams = {},
  fetcher?: typeof fetch,
): Promise<CamaraPaginatedResponse<CamaraDeputadoRaw>> {
  return getJson(deputadosUrl(params), fetcher);
}

/** Extrai o href do link `next` (paginação HATEOAS), se houver. */
export function nextLink(links: CamaraLink[] | undefined): string | null {
  const next = (links ?? []).find((l) => l.rel === "next");
  return next?.href ?? null;
}

/**
 * Varre TODAS as páginas de deputados seguindo o link `rel="next"`. Devolve os
 * itens crus deduplicados por id. Para na primeira página sem `next` ou sem dados.
 *
 * `maxPaginas` é um teto de segurança contra loop infinito. O default é 20, que
 * cobre a lista completa de deputados com folga (fix #7: evita loop sem teto
 * quando maxPaginas=0 era passado). Passe Infinity apenas quando necessário.
 */
export async function fetchTodosDeputados(
  fetcher?: typeof fetch,
  maxPaginas = 20,
): Promise<CamaraDeputadoRaw[]> {
  // fix #7: maxPaginas=0 seria loop sem teto; normaliza para o default seguro.
  const limit = maxPaginas > 0 ? maxPaginas : 20;

  const out: CamaraDeputadoRaw[] = [];
  const seen = new Set<number>();
  let url: string | null = deputadosUrl();
  let paginas = 0;

  while (url) {
    const page = await getJson<CamaraPaginatedResponse<CamaraDeputadoRaw>>(url, fetcher);
    for (const raw of page.dados ?? []) {
      if (raw?.id == null || seen.has(raw.id)) continue;
      seen.add(raw.id);
      out.push(raw);
    }
    paginas += 1;
    if (paginas >= limit) break;
    if ((page.dados ?? []).length === 0) break;
    url = nextLink(page.links);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

export function normalizeDeputado(raw: CamaraDeputadoRaw): CamaraDeputado {
  return {
    id: String(raw.id),
    sourceId: CAMARA_SOURCE_ID,
    nome: (raw.nome ?? "").trim(),
    partido: (raw.siglaPartido ?? "").trim(),
    uf: (raw.siglaUf ?? "").trim(),
    foto: (raw.urlFoto ?? "").trim(),
    email: (raw.email ?? "").trim(),
  };
}

/** Normaliza um lote inteiro de itens crus. */
export function normalizeDeputados(items: CamaraDeputadoRaw[]): CamaraDeputado[] {
  return items.map((raw) => normalizeDeputado(raw));
}
