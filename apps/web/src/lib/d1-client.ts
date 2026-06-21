/**
 * d1-client.ts — Cliente compartilhado do BULK no Cloudflare D1
 *
 * Lê as entidades do BULK (tudo MENOS leilões `auction_lot`) da edge function
 * `d1-bridge` (Cloudflare D1, primário) e, em qualquer falha/timeout/resposta
 * inválida, faz FALLBACK para a leitura REST do Supabase — exatamente o caminho
 * que os módulos usavam antes (`/rest/v1/entities?kind=eq.X` paginado por Range).
 *
 * Por que isso existe:
 *   migramos 168.994 entidades (tudo exceto `kind='auction_lot'`) do Supabase
 *   para o D1. O Supabase será esvaziado desse bulk (free tier). Os leilões
 *   (`auction_lot`) e a busca semântica por embeddings PERMANECEM no Supabase e
 *   NÃO passam por aqui.
 *
 * Contrato de saída — `D1EntityRow`:
 *   espelha 1:1 a linha que o PostgREST devolvia para a tabela `entities`, então
 *   cada módulo continua lendo `row.attributes`, `row.name`, `row.cnpj`,
 *   `row.external_ids`, `row.updated_at` etc. sem mudar a forma dos dados nem a UX.
 *
 * Endpoint D1 (no ar):
 *   GET {SUPABASE}/functions/v1/d1-bridge/query?kind=&cnpj=&q=&limit=&offset=
 *   header `apikey: <publishable>` — devolve `{count, entities:[...]}` com o JSON
 *   (attributes / external_ids / source_ids) JÁ parseado.
 *
 * Observação sobre filtros: como hoje, os módulos puxam por `kind` e filtram/
 * ordenam no cliente. O D1 suporta `kind + limit + offset` (+ `cnpj`/`q`), que é
 * suficiente. A ordenação visível continua sendo feita no cliente, então a
 * ordem de varredura do servidor é irrelevante para a tela.
 */

import {
  getSupabasePublicConfig,
  trimTrailingSlash,
} from "./api-client";
import { cachedFetch } from "./d1-cache";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

/**
 * Linha de entidade — mesma forma da linha `entities` do PostgREST que os
 * módulos já consomem. Genérica em `A` (o formato de `attributes` daquele kind).
 *
 * Os campos opcionais existem porque o `select` de cada módulo pedia colunas
 * diferentes; o D1-bridge devolve a linha completa, então todos vêm preenchidos
 * pelo caminho D1 e o módulo usa só o que precisa.
 */
export interface D1EntityRow<A = Record<string, unknown>> {
  id: string;
  kind: string;
  name: string;
  normalized_name: string;
  /** CNPJ em 14 dígitos (sem máscara) ou null/"" quando PF/ausente. */
  cnpj: string | null;
  external_ids: Record<string, unknown>;
  /** Objeto de atributos normalizados — já parseado (não string). */
  attributes: A;
  source_ids: string[];
  created_at?: string | undefined;
  updated_at?: string | undefined;
}

/** Filtros aceitos pela query (espelham os params da `/d1-bridge/query`). */
export interface FetchD1Params {
  /** Tipo da entidade (ENTITY_KINDS). Nunca use `auction_lot` aqui. */
  kind: string;
  /** Filtro por CNPJ (14 dígitos, sem máscara). */
  cnpj?: string | undefined;
  /** Busca textual (substring em name/normalized_name no servidor). */
  q?: string | undefined;
  /** Tamanho da página. Default 1000 (mesmo corte do PostgREST). */
  limit?: number | undefined;
  /** Deslocamento da página. Default 0. */
  offset?: number | undefined;
}

/** De onde os dados vieram nesta chamada — útil para diagnóstico/telemetria. */
export type D1Source = "d1" | "supabase";

/** Resultado de uma página: as linhas + a origem efetiva. */
export interface FetchD1Result<A = Record<string, unknown>> {
  rows: Array<D1EntityRow<A>>;
  source: D1Source;
}

// ─── Constantes ────────────────────────────────────────────────────────────────

