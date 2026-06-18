/**
 * Raio-X de Empresa — API layer
 *
 * Reutiliza lookupCnpj + tipos de empresas-api.
 * Adiciona busca de sanções e contratos públicos filtrados por CNPJ.
 *
 * Leitura BULK: as buscas de sanções e contratos por CNPJ vão para o D1
 * (primário, via `fetchD1Entities`), com fallback transparente para o Supabase
 * REST embutido no cliente compartilhado. Comportamento idêntico ao anterior —
 * a página pública /empresa continua igual.
 */
import {
  type EmpresaCnpj,
  type SancaoItem,
  type SancaoAttributes,
  lookupCnpj,
  sanitizeCnpj,
} from "../empresas/empresas-api";
import { fetchD1Entities, firstUpdatedAt } from "../../lib/d1-client";

export type { EmpresaCnpj, SancaoItem, SancaoAttributes };
export { sanitizeCnpj, lookupCnpj };

// ─── Sanções filtradas por CNPJ ───────────────────────────────────────────────

/**
 * Busca sanções para um CNPJ específico no BULK (D1 primário, fallback Supabase).
 * Filtro direto por coluna cnpj — evita carregar a lista toda.
 */
export async function fetchSancoesByCnpj(
  rawCnpj: string,
  fetcher: typeof fetch = fetch,
): Promise<{ sancoes: SancaoItem[]; lastSyncedAt?: string | undefined }> {
  const cnpj = sanitizeCnpj(rawCnpj);
  if (cnpj === "") return { sancoes: [], lastSyncedAt: undefined };

  const { rows } = await fetchD1Entities<SancaoAttributes>(
    { kind: "sanction", cnpj, limit: 1000 },
    fetcher,
  );

  const sancoes: SancaoItem[] = rows.map((row) => ({
    id: row.id,
    nome: row.name ?? "",
    cnpj: row.cnpj ?? "",
    attributes: row.attributes ?? {},
  }));

  const lastSyncedAt: string | undefined = firstUpdatedAt(rows);
  return { sancoes, lastSyncedAt };
}

// ─── Contratos públicos filtrados por CNPJ ────────────────────────────────────

/**
 * Atributos de um contrato público (source: pncp-contratos).
 * Tipo canônico — importado por raio-x-api e leads-api.
 *
 * valorGlobal é number | string | null porque o PNCP ora devolve número,
 * ora string; os consumidores devem sempre usar Number() + isFinite().
 */
export interface ContratoPublicoAttributes {
  /** Razão social do fornecedor (presente em contratos do PNCP). */
  fornecedorNome?: string | undefined;
  orgao?: string | undefined;
  objeto?: string | undefined;
  valorGlobal?: number | string | null;
  modalidade?: string | undefined;
  dataVigenciaInicio?: string | undefined;
  uf?: string | undefined;
  municipio?: string | undefined;
  numeroControlePNCP?: string | undefined;
}

/** Item de contrato público normalizado. */
export interface ContratoPublico {
  id: string;
  /** nome = razão social do fornecedor (name na entities) */
  nome: string;
  cnpj: string;
  attributes: ContratoPublicoAttributes;
  /** updated_at da linha na base */
  syncedAt?: string | undefined;
}

/**
 * Busca contratos públicos para um CNPJ no BULK (D1 primário, fallback Supabase).
 * Mesmo padrão de fetchSancoesByCnpj — filtro direto por coluna cnpj.
 */
export async function fetchContratosByCnpj(
  rawCnpj: string,
  fetcher: typeof fetch = fetch,
): Promise<{ contratos: ContratoPublico[]; lastSyncedAt?: string | undefined }> {
  const cnpj = sanitizeCnpj(rawCnpj);
  if (cnpj === "") return { contratos: [], lastSyncedAt: undefined };

  const { rows } = await fetchD1Entities<ContratoPublicoAttributes>(
    { kind: "public_contract", cnpj, limit: 1000 },
    fetcher,
  );

  const contratos: ContratoPublico[] = rows.map((row) => ({
    id: row.id,
    nome: row.name ?? "",
    cnpj: row.cnpj ?? "",
    attributes: row.attributes ?? {},
    syncedAt: row.updated_at,
  }));

  const lastSyncedAt: string | undefined = firstUpdatedAt(rows);
  return { contratos, lastSyncedAt };
}

