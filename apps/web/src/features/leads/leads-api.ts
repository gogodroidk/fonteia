/**
 * leads-api.ts — Fonte.ia
 *
 * Carrega contratos públicos recentes (kind='public_contract') da tabela entities
 * via REST público do Supabase para montar a lista de leads com motivo.
 */

import { getSupabasePublicConfig, trimTrailingSlash } from "../../lib/api-client";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Atributos normalizados de um contrato público (PNCP).
 * Estes campos vêm dentro de entities.attributes (JSONB).
 */
export interface ContratoPublicoAttributes {
  fornecedorNome?: string | undefined;
  orgao?: string | undefined;
  objeto?: string | undefined;
  valorGlobal?: number | undefined;
  modalidade?: string | undefined;
  dataVigenciaInicio?: string | undefined;
  uf?: string | undefined;
  municipio?: string | undefined;
  numeroControlePNCP?: string | undefined;
}

/** Linha raw devolvida pelo Supabase REST. */
interface EntityRow {
  id: string;
  name: string;
  cnpj: string | null;
  attributes: ContratoPublicoAttributes;
  created_at: string;
  updated_at: string;
}

/** Lead enriquecido que a UI consome. */
export interface Lead {
  /** ID único da linha (entities.id) */
  id: string;
  /** Razão social do fornecedor */
  razaoSocial: string;
  /** CNPJ formatado (ou vazio) */
  cnpj: string;
  /** Órgão contratante */
  orgao: string;
  /** Objeto do contrato */
  objeto: string;
  /** Valor global em R$ (0 se não informado) */
  valorGlobal: number;
  /** Modalidade (Pregão, Dispensa…) */
  modalidade: string;
  /** UF do contrato */
  uf: string;
  /** Município do contrato */
  municipio: string;
  /** Data de início da vigência */
  dataVigenciaInicio: string;
  /** Número de controle PNCP para link externo */
  numeroControlePNCP: string;
  /** created_at bruto para ordenação */
  createdAt: string;
}

export type LeadsDataSource = "supabase" | "empty";

export interface LeadsLoadResult {
  source: LeadsDataSource;
  leads: Lead[];
  message: string;
  errors?: string[] | undefined;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToLead(row: EntityRow): Lead {
  const a = row.attributes;
  return {
    id: row.id,
    razaoSocial: a.fornecedorNome ?? row.name ?? "Empresa não identificada",
    cnpj: row.cnpj ?? "",
    orgao: a.orgao ?? "Órgão não informado",
    objeto: a.objeto ?? "",
    valorGlobal: typeof a.valorGlobal === "number" ? a.valorGlobal : 0,
    modalidade: a.modalidade ?? "",
    uf: a.uf ?? "",
    municipio: a.municipio ?? "",
    dataVigenciaInicio: a.dataVigenciaInicio ?? "",
    numeroControlePNCP: a.numeroControlePNCP ?? "",
    createdAt: row.created_at,
  };
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

async function fetchSupabaseLeads(fetcher: typeof fetch): Promise<Lead[]> {
  const { url: supabaseUrl, key: publishableKey } = getSupabasePublicConfig();
  const base = trimTrailingSlash(supabaseUrl);
  const rows: EntityRow[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const query =
      "entities?kind=eq.public_contract&select=id,name,cnpj,attributes,created_at,updated_at&order=created_at.desc";

    const response = await fetcher(`${base}/rest/v1/${query}`, {
      headers: {
        accept: "application/json",
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        Range: `${offset}-${offset + PAGE_SIZE - 1}`,
        "Range-Unit": "items",
        "Prefer": "count=none",
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase REST retornou ${response.status}`);
    }

    const batch = (await response.json()) as EntityRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows.map(rowToLead);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function listLeads(fetcher: typeof fetch = fetch): Promise<LeadsLoadResult> {
  const errors: string[] = [];

  try {
    const leads = await fetchSupabaseLeads(fetcher);
    if (leads.length > 0) {
      return {
        source: "supabase",
        leads,
        message: `${leads.length} contratos carregados do Supabase.`,
      };
    }
    return {
      source: "empty",
      leads: [],
      message:
        "Nenhum contrato público disponível ainda. A coleta do PNCP está sendo ligada — volte em breve.",
      errors,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return {
      source: "empty",
      leads: [],
      message: "Não foi possível carregar contratos no momento.",
      errors,
    };
  }
}
