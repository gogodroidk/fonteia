// Conector do Querido Diário — Open Knowledge Brasil (OKBR).
// Acervo público de DIÁRIOS OFICIAIS MUNICIPAIS em texto, com busca full-text.
// API pública, sem auth, sem chave. Recomendação de uso educado: ~60 req/min.
//
// Host confirmado por fetch ao vivo (2026-07-07): `queridodiario.ok.org.br` está
// atrás de um desafio Cloudflare (retorna HTML "Just a moment..." para clientes
// sem JS) — NÃO é utilizável por um coletor de servidor. O host que responde JSON
// diretamente é:
//
//   GET https://api.queridodiario.ok.org.br/gazettes
//     ?querystring=...       (termo de busca full-text; ex.: "pregão")
//     &territory_ids=...     (código IBGE do município; opcional)
//     &published_since=...   (AAAA-MM-DD; opcional)
//     &published_until=...   (AAAA-MM-DD; opcional)
//     &size=...               (itens por página; testado até 10, usar <=50)
//     &offset=...             (paginação; 0-based)
//     &excerpt_size=...       (tamanho do trecho de texto por ocorrência)
//     &number_of_excerpts=... (quantidade de trechos por diário)
//
// Resposta confirmada (payload real, 2026-07-07):
//   {
//     "total_gazettes": 10000,
//     "gazettes": [
//       {
//         "territory_id": "3522703",
//         "date": "2024-01-05",
//         "scraped_at": "2024-01-06T01:28:06.407883",
//         "url": "https://data.queridodiario.ok.org.br/.../xxxx.pdf",
//         "territory_name": "Itápolis",
//         "state_code": "SP",
//         "excerpts": ["... trecho com o termo buscado ..."],
//         "edition": "2132",
//         "is_extra_edition": false,
//         "txt_url": "https://data.queridodiario.ok.org.br/.../xxxx.txt"
//       }
//     ]
//   }
//
// IMPORTANTE: Querido Diário NÃO é dado estruturado de licitação — é texto de
// diário oficial. A estratégia é buscar por termos típicos de aviso de licitação
// ("pregão", "tomada de preços", "concorrência", "dispensa de licitação", etc.) e
// registrar cada OCORRÊNCIA (diário × termo) como uma oportunidade candidata, com
// rastreabilidade forte (o excerpt + a URL do diário = a evidência). Não há
// estrutura de valor/objeto/data-limite como no PNCP — só o texto bruto e a
// indicação de "aqui há um edital, veja a fonte".

import { fetchWithRetry } from "../internal/http";

/** Base da API pública do Querido Diário (confirmada por fetch ao vivo). */
export const QUERIDO_DIARIO_API_BASE = "https://api.queridodiario.ok.org.br";

/** User-Agent honesto — não fingir navegador. */
export const QUERIDO_DIARIO_USER_AGENT = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

/** Identificador da fonte gravado em cada item. */
export const QUERIDO_DIARIO_SOURCE_ID = "querido-diario";

/** Teto de itens por página que a API tolera bem em uso educado. */
export const QUERIDO_DIARIO_MAX_PAGE_SIZE = 50;

/**
 * Termos de busca padrão — indícios textuais de aviso/aberturas de licitação em
 * diários oficiais municipais (cobre as modalidades da Lei 14.133/2021 e o jargão
 * legado da Lei 8.666/93, ainda comum em municípios pequenos).
 */
export const DEFAULT_LICITACAO_TERMS: readonly string[] = [
  "aviso de licitação",
  "pregão eletrônico",
  "pregão presencial",
  "tomada de preços",
  "concorrência pública",
  "dispensa de licitação",
  "inexigibilidade de licitação",
  "chamamento público",
];

const DEFAULT_HEADERS: Record<string, string> = {
  accept: "application/json",
  "user-agent": QUERIDO_DIARIO_USER_AGENT,
};

// ---------------------------------------------------------------------------
// Tipos crus — formato confirmado por fetch ao vivo em api.queridodiario.ok.org.br
// ---------------------------------------------------------------------------

export interface QueridoDiarioGazetteRaw {
  territory_id: string;
  date: string;
  scraped_at?: string;
  url: string;
  territory_name?: string;
  state_code?: string;
  excerpts?: string[];
  edition?: string;
  is_extra_edition?: boolean;
  txt_url?: string;
}

export interface QueridoDiarioSearchResponse {
  total_gazettes: number;
  gazettes: QueridoDiarioGazetteRaw[];
}

// ---------------------------------------------------------------------------
// Oportunidade normalizada — o que o produto lê (guardado em entities.attributes)
// ---------------------------------------------------------------------------

