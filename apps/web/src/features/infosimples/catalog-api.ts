// catalog-api.ts — funções para o endpoint /catalog do infosimples-proxy.

import {
  getConfiguredApiUrl,
  getSupabasePublicConfig,
  trimTrailingSlash,
} from "../../lib/api-client";
import { cachedFetchSession } from "../../lib/d1-cache";

/**
 * TTL do catálogo InfoSimples: 10 minutos.
 *
 * O catálogo (lista de kinds disponíveis) muda somente quando o dono reconfigura
 * o proxy — evento raro. 10 min é mais que suficiente para eliminar o refetch
 * redundante que ocorria quando ConsultasPage e MaisConsultasSection (no Dossiê)
 * montavam ao mesmo tempo e cada um disparava sua própria requisição ao servidor.
 * `cachedFetchSession` persiste o resultado no sessionStorage, então a segunda
 * aba/página da mesma sessão nunca busca novamente enquanto o TTL não expirar.
 */
const CATALOG_TTL_MS = 10 * 60 * 1_000; // 10 minutos
const CATALOG_CACHE_KEY = "infosimples_catalog";

export interface CatalogKind {
  kind: string;
  titulo: string;
  categoria: string;
  inputs: string[]; // ex.: ["cnpj"]
}

export interface CatalogResponse {
  ok: boolean;
  configured?: boolean;
  kinds: CatalogKind[];
}

// Resultado discriminado do fetchCatalog — nunca lança
export type CatalogResult =
  | { state: "ok"; kinds: CatalogKind[] }
  | { state: "dormant" } // configured: false
  | { state: "error"; message: string };

function buildCatalogUrl(): string | null {
  const fonteiaUrl = getConfiguredApiUrl();
  if (!fonteiaUrl) return null;
  const proxyBase = trimTrailingSlash(fonteiaUrl).replace(/\/functions\/v1\/[^/]+$/, "/functions/v1/infosimples-proxy");
  return `${proxyBase}/catalog`;
}

async function fetchCatalogFromNetwork(): Promise<CatalogResult> {
  const url = buildCatalogUrl();
  if (!url) {
    return { state: "error", message: "URL da API não configurada." };
  }

  const { key } = getSupabasePublicConfig();

  try {
    const response = await fetch(url, {
      headers: {
        apikey: key,
        accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        state: "error",
        message: `Erro ${response.status} ao buscar catálogo${text ? `: ${text}` : "."}`,
      };
    }

    const body = (await response.json()) as CatalogResponse;

    if (body.configured === false) {
      return { state: "dormant" };
    }

    if (body.ok === true) {
      return { state: "ok", kinds: body.kinds };
    }

    return { state: "error", message: "Resposta inesperada do servidor." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao buscar catálogo.";
    return { state: "error", message };
  }
}

/**
 * Busca o catálogo de consultas InfoSimples.
 *
 * Usa `cachedFetchSession` (TTL 10 min, spill em sessionStorage) para que
 * múltiplos componentes na mesma aba (ex.: ConsultasPage + MaisConsultasSection
 * no Dossiê) compartilhem UMA ÚNICA requisição de rede — e páginas visitadas
 * na mesma sessão não busquem novamente enquanto o TTL não expirar.
 *
 * Resultados de ERRO não são cacheados: qualquer falha de rede ou configuração
 * resulta em retry imediato na próxima chamada (comportamento do cachedFetch).
 * Resultados `dormant` (proxy inativo) SÃO cacheados — evita polling constante
 * quando o operador ainda não configurou o proxy.
 */
export function fetchCatalog(): Promise<CatalogResult> {
  return cachedFetchSession(CATALOG_CACHE_KEY, CATALOG_TTL_MS, fetchCatalogFromNetwork);
}

export function groupByCategoria(kinds: CatalogKind[]): Map<string, CatalogKind[]> {
  const map = new Map<string, CatalogKind[]>();
  for (const kind of kinds) {
    const existing = map.get(kind.categoria);
    if (existing) {
      existing.push(kind);
    } else {
      map.set(kind.categoria, [kind]);
    }
  }
  return map;
}