// ─── Tipos do relatório Raio-X ────────────────────────────────────────────────

export type RaioXStatus = "idle" | "loading" | "done" | "error";

export interface RaioXReportData {
  empresa: EmpresaCnpj;
  sancoes: SancaoItem[];
  sancoesFetchedAt: string; // ISO timestamp da busca
  cadastralFetchedAt: string; // ISO timestamp da busca
  sancoesSyncedAt?: string | undefined; // último updated_at da base
  contratos: ContratoPublico[];
  contratosFetchedAt: string; // ISO timestamp da busca
  contratosSyncedAt?: string | undefined; // último updated_at da base
}

// ─── Helpers de formatação ─────────────────────────────────────────────────────

/** Máscara 00.000.000/0000-00 a partir de 14 dígitos. */
export function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Formata ISO/yyyy-mm-dd para dd/mm/aaaa. */
export function formatDate(value: string): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return value;
}

/** Retorna quantos anos desde uma data de abertura. */
export function calcIdadeAnos(abertura: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(abertura.trim());
  if (!m || m[1] === undefined) return null;
  const ano = parseInt(m[1], 10);
  const hoje = new Date();
  return hoje.getFullYear() - ano;
}

/** Heurística: se situação contém "ativa" (case-insensitive). */
export function isSituacaoAtiva(situacao: string): boolean {
  return situacao.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes("ativa");
}

/**
 * Gera resumo textual seguro a partir dos dados — sem IA, sem heurísticas arriscadas.
 * Linguagem cautelosa: "sinal de atenção", nunca "fraude".
 */
