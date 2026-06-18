import type { OrgaoPublico } from "@fonteia/sources";
import {
  getConfiguredApiUrl,
  getSupabasePublicConfig,
  trimTrailingSlash,
} from "../../lib/api-client";
import { fetchAllD1Entities, firstUpdatedAt } from "../../lib/d1-client";
import { sanitizeCnpj as _sanitizeCnpj } from "../../lib/cnpj";

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

/** Mantém só os dígitos do CNPJ; "" se não restarem 14. Re-exporta de lib/cnpj.ts. */
export const sanitizeCnpj: (value: string) => string = _sanitizeCnpj;

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

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Até 10.000 órgãos: o D1 (e o fallback Supabase) paginam em 1000/página.
// Órgãos são ~461 hoje, mas podem crescer com mais licitações — damos folga.
const MAX_ORGAOS_PAGES = 10; // até 10.000 órgãos

async function fetchSupabaseOrgaos(
  fetcher: typeof fetch,
): Promise<{ orgaos: OrgaoPublico[]; lastSyncedAt?: string | undefined }> {
  // Lê do D1 (primário) com fallback transparente para o Supabase REST.
  const { rows } = await fetchAllD1Entities<OrgaoPublico>(
    { kind: "organization" },
    { maxPages: MAX_ORGAOS_PAGES, fetcher },
  );

  // Garante que só pegamos órgãos desta fonte (entities mistura outras fontes).
  const orgaos = rows
    .map((r) => r.attributes)
    .filter((item) => item?.sourceId === "orgaos-publicos");

  return { orgaos, lastSyncedAt: firstUpdatedAt(rows) };
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

// ─── Sanções (kind=sanction) — CEIS/CNEP ─────────────────────────────────────

/** Atributos de uma sanção armazenados em entities.attributes. */
export interface SancaoAttributes {
  /** Origem da sanção: "CEIS" ou "CNEP". */
  origem?: string;
  tipoSancao?: string;
  dataInicioSancao?: string;
  dataFimSancao?: string;
  orgaoSancionador?: string;
  fundamentacaoLegal?: string;
}

/** Sanção normalizada — lida de entities (kind=sanction). */
export interface SancaoItem {
  /** UUID do registro em entities. */
  id: string;
  /** Razão social / nome do sancionado (coluna name da entities). */
  nome: string;
  /** CNPJ (14 dígitos, sem máscara) — coluna cnpj da entities. "" quando PF. */
  cnpj: string;
  /** Atributos estruturados. */
  attributes: SancaoAttributes;
}

export interface SancoesLoadResult {
  source: OrgaosDataSource;
  sancoes: SancaoItem[];
  message: string;
  lastSyncedAt?: string | undefined;
  errors?: string[] | undefined;
}

/** Máscara 00.000.000/0000-00 a partir de 14 dígitos. Reutilizada pelo componente. */
export function formatCnpjSancao(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

async function fetchSupabaseSancoes(
  fetcher: typeof fetch,
): Promise<{ sancoes: SancaoItem[]; lastSyncedAt?: string | undefined }> {
  // Lê do D1 (primário) com fallback transparente para o Supabase REST.
  // até 10.000 sanções — folga para crescer.
  const { rows } = await fetchAllD1Entities<SancaoAttributes>(
    { kind: "sanction" },
    { maxPages: 10, fetcher },
  );

  const sancoes: SancaoItem[] = rows.map((row) => ({
    id: row.id,
    nome: row.name ?? "",
    cnpj: row.cnpj ?? "",
    attributes: row.attributes ?? {},
  }));

  return { sancoes, lastSyncedAt: firstUpdatedAt(rows) };
}

export async function listSancoes(fetcher: typeof fetch = fetch): Promise<SancoesLoadResult> {
  const errors: string[] = [];

  try {
    const { sancoes, lastSyncedAt } = await fetchSupabaseSancoes(fetcher);

    if (sancoes.length > 0) {
      return {
        source: "supabase",
        sancoes,
        message: "Sanções (CEIS/CNEP) carregadas do Supabase.",
        lastSyncedAt,
        errors,
      };
    }
  } catch (error) {
    errors.push(`Supabase: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    source: "empty",
    sancoes: [],
    message: "Nenhuma sanção disponível no momento.",
    errors,
  };
}
