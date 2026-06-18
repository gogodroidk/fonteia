/**
 * leads-api.ts — Fonte.ia
 *
 * Carrega contratos públicos recentes (kind='public_contract') da tabela entities
 * via REST público do Supabase para montar a lista de leads com motivo.
 */

import { fetchAllD1Entities, type D1EntityRow } from "../../lib/d1-client";
import type { ContratoPublicoAttributes } from "../raio-x/raio-x-api";

// Re-exporta para consumidores que importavam daqui.
export type { ContratoPublicoAttributes };

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

function rowToLead(row: D1EntityRow<ContratoPublicoAttributes>): Lead {
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
    createdAt: row.created_at ?? "",
  };
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

async function fetchSupabaseLeads(fetcher: typeof fetch): Promise<Lead[]> {
  // Lê do D1 (primário) com fallback transparente para o Supabase REST.
  const { rows } = await fetchAllD1Entities<ContratoPublicoAttributes>(
    { kind: "public_contract", limit: PAGE_SIZE },
    { maxPages: MAX_PAGES, fetcher },
  );

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