export function buildResumo(data: RaioXReportData): string[] {
  const { empresa, sancoes } = data;
  const linhas: string[] = [];

  const ativa = isSituacaoAtiva(empresa.situacao);
  const idadeAnos = calcIdadeAnos(empresa.abertura);

  // Situação cadastral
  if (ativa) {
    const idadeTexto = idadeAnos !== null ? ` há ${idadeAnos} ${idadeAnos === 1 ? "ano" : "anos"}` : "";
    linhas.push(`Empresa ativa na Receita Federal${idadeTexto}.`);
  } else {
    linhas.push(`Situação cadastral: ${empresa.situacao}. Verifique antes de contratar.`);
  }

  // Porte
  if (empresa.porte) {
    linhas.push(`Porte declarado: ${empresa.porte}.`);
  }

  // Sócios
  if (empresa.socios.length > 0) {
    linhas.push(
      `${empresa.socios.length} ${empresa.socios.length === 1 ? "sócio" : "sócios"} registrado${empresa.socios.length === 1 ? "" : "s"} no QSA.`,
    );
  }

  // Sanções
  if (sancoes.length === 0) {
    linhas.push("Nenhum registro de sanção encontrado no CEIS/CNEP para este CNPJ.");
  } else {
    linhas.push(
      `⚠️ Sinal de atenção: ${sancoes.length} ${sancoes.length === 1 ? "registro de sanção" : "registros de sanção"} encontrado${sancoes.length === 1 ? "" : "s"} no CEIS/CNEP.`,
    );
    const origens = [...new Set(sancoes.map((s) => s.attributes.origem).filter(Boolean))];
    if (origens.length > 0) {
      linhas.push(`Origens: ${origens.join(", ")}.`);
    }
  }

  // Contratos públicos
  const { contratos } = data;
  if (contratos.length > 0) {
    const totalValor = contratos.reduce((acc, c) => {
      const v = Number(c.attributes.valorGlobal ?? 0);
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);
    const valorTexto =
      totalValor > 0
        ? ` — total de ${totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
        : "";
    linhas.push(
      `Ganhou ${contratos.length} ${contratos.length === 1 ? "contrato público" : "contratos públicos"} registrado${contratos.length === 1 ? "" : "s"} no PNCP${valorTexto} — sinal de oportunidade para relacionamento com o poder público.`,
    );
  } else {
    linhas.push("Nenhum contrato público encontrado no PNCP para este CNPJ.");
  }

  return linhas;
}

// ─── Exportação CSV ───────────────────────────────────────────────────────────

function escapeCsv(val: unknown): string {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cols: unknown[]): string {
  return cols.map(escapeCsv).join(",");
}

export function buildCsvBlob(data: RaioXReportData): Blob {
  const { empresa, sancoes, contratos } = data;
  const geradoEm = new Date().toLocaleString("pt-BR");

  const lines: string[] = [
    `Raio-X de Empresa — gerado em ${geradoEm}`,
    "",
    "=== DADOS CADASTRAIS ===",
    row("Campo", "Valor", "Fonte", "Data consulta"),
    row("CNPJ", formatCnpj(empresa.cnpj), "Receita Federal (Minha Receita)", data.cadastralFetchedAt),
    row("Razão Social", empresa.razaoSocial, "Receita Federal", data.cadastralFetchedAt),
    row("Nome Fantasia", empresa.nomeFantasia, "Receita Federal", data.cadastralFetchedAt),
    row("Situação", empresa.situacao, "Receita Federal", data.cadastralFetchedAt),
    row("CNAE Principal", empresa.cnaePrincipal, "Receita Federal", data.cadastralFetchedAt),
    row("Código CNAE", empresa.cnaeCodigo, "Receita Federal", data.cadastralFetchedAt),
    row("Natureza Jurídica", empresa.naturezaJuridica, "Receita Federal", data.cadastralFetchedAt),
    row("Porte", empresa.porte, "Receita Federal", data.cadastralFetchedAt),
    row("Abertura", formatDate(empresa.abertura), "Receita Federal", data.cadastralFetchedAt),
    row("Município/UF", [empresa.municipio, empresa.uf].filter(Boolean).join("/"), "Receita Federal", data.cadastralFetchedAt),
    row("Endereço", empresa.endereco, "Receita Federal", data.cadastralFetchedAt),
    row("Capital Social (R$)", empresa.capitalSocial, "Receita Federal", data.cadastralFetchedAt),
    row("E-mail", empresa.email, "Receita Federal", data.cadastralFetchedAt),
    row("Telefone", empresa.telefone, "Receita Federal", data.cadastralFetchedAt),
    "",
    "=== QUADRO SOCIETÁRIO (QSA) ===",
    row("Nome", "Qualificação", "Faixa Etária", "Entrada"),
    ...empresa.socios.map((s) => row(s.nome, s.qualificacao, s.faixaEtaria, s.entrada)),
    "",
    "=== SANÇÕES (CEIS/CNEP) ===",
    row("Origem", "Tipo", "Órgão Sancionador", "Início", "Fim", "Fundamentação", "Fonte", "Data consulta"),
    ...(sancoes.length === 0
      ? [row("Nenhum registro encontrado", "", "", "", "", "", "Portal da Transparência (CGU)", data.sancoesFetchedAt)]
      : sancoes.map((s) =>
          row(
            s.attributes.origem ?? "",
            s.attributes.tipoSancao ?? "",
            s.attributes.orgaoSancionador ?? "",
            formatDate(s.attributes.dataInicioSancao ?? ""),
            formatDate(s.attributes.dataFimSancao ?? ""),
            s.attributes.fundamentacaoLegal ?? "",
            "Portal da Transparência (CGU)",
            data.sancoesFetchedAt,
          ),
        )),
    "",
    "=== CONTRATOS PÚBLICOS (PNCP) ===",
    row("Órgão", "Objeto", "Valor Global (R$)", "Modalidade", "Início Vigência", "UF", "Município", "Nº Controle PNCP", "Fonte", "Data consulta"),
    ...(contratos.length === 0
      ? [row("Nenhum contrato encontrado", "", "", "", "", "", "", "", "Portal Nacional de Contratações Públicas (PNCP)", data.contratosFetchedAt)]
      : contratos.map((c) =>
          row(
            c.attributes.orgao ?? "",
            c.attributes.objeto ?? "",
            c.attributes.valorGlobal != null ? String(c.attributes.valorGlobal) : "",
            c.attributes.modalidade ?? "",
            formatDate(c.attributes.dataVigenciaInicio ?? ""),
            c.attributes.uf ?? "",
            c.attributes.municipio ?? "",
            c.attributes.numeroControlePNCP ?? "",
            "Portal Nacional de Contratações Públicas (PNCP)",
            data.contratosFetchedAt,
          ),
        )),
  ];

  return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
}
