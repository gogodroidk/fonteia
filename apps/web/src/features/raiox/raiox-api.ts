/**
 * raiox-api.ts — client da edge function `dossie` (Raio-X 360° de empresa).
 *
 * GET /functions/v1/dossie?cnpj=...
 *
 * Programado CONTRA O CONTRATO combinado com o backend (outro agente constrói a
 * function em paralelo, ver types.ts). Segue o mesmo padrão de auth das demais
 * features (`apikey` público + Bearer de sessão quando houver — igual
 * cerebro-api.ts/dossie-api.ts) e o mesmo `getConfiguredApiUrl()` de api-client.ts.
 *
 * Em DEV, se a function ainda não existir (404) ou a rede falhar, cai para um
 * mock local CLARAMENTE marcado (mock-dossie.ts) — nunca em produção.
 */

import { supabase } from "../../auth/supabase-client";
import {
  getConfiguredApiUrl,
  getSupabasePublicConfig,
  trimTrailingSlash,
} from "../../lib/api-client";
import { sanitizeCnpj, formatCnpj, isValidCnpj } from "../../lib/cnpj";
import { buildMockDossie } from "./mock-dossie";
import type { DossiePayload } from "./types";

export { sanitizeCnpj, formatCnpj, isValidCnpj };

export class DossieNotFoundError extends Error {
  constructor(cnpj: string) {
    super(`Dossiê não encontrado para o CNPJ ${cnpj}`);
    this.name = "DossieNotFoundError";
  }
}

function dossieFunctionUrl(cnpj: string): string | null {
  const fonteiaUrl = getConfiguredApiUrl();
  if (!fonteiaUrl) return null;
  // getConfiguredApiUrl() aponta para .../functions/v1/fonteia — trocamos o
  // último segmento pela function `dossie`, mesmo padrão do infosimples-proxy.
  const base = trimTrailingSlash(fonteiaUrl).replace(/\/[^/]+$/, "/dossie");
  return `${base}?cnpj=${encodeURIComponent(cnpj)}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { key } = getSupabasePublicConfig();
  let bearer = key;
  try {
    const sessionToken = (await supabase?.auth.getSession())?.data.session?.access_token;
    if (sessionToken) bearer = sessionToken;
  } catch {
    // sem sessão — segue com a chave pública (a function decide o gate de plano).
  }
  return { accept: "application/json", apikey: key, authorization: `Bearer ${bearer}` };
}

/**
 * Busca o dossiê (Raio-X 360°) de uma empresa por CNPJ.
 *
 * Lança `DossieNotFoundError` quando a function responde 404 (CNPJ inexistente
 * nas fontes) — a página distingue esse caso de um erro de rede genérico.
 */
export async function fetchDossie(
  cnpjRaw: string,
  fetcher: typeof fetch = fetch,
): Promise<{ data: DossiePayload; isMock: boolean }> {
  const cnpj = sanitizeCnpj(cnpjRaw);
  if (cnpj === "") {
    throw new Error("CNPJ inválido — informe os 14 caracteres.");
  }

  const target = dossieFunctionUrl(cnpj);
  if (!target) {
    if (import.meta.env.DEV) {
      return { data: buildMockDossie(cnpj), isMock: true };
    }
    throw new Error("API do Raio-X não configurada.");
  }

  try {
    const headers = await authHeaders();
    const response = await fetcher(target, { headers });

    if (response.status === 404) {
      if (import.meta.env.DEV) {
        console.warn("[raiox] dossie 404 — usando mock local de dev.");
        return { data: buildMockDossie(cnpj), isMock: true };
      }
      throw new DossieNotFoundError(cnpj);
    }

    if (!response.ok) {
      if (import.meta.env.DEV) {
        console.warn(`[raiox] dossie retornou ${response.status} — usando mock local de dev.`);
        return { data: buildMockDossie(cnpj), isMock: true };
      }
      throw new Error(`Falha ao consultar o Raio-X (HTTP ${response.status}).`);
    }

    const data = (await response.json()) as DossiePayload;
    return { data, isMock: false };
  } catch (error) {
    if (error instanceof DossieNotFoundError) throw error;
    if (import.meta.env.DEV) {
      console.warn("[raiox] erro de rede na function dossie — usando mock local de dev.", error);
      return { data: buildMockDossie(cnpj), isMock: true };
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}