/** Tamanho de página padrão — o PostgREST corta em 1000; mantemos a paridade. */
const DEFAULT_LIMIT = 1000;

/** Timeout do caminho D1. Se estourar, caímos para o Supabase. */
const D1_TIMEOUT_MS = 12_000;

/** Caminho da edge function que serve o D1. */
const D1_BRIDGE_PATH = "/functions/v1/d1-bridge/query";

/**
 * TTL do cache cliente de páginas D1/Supabase — dados dinâmicos (leilões,
 * licitações recentes). 60 s é suficiente para navegações frequentes.
 */
const CACHE_TTL_MS = 60_000;

/**
 * TTL estendido para dados de catálogo/referência que mudam raramente:
 * municípios (IBGE), deputados (mandato vigente), organizações (PNCP).
 * 5 minutos mantém dados frescos sem re-buscar a cada navegação SPA.
 *
 * Use ao chamar `fetchD1Entities` / `fetchAllD1Entities` nesses contextos:
 * passe `{ ttlMs: CACHE_TTL_STATIC_MS }` (quando a API oferecer override) ou
 * prefixe a chave de cache com um namespace que não conflite com CACHE_TTL_MS.
 * Por ora, o override é feito pelos callers via `fetchD1EntitiesStatic`.
 */
export const CACHE_TTL_STATIC_MS = 5 * 60_000; // 5 minutos

/**
 * Monta uma chave de cache estável e determinística para uma página de query.
 *
 * Formato: `d1|{kind}|{cnpj}|{q}|{limit}|{offset}`
 * Campos ausentes ficam como string vazia para manter o mesmo número de
 * segmentos e evitar colisões entre, p. ex., kind="a|b" e kind="a", cnpj="b".
 */
function makeCacheKey(params: FetchD1Params): string {
  return [
    "d1",
    params.kind,
    params.cnpj ?? "",
    params.q ?? "",
    String(params.limit ?? DEFAULT_LIMIT),
    String(params.offset ?? 0),
  ].join("|");
}

// ─── Helpers internos ──────────────────────────────────────────────────────────

/** Base da edge `d1-bridge` derivada do Supabase configurado (com fallback). */
function getD1BridgeUrl(): string {
  const { url } = getSupabasePublicConfig();
  return `${trimTrailingSlash(url)}${D1_BRIDGE_PATH}`;
}

/** Monta a query string da `/d1-bridge/query` só com os params presentes. */
function buildD1Query(params: FetchD1Params): string {
  const sp = new URLSearchParams();
  sp.set("kind", params.kind);
  if (params.cnpj != null && params.cnpj !== "") sp.set("cnpj", params.cnpj);
  if (params.q != null && params.q !== "") sp.set("q", params.q);
  sp.set("limit", String(params.limit ?? DEFAULT_LIMIT));
  sp.set("offset", String(params.offset ?? 0));
  return sp.toString();
}

/**
 * Valida que um item cru do D1 tem a forma mínima de `D1EntityRow`. Defensivo:
 * se a edge devolver algo estranho, tratamos como resposta inválida e caímos
 * para o Supabase em vez de entregar lixo para a tela.
 */
function isD1EntityShape(value: unknown): value is D1EntityRow {
  if (value == null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["id"] === "string" &&
    typeof v["kind"] === "string" &&
    "attributes" in v &&
    v["attributes"] != null &&
    typeof v["attributes"] === "object"
  );
}

/**
 * Normaliza uma linha do D1 para `D1EntityRow<A>`, garantindo os campos que os
 * módulos leem mesmo que a edge omita algum: `external_ids`/`source_ids` viram
 * objeto/array vazios, e — importante — se `attributes.sourceId` estiver ausente
 * (acontece p/ alguns kinds, ex.: sanction) preenchemos a partir de
 * `source_ids[0]`. Isso preserva os filtros `attributes.sourceId === "..."` que
 * alguns módulos já fazem, sem o módulo precisar mudar.
 */
