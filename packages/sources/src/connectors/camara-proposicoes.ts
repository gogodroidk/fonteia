// Conector da Câmara dos Deputados — Proposições (Dados Abertos).
// API pública, aberta e anônima (sem auth, sem chave):
//   https://dadosabertos.camara.leg.br/api/v2/proposicoes
//
// Endpoint usado (proposições/projetos de lei em tramitação):
//   GET /api/v2/proposicoes
//     ?ano={ano}             (ex.: 2026)
//     &ordem=DESC
//     &ordenarPor=id
//     &itens={n}             (itens por página; teto da API ~100)
//     [&pagina={n}]          (1-based; aparece no link rel="next")
//
// A resposta vem num envelope { dados, links }. Cada item de `dados` já traz a
// estrutura pronta (id, siglaTipo, numero, ano, ementa) — sem PDF, sem OCR.
// Normalizamos cada proposição num objeto estável guardado em
// entities.attributes (kind = legal_proposition).
//
// Paginação: a API expõe links HATEOAS no array `links` (rel = self|next|first|
// last). Seguimos o `next` até ele sumir ou bater o teto de segurança.
//
// Estratégia JSON-first, igual ao conector da Câmara/deputados e do PNCP: a fonte
// oficial entrega tudo estruturado; só achatamos e normalizamos.

import { fetchWithRetry } from "../internal/http";

export const CAMARA_PROPOSICOES_API_BASE = "https://dadosabertos.camara.leg.br/api/v2";

/** User-Agent honesto — não fingir navegador (espelha "camara-deputados"). */
export const CAMARA_PROPOSICOES_USER_AGENT =
  "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

/** Identificador da fonte gravado em cada item (fonte já existe e está 'connected'). */
export const CAMARA_PROPOSICOES_SOURCE_ID = "camara-dados-abertos";

const DEFAULT_HEADERS: Record<string, string> = {
  accept: "application/json",
  "user-agent": CAMARA_PROPOSICOES_USER_AGENT,
};

// ---------------------------------------------------------------------------
// Tipos crus (subset do que /proposicoes devolve — amostra real).
// ---------------------------------------------------------------------------

export interface CamaraProposicaoRaw {
  id: number;
  uri?: string;
  /** Sigla do tipo (ex.: "PL", "PEC", "MPV", "REQ"). */
  siglaTipo: string;
  codTipo?: number;
  numero: number;
  ano: number;
  ementa: string;
  dataApresentacao?: string;
  [key: string]: unknown;
}

export interface CamaraProposicaoLink {
  rel: string;
  href: string;
}

/** Envelope padrão das consultas da Câmara (lista + links HATEOAS). */
export interface CamaraProposicoesResponse<T> {
  dados: T[];
  links: CamaraProposicaoLink[];
}

// ---------------------------------------------------------------------------
// Proposição normalizada — o que o produto lê (guardado em entities.attributes).
// Campos claros; chave estável = id da proposição na Câmara (como string).
// ---------------------------------------------------------------------------

export interface CamaraProposicao {
  /** Id estável = id da proposição na Câmara, como string. */
  id: string;
  sourceId: string;
  /** Sigla do tipo (ex.: "PL", "PEC", "MPV"). "" quando ausente. */
  tipo: string;
  /** Número da proposição. */
  numero: number;
  /** Ano da proposição. */
  ano: number;
  /** Título legível: `${tipo} ${numero}/${ano}` (ex.: "PL 3091/2026"). */
  titulo: string;
  /** Ementa (resumo oficial da proposição). "" quando ausente. */
  ementa: string;
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

export interface FetchProposicoesParams {
  /** Ano da proposição (ex.: 2026). */
  ano?: number;
  /** Página 1-based. Default: omitida (a API começa na 1). */
  pagina?: number;
  /** Itens por página. Default 100 (teto prático da API). */
  itens?: number;
  /** Ordem (ASC | DESC). Default "DESC". */
  ordem?: "ASC" | "DESC";
  /** Campo de ordenação. Default "id". */
  ordenarPor?: string;
}

export function proposicoesUrl(params: FetchProposicoesParams = {}): string {
  const search = new URLSearchParams({
    ordem: params.ordem ?? "DESC",
    ordenarPor: params.ordenarPor ?? "id",
    itens: String(params.itens ?? 100),
  });
  if (params.ano !== undefined) search.set("ano", String(params.ano));
  if (params.pagina !== undefined) search.set("pagina", String(params.pagina));
  return `${CAMARA_PROPOSICOES_API_BASE}/proposicoes?${search.toString()}`;
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
      "Câmara Proposições: payload inesperado — esperado objeto com 'dados' (array).",
    );
  }
  return raw as T;
}

