import type { OrgaoPublico } from "@fonteia/sources";
import {
  getConfiguredApiUrl,
  getSupabasePublicConfig,
  trimTrailingSlash,
} from "../../lib/api-client";

// ─── Consulta de CNPJ on-demand (via Edge Function "empresas-cnpj") ────────────

/** Sócio normalizado devolvido pela função empresas-cnpj. */
export interface EmpresaSocio {
  nome: string;
  qualificacao: string;
  faixaEtaria: string;
  entrada: string;
}

/** Perfil de CNPJ normalizado devolvido pela função empresas-cnpj. */
export interface EmpresaCnpj {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  cnaePrincipal: string;
  cnaeCodigo: string;
  naturezaJuridica: string;
  porte: string;
  uf: string;
  municipio: string;
  endereco: string;
  email: string;
  telefone: string;
  capitalSocial: number;
  abertura: string;
  socios: EmpresaSocio[];
  sourceUrl: string;
}

interface CnpjOkResponse {
  ok: true;
  empresa: EmpresaCnpj;
  fonte?: string;
}
interface CnpjErrResponse {
  ok: false;
  error: string;
  detail?: string;
}

/** Mantém só os dígitos do CNPJ; "" se não restarem 14. */
export function sanitizeCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 14 ? digits : "";
}

/**
 * Consulta um CNPJ pela Edge Function "empresas-cnpj" (proxy do Minha Receita,
 * com auth por header `apikey` — evita o CORS no navegador). Lança Error com
 * mensagem clara em 400/404/502 para a tela exibir.
 */
export async function lookupCnpj(rawCnpj: string, fetcher: typeof fetch = fetch): Promise<EmpresaCnpj> {
  const cnpj = sanitizeCnpj(rawCnpj);
  if (cnpj === "") {
    throw new Error("CNPJ inválido: digite os 14 números (com ou sem máscara).");
  }

  // A função "fonteia" mora em /functions/v1/fonteia; trocamos o último segmento
  // por "empresas-cnpj" para reaproveitar a mesma base/host configurada.
  const fonteiaUrl = getConfiguredApiUrl();
  if (!fonteiaUrl) throw new Error("API não configurada para consultar CNPJ.");
  const base = trimTrailingSlash(fonteiaUrl).replace(/\/[^/]+$/, "/empresas-cnpj");

  const { key } = getSupabasePublicConfig();
  const response = await fetcher(`${base}?cnpj=${cnpj}`, {
    headers: {
      accept: "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
    },
  });

  let body: CnpjOkResponse | CnpjErrResponse;
  try {
    body = (await response.json()) as CnpjOkResponse | CnpjErrResponse;
  } catch {
    throw new Error(`Falha ao consultar o CNPJ (HTTP ${response.status}).`);
  }

  if (!response.ok || body.ok === false) {
    const message = body && "error" in body && body.error ? body.error : `Erro ${response.status} ao consultar o CNPJ.`;
    throw new Error(message);
  }

  return body.empresa;
}

// ─── Lista dos órgãos públicos conhecidos (entities kind='organization') ───────

export type OrgaosDataSource = "supabase" | "empty";

export interface OrgaosLoadResult {
  source: OrgaosDataSource;
  orgaos: OrgaoPublico[];
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
}

interface SupabaseEntityRow {
  attributes: OrgaoPublico;
  updated_at?: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Paginação por Range: PostgREST corta em 1000 linhas/página. Órgãos são ~461
// hoje, mas podem crescer com mais licitações — damos folga.
const PAGE_SIZE = 1000;
const MAX_ORGAOS_PAGES = 10; // até 10.000 órgãos

async function fetchSupabaseOrgaos(
  fetcher: typeof fetch,
): Promise<{ orgaos: OrgaoPublico[]; lastSyncedAt?: string | undefined }> {
  const { url: supabaseUrl, key: publishableKey } = getSupabasePublicConfig();

  const rows: SupabaseEntityRow[] = [];
  for (let page = 0; page < MAX_ORGAOS_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    // kind = organization é a entidade de órgão público (derivada do PNCP).
    const query =
      "entities?kind=eq.organization&select=attributes,updated_at&order=normalized_name.asc";
    const response = await fetcher(`${trimTrailingSlash(supabaseUrl)}/rest/v1/${query}`, {
      headers: {
        accept: "application/json",
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        Range: `${offset}-${offset + PAGE_SIZE - 1}`,
        "Range-Unit": "items",
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase REST returned ${response.status}`);
    }

    const batch = (await response.json()) as SupabaseEntityRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  // Garante que só pegamos órgãos desta fonte (entities mistura outras fontes).
  const orgaos = rows
    .map((row) => row.attributes)
    .filter((item) => item?.sourceId === "orgaos-publicos");

  return { orgaos, lastSyncedAt: rows.find((row) => row.updated_at)?.updated_at };
}

export async function listOrgaos(fetcher: typeof fetch = fetch): Promise<OrgaosLoadResult> {
  const errors: string[] = [];

  try {
    const { orgaos, lastSyncedAt } = await fetchSupabaseOrgaos(fetcher);

    if (orgaos.length > 0) {
      return {
        source: "supabase",
        orgaos,
        message: "Órgãos públicos carregados do Supabase público, derivados das licitações do PNCP.",
        lastSyncedAt,
      };
    }
  } catch (error) {
    errors.push(`Supabase: ${toErrorMessage(error)}`);
  }

  return {
    source: "empty",
    orgaos: [],
    message: "Nenhum órgão público disponível no momento. A coleta roda periodicamente.",
    errors,
  };
}

export const loadOrgaos = listOrgaos;