function normalizeD1Row<A>(raw: D1EntityRow): D1EntityRow<A> {
  const external_ids =
    raw.external_ids != null && typeof raw.external_ids === "object"
      ? raw.external_ids
      : {};
  const source_ids = Array.isArray(raw.source_ids) ? raw.source_ids : [];

  // Eco do attributes com sourceId garantido (fallback para source_ids[0]).
  const attrs = raw.attributes as Record<string, unknown>;
  const withSource: Record<string, unknown> =
    attrs["sourceId"] == null && source_ids.length > 0
      ? { ...attrs, sourceId: source_ids[0] }
      : attrs;

  return {
    id: raw.id,
    kind: raw.kind,
    name: typeof raw.name === "string" ? raw.name : "",
    normalized_name: typeof raw.normalized_name === "string" ? raw.normalized_name : "",
    cnpj: raw.cnpj ?? null,
    external_ids,
    attributes: withSource as A,
    source_ids,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

// ─── Caminho D1 (primário) ─────────────────────────────────────────────────────

/**
 * Busca UMA página da `/d1-bridge/query`. Lança em qualquer erro/timeout/forma
 * inválida — o chamador trata o erro e cai para o Supabase.
 */
async function fetchD1Page<A>(
  params: FetchD1Params,
  fetcher: typeof fetch,
): Promise<Array<D1EntityRow<A>>> {
  const { key } = getSupabasePublicConfig();
  const url = `${getD1BridgeUrl()}?${buildD1Query(params)}`;

  // Timeout via AbortController — protege contra a edge pendurada.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), D1_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        accept: "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`d1-bridge retornou ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (
    payload == null ||
    typeof payload !== "object" ||
    !Array.isArray((payload as { entities?: unknown }).entities)
  ) {
    throw new Error("d1-bridge: resposta sem `entities`");
  }

  const entities = (payload as { entities: unknown[] }).entities;
  return entities.filter(isD1EntityShape).map((row) => normalizeD1Row<A>(row));
}

// ─── Caminho Supabase (fallback) ───────────────────────────────────────────────

/**
 * Busca UMA página do Supabase REST — exatamente como os módulos faziam:
 * `entities?kind=eq.<kind>` (+ `cnpj=eq.<cnpj>` quando filtrado), paginado por
 * header `Range`. Pede a linha completa (`select=*`) para devolver a mesma forma
 * de `D1EntityRow`, então o módulo enxerga os mesmos campos vindos de qualquer
 * caminho. Sem ordenação no servidor — a tela ordena no cliente.
 */
async function fetchSupabasePage<A>(
  params: FetchD1Params,
  fetcher: typeof fetch,
): Promise<Array<D1EntityRow<A>>> {
  const { url: supabaseUrl, key } = getSupabasePublicConfig();
  const limit = params.limit ?? DEFAULT_LIMIT;
  const offset = params.offset ?? 0;

  const filters = [`kind=eq.${encodeURIComponent(params.kind)}`];
  if (params.cnpj != null && params.cnpj !== "") {
    filters.push(`cnpj=eq.${encodeURIComponent(params.cnpj)}`);
  }
  const query = `entities?${filters.join("&")}&select=*`;

  const response = await fetcher(`${trimTrailingSlash(supabaseUrl)}/rest/v1/${query}`, {
    headers: {
      accept: "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      Range: `${offset}-${offset + limit - 1}`,
      "Range-Unit": "items",
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase REST retornou ${response.status}`);
  }

  const batch = (await response.json()) as unknown;
  if (!Array.isArray(batch)) {
    throw new Error("Supabase REST: resposta não é uma lista");
  }

  return batch.filter(isD1EntityShape).map((row) => normalizeD1Row<A>(row));
}

// ─── API pública ───────────────────────────────────────────────────────────────

/**
 * Busca UMA página de entidades do BULK: tenta o D1 (primário) e, em qualquer
 * falha/timeout/resposta inválida, cai para o Supabase REST (mesma consulta de
 * antes). Devolve as linhas + a origem efetiva.
 *
 * Cache: quando o `fetcher` padrão (global `fetch`) é usado, o resultado é
 * mantido em memória por `CACHE_TTL_MS` (60 s) e requisições simultâneas para
 * a mesma página são deduplicadas (uma única chamada de rede). Quando um
 * `fetcher` customizado é passado (ex.: em testes), o cache é ignorado para
 * preservar o isolamento.
 *
 * Use isto quando você quer controlar a paginação manualmente. Para puxar todas
 * as páginas de um kind (o padrão dos módulos), use `fetchAllD1Entities`.
 */
export async function fetchD1Entities<A = Record<string, unknown>>(
  params: FetchD1Params,
  fetcher: typeof fetch = fetch,
): Promise<FetchD1Result<A>> {
  // Loader que executa a lógica D1 → Supabase-fallback real (sem cache).
  const load = async (): Promise<FetchD1Result<A>> => {
    try {
      const rows = await fetchD1Page<A>(params, fetcher);
      return { rows, source: "d1" };
    } catch (d1Error) {
      // Falha do D1 → fallback transparente para o Supabase. Logamos em nível
      // baixo para diagnóstico, sem poluir o console do usuário.
      console.warn(
        `[d1-client] D1 falhou para kind=${params.kind}, usando Supabase. Motivo:`,
        d1Error instanceof Error ? d1Error.message : String(d1Error),
      );
      const rows = await fetchSupabasePage<A>(params, fetcher);
      return { rows, source: "supabase" };
    }
  };

  // Quando um fetcher customizado é fornecido, pulamos o cache: o chamador
  // provavelmente está em testes e quer controle total sobre as respostas.
  if (fetcher !== fetch) {
    return load();
  }

  return cachedFetch<FetchD1Result<A>>(makeCacheKey(params), CACHE_TTL_MS, load);
}

/**
 * Variante de `fetchD1Entities` com TTL de 5 minutos para dados de referência
 * estáveis (municípios, deputados, organizações). Usa a mesma chave de cache,
 * mas com TTL estendido — ideal para evitar refetch entre navegações SPA quando
 * o conteúdo é atualizado diariamente (não a cada minuto).
 */
export async function fetchD1EntitiesStatic<A = Record<string, unknown>>(
  params: FetchD1Params,
  fetcher: typeof fetch = fetch,
): Promise<FetchD1Result<A>> {
  const load = async (): Promise<FetchD1Result<A>> => {
    try {
      const rows = await fetchD1Page<A>(params, fetcher);
      return { rows, source: "d1" };
    } catch (d1Error) {
      console.warn(
        `[d1-client] D1 falhou para kind=${params.kind} (static), usando Supabase. Motivo:`,
        d1Error instanceof Error ? d1Error.message : String(d1Error),
      );
      const rows = await fetchSupabasePage<A>(params, fetcher);
      return { rows, source: "supabase" };
    }
  };

  if (fetcher !== fetch) {
    return load();
  }

  // Prefixo "s:" distingue as entradas static das entradas de 60s para a mesma
  // chave — evita que um fetch dinâmico sirva dados do cache estático (ou vice-versa).
  return cachedFetch<FetchD1Result<A>>(`s:${makeCacheKey(params)}`, CACHE_TTL_STATIC_MS, load);
}

/**
 * Puxa TODAS as páginas de um kind (até `maxPages`), paginando como os módulos
 * faziam. A escolha D1↔Supabase é feita por página, mas com "sticky source":
 * se a 1ª página veio do Supabase (D1 fora), as próximas já vão direto ao
 * Supabase — evita um timeout do D1 por página. Se o D1 respondeu, seguimos no
 * D1; só uma falha no meio força o fallback daquela página em diante.
 *
 * @returns as linhas acumuladas + a origem predominante (`source` da 1ª página).
 */
export async function fetchAllD1Entities<A = Record<string, unknown>>(
  params: Omit<FetchD1Params, "offset">,
  options?: { maxPages?: number | undefined; fetcher?: typeof fetch | undefined },
): Promise<FetchD1Result<A>> {
  const fetcher = options?.fetcher ?? fetch;
  const limit = params.limit ?? DEFAULT_LIMIT;
  const maxPages = options?.maxPages ?? 10;

  const rows: Array<D1EntityRow<A>> = [];
  let source: D1Source | undefined;
  // Quando o D1 falhar uma vez, "trava" no Supabase para as páginas seguintes.
  let stickyToSupabase = false;

  // Avança o offset pelo número REAL de linhas recebidas — NUNCA por `limit`. O
  // servidor (d1-bridge) tem teto próprio de página; somar `limit` quando ele
  // devolve menos fazia o offset "pular" linhas e truncava os módulos
  // silenciosamente (cada módulo carregava só ~100 de milhares). Paramos quando
  // uma página volta vazia — robusto a qualquer teto de página do servidor.
  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const pageParams: FetchD1Params = { ...params, limit, offset };

    let batch: Array<D1EntityRow<A>>;
    if (stickyToSupabase) {
      batch = await fetchSupabasePage<A>(pageParams, fetcher);
      source ??= "supabase";
    } else {
      const result = await fetchD1Entities<A>(pageParams, fetcher);
      batch = result.rows;
      source ??= result.source;
      if (result.source === "supabase") stickyToSupabase = true;
    }

    rows.push(...batch);
    if (batch.length === 0) break;
    offset += batch.length;

    if (page === maxPages - 1) {
      console.warn(
        `[d1-client] Limite de ${maxPages} páginas atingido para kind=${params.kind} (${rows.length} linhas). Pode haver mais dados.`,
      );
    }
  }

  return { rows, source: source ?? "d1" };
}

/**
 * Variante de `fetchAllD1Entities` com TTL de 5 minutos para dados de
 * referência estáveis (municípios, deputados, organizações). Usa a mesma
 * estratégia de paginação sticky-source que `fetchAllD1Entities`, mas cada
 * página é cacheada por `CACHE_TTL_STATIC_MS` em vez de `CACHE_TTL_MS`.
 *
 * Use para kinds atualizados diariamente pelo ingestor — elimina refetch
 * redundante entre navegações SPA sem stale data acima de 5 minutos.
 */
export async function fetchAllD1EntitiesStatic<A = Record<string, unknown>>(
  params: Omit<FetchD1Params, "offset">,
  options?: { maxPages?: number | undefined; fetcher?: typeof fetch | undefined },
): Promise<FetchD1Result<A>> {
  const fetcher = options?.fetcher ?? fetch;
  const limit = params.limit ?? DEFAULT_LIMIT;
  const maxPages = options?.maxPages ?? 10;

  const rows: Array<D1EntityRow<A>> = [];
  let source: D1Source | undefined;
  let stickyToSupabase = false;

  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const pageParams: FetchD1Params = { ...params, limit, offset };

    let batch: Array<D1EntityRow<A>>;
    if (stickyToSupabase) {
      // Fallback path — Supabase direto quando D1 já falhou nesta iteração.
      // Não passamos pelo cache estático aqui pois usamos fetcher customizado
      // ou o D1 está fora; o Supabase não tem o mesmo TTL de 5 min.
      batch = await fetchSupabasePage<A>(pageParams, fetcher);
      source ??= "supabase";
    } else {
      const result = await fetchD1EntitiesStatic<A>(pageParams, fetcher);
      batch = result.rows;
      source ??= result.source;
      if (result.source === "supabase") stickyToSupabase = true;
    }

    rows.push(...batch);
    if (batch.length === 0) break;
    offset += batch.length;

    if (page === maxPages - 1) {
      console.warn(
        `[d1-client] Limite de ${maxPages} páginas atingido para kind=${params.kind} (static, ${rows.length} linhas). Pode haver mais dados.`,
      );
    }
  }

  return { rows, source: source ?? "d1" };
}

/** Primeiro `updated_at` não-vazio de uma lista de linhas (helper de UI). */
export function firstUpdatedAt<A>(rows: Array<D1EntityRow<A>>): string | undefined {
  return rows.find((row) => row.updated_at)?.updated_at;
}