/** Uma página de proposições. */
export function fetchProposicoesPagina(
  params: FetchProposicoesParams = {},
  fetcher?: typeof fetch,
): Promise<CamaraProposicoesResponse<CamaraProposicaoRaw>> {
  return getJson(proposicoesUrl(params), fetcher);
}

/** Extrai o href do link `next` (paginação HATEOAS), se houver. */
export function nextProposicoesLink(links: CamaraProposicaoLink[] | undefined): string | null {
  const next = (links ?? []).find((l) => l.rel === "next");
  return next?.href ?? null;
}

/**
 * Varre TODAS as páginas de proposições de um (ou mais) ano(s) seguindo o link
 * `rel="next"`. Devolve os itens crus deduplicados por id. Para na primeira
 * página sem `next` ou sem dados.
 *
 * `maxPaginas` é um teto de segurança contra loop infinito. O default é 50
 * (cobertura generosa por ano). Valores ≤0 são tratados como o default seguro
 * (fix #7: evita loop sem teto). Passe Infinity apenas quando necessário.
 */
export async function fetchTodasProposicoes(
  params: FetchProposicoesParams = {},
  fetcher?: typeof fetch,
  maxPaginas = 50,
): Promise<CamaraProposicaoRaw[]> {
  // fix #7: maxPaginas=0 seria loop sem teto; normaliza para o default seguro.
  const limit = maxPaginas > 0 ? maxPaginas : 50;

  const out: CamaraProposicaoRaw[] = [];
  const seen = new Set<number>();
  let url: string | null = proposicoesUrl(params);
  let paginas = 0;

  while (url) {
    const page = await getJson<CamaraProposicoesResponse<CamaraProposicaoRaw>>(url, fetcher);
    for (const raw of page.dados ?? []) {
      if (raw?.id == null || seen.has(raw.id)) continue;
      seen.add(raw.id);
      out.push(raw);
    }
    paginas += 1;
    if (paginas >= limit) break;
    if ((page.dados ?? []).length === 0) break;
    url = nextProposicoesLink(page.links);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

export function normalizeProposicao(raw: CamaraProposicaoRaw): CamaraProposicao {
  const tipo = (raw.siglaTipo ?? "").trim();
  const numeroNum = Number(raw.numero);
  const anoNum = Number(raw.ano);
  // Payload cru (JSON externo): numero/ano podem faltar/ser não-numéricos →
  // evita compor um título "PL NaN/NaN".
  const numero = Number.isFinite(numeroNum) ? numeroNum : 0;
  const ano = Number.isFinite(anoNum) ? anoNum : 0;
  const titulo = numero && ano ? `${tipo} ${numero}/${ano}`.trim() : tipo;

  return {
    id: String(raw.id),
    sourceId: CAMARA_PROPOSICOES_SOURCE_ID,
    tipo,
    numero,
    ano,
    titulo,
    ementa: (raw.ementa ?? "").trim(),
  };
}

/** Normaliza um lote inteiro de itens crus. */
export function normalizeProposicoes(items: CamaraProposicaoRaw[]): CamaraProposicao[] {
  return items.map((raw) => normalizeProposicao(raw));
}
