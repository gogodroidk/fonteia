/**
 * Cérebro — camada de dados do grafo de conhecimento.
 *
 * Dado um CNPJ, busca em PARALELO cada kind que tem coluna `cnpj` no BULK
 * (D1 primário, fallback Supabase — via o cliente compartilhado `d1-client`)
 * e transforma cada registro num nó-folha ligado ao nó-empresa. Reaproveita
 * exatamente o mesmo caminho de leitura que o módulo Raio-X já usa por CNPJ.
 *
 * Nenhum dado é fabricado: kinds sem fonte (ex.: `trademark` hoje) simplesmente
 * voltam vazios e não geram nós.
 */

import { fetchD1Entities, type D1EntityRow } from "../../lib/d1-client";
import { sanitizeCnpj, formatCnpj } from "../../lib/cnpj";
import type { GraphKind, NodeKind } from "./types";

export { sanitizeCnpj, formatCnpj };

/** Kinds que buscamos por CNPJ para montar as conexões de uma empresa. */
const CONNECTION_KINDS: GraphKind[] = [
  "sanction",
  "public_contract",
  "bidding_opportunity",
  "legal_process",
  "environmental_infraction",
  "organization",
  "trademark",
];

/** Teto de nós por kind — protege a performance do canvas (centenas, não milhares). */
const MAX_PER_KIND = 60;

/** Um nó-folha "cru" (antes de virar GraphNode com física). */
export interface RawLeaf {
  /** Id único no grafo (prefixado por kind). */
  id: string;
  kind: NodeKind;
  label: string;
  sublabel?: string | undefined;
  /** CNPJ próprio deste nó, quando expansível (ex.: órgão público). */
  cnpj?: string | undefined;
}

/** Resultado de uma expansão de CNPJ: o rótulo da empresa + os nós-folha. */
export interface ExpandResult {
  /** CNPJ consultado (14 dígitos). */
  cnpj: string;
  /** Rótulo legível da empresa (razão social, quando descoberta). */
  centerLabel: string;
  /** Nós conectados encontrados (já com teto por kind aplicado). */
  leaves: RawLeaf[];
  /** Contagem por kind (para a UI mostrar resumo/legenda). */
  counts: Partial<Record<NodeKind, number>>;
  /** Erros não-fatais por kind (a busca segue para os demais). */
  errors: string[];
}

// ─── Helpers de extração de rótulo por kind ─────────────────────────────────────

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function attr(row: D1EntityRow, key: string): unknown {
  const a = row.attributes as Record<string, unknown> | undefined;
  return a ? a[key] : undefined;
}