export interface QueridoDiarioOpportunity {
  /**
   * Id estável e determinístico da ocorrência: hash simples de
   * `territory_id + date + edition + termo` (uma linha por par diário×termo,
   * já que o mesmo diário pode casar com vários termos de busca).
   */
  id: string;
  sourceId: string;
  municipio: string;
  uf: string;
  ibgeCode: string;
  data: string;
  /** Trecho de texto que casou com o termo buscado (a evidência textual). */
  trecho: string;
  /** Termo de busca que gerou esta ocorrência (ex.: "pregão eletrônico"). */
  termo: string;
  edicao?: string;
  extraEdicao: boolean;
  /** URL do PDF do diário — a fonte clicável/rastreável. */
  sourceUrl: string;
  /** URL do texto puro (.txt), quando disponível — útil para reprocessamento. */
  txtUrl?: string;
  /** Quando o Querido Diário raspou este diário (metadado da fonte). */
  scrapedAt?: string;
  /** Quando este registro foi coletado por nós (ISO). */
  collectedAt: string;
  /** Eco cru do item da API (auditoria/trilha de fonte). */
  raw: QueridoDiarioGazetteRaw;
}

// ---------------------------------------------------------------------------
// URL / fetch
// ---------------------------------------------------------------------------

export interface FetchGazettesParams {
  querystring: string;
  territoryIds?: string[];
  publishedSince?: string;
  publishedUntil?: string;
  size?: number;
  offset?: number;
  excerptSize?: number;
  numberOfExcerpts?: number;
}

export function gazettesSearchUrl(params: FetchGazettesParams): string {
  const search = new URLSearchParams({
    querystring: params.querystring,
    size: String(Math.min(params.size ?? QUERIDO_DIARIO_MAX_PAGE_SIZE, QUERIDO_DIARIO_MAX_PAGE_SIZE)),
    offset: String(params.offset ?? 0),
    excerpt_size: String(params.excerptSize ?? 500),
    number_of_excerpts: String(params.numberOfExcerpts ?? 1),
  });
  if (params.territoryIds?.length) {
    for (const id of params.territoryIds) search.append("territory_ids", id);
  }
  if (params.publishedSince) search.set("published_since", params.publishedSince);
  if (params.publishedUntil) search.set("published_until", params.publishedUntil);
  return `${QUERIDO_DIARIO_API_BASE}/gazettes?${search.toString()}`;
}

async function getJson<T>(url: string, fetcher: typeof fetch | undefined): Promise<T> {
  const response = await fetchWithRetry(url, { init: { headers: DEFAULT_HEADERS }, fetcher });
  if (!response.ok) {
    throw new Error(`Querido Diário respondeu ${response.status} em ${url}`);
  }
  const raw = (await response.json()) as unknown;
  if (
    typeof raw !== "object" ||
    raw === null ||
    !Array.isArray((raw as Record<string, unknown>).gazettes)
  ) {
    throw new Error("Querido Diário /gazettes: payload inesperado — esperado { gazettes: [...] }.");
  }
  return raw as T;
}

/** Uma página de resultados de busca full-text por um termo. */
export function fetchGazettes(
  params: FetchGazettesParams,
  fetcher?: typeof fetch,
): Promise<QueridoDiarioSearchResponse> {
  return getJson(gazettesSearchUrl(params), fetcher);
}

// ---------------------------------------------------------------------------
// Normalização (funções puras — testáveis sem rede)
// ---------------------------------------------------------------------------

/**
 * Hash determinístico curto (FNV-1a, 32 bits, hex) — sem dependência de Node
 * `crypto` para funcionar igual em Deno (Edge Function) e em Node (testes/vitest).
 */
export function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Constrói o id estável de uma ocorrência (diário × termo). */
export function opportunityId(gazette: QueridoDiarioGazetteRaw, termo: string): string {
  const key = `${gazette.territory_id}|${gazette.date}|${gazette.edition ?? ""}|${termo.toLowerCase()}`;
  return `qd-${stableHash(key)}`;
}

/** Normaliza um gazette (para um termo específico) num objeto de oportunidade. */
export function normalizeGazette(
  gazette: QueridoDiarioGazetteRaw,
  termo: string,
  collectedAt: string,
): QueridoDiarioOpportunity {
  const out: QueridoDiarioOpportunity = {
    id: opportunityId(gazette, termo),
    sourceId: QUERIDO_DIARIO_SOURCE_ID,
    municipio: (gazette.territory_name ?? "").trim() || "Município não informado",
    uf: gazette.state_code ?? "",
    ibgeCode: gazette.territory_id,
    data: gazette.date,
    trecho: (gazette.excerpts?.[0] ?? "").trim(),
    termo,
    extraEdicao: gazette.is_extra_edition ?? false,
    sourceUrl: gazette.url,
    collectedAt,
    raw: gazette,
  };
  if (gazette.edition) out.edicao = gazette.edition;
  if (gazette.txt_url) out.txtUrl = gazette.txt_url;
  if (gazette.scraped_at) out.scrapedAt = gazette.scraped_at;
  return out;
}

/** Normaliza um lote inteiro de gazettes vindos de uma busca por `termo`. */
export function normalizeGazettes(
  gazettes: QueridoDiarioGazetteRaw[],
  termo: string,
  collectedAt: string,
): QueridoDiarioOpportunity[] {
  return gazettes.map((g) => normalizeGazette(g, termo, collectedAt));
}

/** Deduplica oportunidades pelo `id` estável (mesmo diário casando 2x o mesmo termo). */
export function dedupeOpportunities(items: QueridoDiarioOpportunity[]): QueridoDiarioOpportunity[] {
  const seen = new Set<string>();
  const out: QueridoDiarioOpportunity[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
