// catalog-api.ts — funções para o endpoint /catalog do infosimples-proxy.

import {
  getConfiguredApiUrl,
  getSupabasePublicConfig,
  trimTrailingSlash,
} from "../../lib/api-client";

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
  const proxyBase = trimTrailingSlash(fonteiaUrl).replace(/\/[^/]+$/, "/infosimples-proxy");
  return `${proxyBase}/catalog`;
}

export async function fetchCatalog(): Promise<CatalogResult> {
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