/** Valor monetário "R$ 1.234,56" a partir de reais (number|string) ou ""; "" se inválido. */
function moneyFromReais(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Valor monetário a partir de CENTAVOS (number) ou ""; "" se inválido. */
function moneyFromCents(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Primeiro assunto legível de um processo (assuntos pode ser string|objeto). */
function firstAssunto(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  const first = value[0];
  if (typeof first === "string") return first.trim();
  if (first !== null && typeof first === "object") {
    const o = first as Record<string, unknown>;
    const nome = o["nome"] ?? o["descricao"] ?? o["titulo"] ?? o["assunto"];
    if (typeof nome === "string" && nome.trim() !== "") return nome.trim();
  }
  return "";
}

/**
 * Transforma uma linha do BULK num nó-folha, conforme o kind. Devolve null
 * quando a linha não tem nada útil para mostrar (evita nós "vazios").
 */
function leafFromRow(kind: GraphKind, row: D1EntityRow): RawLeaf | null {
  const id = `${kind}:${row.id}`;
  const name = str(row.name);

  switch (kind) {
    case "sanction": {
      const origem = str(attr(row, "origem")) || "Sanção";
      const tipo = str(attr(row, "tipoSancao"));
      return { id, kind, label: name || origem, sublabel: tipo || origem };
    }
    case "public_contract": {
      const orgao = str(attr(row, "orgao"));
      const valor = moneyFromReais(attr(row, "valorGlobal"));
      const fornecedor = str(attr(row, "fornecedorNome")) || name;
      const sub = [orgao, valor].filter(Boolean).join(" · ");
      return {
        id,
        kind,
        label: fornecedor || orgao || "Contrato",
        sublabel: sub || str(attr(row, "objeto")).slice(0, 60),
      };
    }
    case "bidding_opportunity": {
      const objeto = str(attr(row, "objeto"));
      const orgao = str(attr(row, "orgao"));
      const valor = moneyFromCents(attr(row, "valorEstimadoCents"));
      return {
        id,
        kind,
        label: objeto ? objeto.slice(0, 64) : orgao || "Licitação",
        sublabel: [orgao, valor].filter(Boolean).join(" · ") || undefined,
      };
    }
    case "legal_process": {
      const numero = str(row.external_ids?.["numeroProcesso"]);
      const tribunal = str(attr(row, "tribunal"));
      const assunto = firstAssunto(attr(row, "assuntos"));
      const classe = str(attr(row, "classe"));
      return {
        id,
        kind,
        label: numero || name || "Processo",
        sublabel: [tribunal, assunto || classe].filter(Boolean).join(" · ") || undefined,
      };
    }
    case "environmental_infraction": {
      const tipo = str(attr(row, "tipoInfracao"));
      const multa = moneyFromCents(attr(row, "valorMultaCents"));
      const uf = str(attr(row, "uf"));
      return {
        id,
        kind,
        label: name || tipo || "Infração ambiental",
        sublabel: [tipo, multa, uf].filter(Boolean).join(" · ") || undefined,
      };
    }
    case "organization": {
      const uf = str(attr(row, "uf"));
      const ownCnpj = sanitizeCnpj(str(row.cnpj));
      return {
        id,
        kind,
        label: name || "Órgão público",
        sublabel: uf || undefined,
        cnpj: ownCnpj || undefined,
      };
    }
    case "trademark": {
      const status = str(attr(row, "status"));
      return { id, kind, label: name || "Marca", sublabel: status || undefined };
    }
    default:
      return null;
  }
}

// ─── Busca por kind ─────────────────────────────────────────────────────────────

async function fetchKind(
  kind: GraphKind,
  cnpj: string,
  fetcher: typeof fetch,
): Promise<{ leaves: RawLeaf[]; centerLabel: string }> {
  const { rows } = await fetchD1Entities(
    { kind, cnpj, limit: 1000 },
    fetcher,
  );

  const leaves: RawLeaf[] = [];
  let centerLabel = "";

  for (const row of rows) {
    // A primeira razão social não-vazia vira candidata a rótulo do centro.
    if (centerLabel === "") {
      const candidate =
        str((row.attributes as Record<string, unknown>)?.["fornecedorNome"]) ||
        str(row.name);
      if (candidate) centerLabel = candidate;
    }
    const leaf = leafFromRow(kind, row);
    if (leaf) leaves.push(leaf);
    if (leaves.length >= MAX_PER_KIND) break;
  }

  return { leaves, centerLabel };
}

/**
 * Expande um CNPJ: busca todos os kinds em paralelo e devolve os nós-folha.
 * Tolerante a falhas — um kind que falha não derruba os demais.
 */
export async function expandCnpj(
  rawCnpj: string,
  fetcher: typeof fetch = fetch,
): Promise<ExpandResult> {
  const cnpj = sanitizeCnpj(rawCnpj);
  if (cnpj === "") {
    throw new Error("CNPJ inválido: digite os 14 números (com ou sem máscara).");
  }

  const results = await Promise.allSettled(
    CONNECTION_KINDS.map((kind) => fetchKind(kind, cnpj, fetcher)),
  );

  const leaves: RawLeaf[] = [];
  const counts: Partial<Record<NodeKind, number>> = {};
  const errors: string[] = [];
  let centerLabel = "";

  results.forEach((result, i) => {
    const kind = CONNECTION_KINDS[i]!;
    if (result.status === "fulfilled") {
      const { leaves: kindLeaves, centerLabel: candidate } = result.value;
      if (centerLabel === "" && candidate) centerLabel = candidate;
      if (kindLeaves.length > 0) counts[kind] = kindLeaves.length;
      leaves.push(...kindLeaves);
    } else {
      const reason =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`${kind}: ${reason}`);
    }
  });

  return {
    cnpj,
    centerLabel: centerLabel || formatCnpj(cnpj),
    leaves,
    counts,
    errors,
  };
}

/** CNPJ de exemplo para o estado inicial — escolhido por ter rede rica de dados. */
export const EXEMPLO_CNPJ = "00000000000191"; // Banco do Brasil S.A.
