/**
 * dossie-api.ts
 * Dossiê Empresarial Automatizado — agrega todos os módulos disponíveis sobre um
 * CNPJ em uma estrutura única, com score de risco TRANSPARENTE (só sinais reais) e
 * rastreabilidade total (todas as fontes citadas).
 *
 * Princípio cardinal: NUNCA fabricar. Se um módulo não tem dados, a seção existe
 * com count=0 e mensagem honesta. Degrada graciosamente em falhas parciais.
 *
 * Fluxo:
 *   1. expandCnpj(cnpj)  — puxos TODOS os módulos em paralelo (D1 bulk + premium)
 *   2. lookupCnpj(cnpj)  — enriquecimento cadastral on-demand (Minha Receita) [opcional]
 *   3. Agrupa folhas por kind em seções legíveis
 *   4. Calcula riskScore a partir de sinais reais (sanções, infrações, etc.)
 *   5. Constrói fontes para rastreabilidade
 *   6. Expõe helper dossieToReport() para salvar em Relatórios
 */

import {
  expandCnpj,
  sanitizeCnpj,
  formatCnpj,
  type RawLeaf,
  type ExpandResult,
} from "../cerebro/cerebro-api";
import { lookupCnpj, type EmpresaCnpj } from "../empresas/empresas-api";
import { requestCompanyEnrichment } from "../empresas/company-search";
import type { DetailField } from "../cerebro/types";
import type { SavedReport, ReportField, ReportSource } from "../reports/reports-store";

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export interface DossieRiskFactor {
  /** Rótulo legível do fator de risco (pt-BR). */
  label: string;
  /** Peso no score final (pode ser positivo — aumenta risco — ou negativo — reduz). */
  weight: number;
  /** Explicação em prosa para o leigo. */
  detail: string;
}

/** Item individual dentro de uma seção do dossiê. */
export interface DossieItem {
  label: string;
  sublabel?: string | undefined;
  sourceUrl?: string | undefined;
  details?: DetailField[] | undefined;
}

/** Seção agregada por módulo (kind). */
export interface DossieSection {
  kind: string;
  kindLabel: string;
  count: number;
  items: DossieItem[];
}

/** Sócio / administrador da empresa (QSA). */
export interface DossieSocio {
  nome: string;
  qualificacao: string;
  entrada: string;
}

/** Fonte de dados citada no dossiê (rastreabilidade). */
export interface DossieSource {
  label: string;
  url?: string | undefined;
  collectedAt?: string | undefined;
}

/** O dossiê completo de uma empresa. */
export interface Dossie {
  cnpj: string;
  razaoSocial: string;
  /** Dados cadastrais (CNAE, capital, situação, etc.) formatados para exibição. */
  cadastro: DetailField[];
  /** Sócios/administradores do QSA. */
  socios: DossieSocio[];
  /** Seções por módulo (Sanções, Contratos, etc.), inclusive as vazias. */
  sections: DossieSection[];
  /** Score de risco 0–100 (calculado exclusivamente de sinais reais das fontes). */
  riskScore: number;
  /** Classificação legível do score. */
  riskLabel: "baixo" | "medio" | "alto";
  /** Fatores que compõem o score — explicados em prosa para o leigo. */
  riskFactors: DossieRiskFactor[];
  /** Fontes consultadas (rastreabilidade). */
  sources: DossieSource[];
  /** ISO-8601 da geração do dossiê. */
  generatedAt: string;
  /** Erros não-fatais capturados durante a coleta. */
  warnings: string[];
}

// ─── Configuração das seções ──────────────────────────────────────────────────

/** Seções que montamos, na ordem de exibição. */
const SECTION_DEFS: Array<{ kind: string; kindLabel: string }> = [
  { kind: "sanction",                kindLabel: "Sanções (CEIS/CNEP)"              },
  { kind: "environmental_infraction", kindLabel: "Infrações ambientais (IBAMA)"    },
  { kind: "public_contract",         kindLabel: "Contratos públicos (PNCP)"        },
  { kind: "bidding_opportunity",     kindLabel: "Licitações (PNCP)"               },
  { kind: "trademark",               kindLabel: "Marcas INPI"                       },
  { kind: "parliamentary_expense",   kindLabel: "Despesas parlamentares (CEAP)"    },
  { kind: "legal_process",           kindLabel: "Processos judiciais (CNJ)"        },
  { kind: "organization",            kindLabel: "Órgãos públicos relacionados"     },
  { kind: "politician",              kindLabel: "Políticos relacionados"            },
];

/** Fontes estáticas consultadas pelo expandCnpj, para rastreabilidade. */
const STATIC_SOURCES: DossieSource[] = [
  {
    label: "Portal da Transparência — Sanções (CEIS/CNEP)",
    url: "https://portaldatransparencia.gov.br/sancoes",
  },
  {
    label: "IBAMA — Autos de Infração",
    url: "https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao",
  },
  {
    label: "PNCP — Contratos e Licitações",
    url: "https://pncp.gov.br",
  },
  {
    label: "INPI — Registro de Marcas",
    url: "https://busca.inpi.gov.br/pePI/jsp/marcas/Pesquisa_classe_basica.jsp",
  },
  {
    label: "Câmara dos Deputados — Cota Parlamentar (CEAP)",
    url: "https://www.camara.leg.br/transparencia/gastos-parlamentares",
  },
  {
    label: "CNJ DataJud — Processos Judiciais",
    url: "https://www.cnj.jus.br/sistemas/datajud/",
  },
  {
    label: "BrasilAPI — Cadastro CNPJ (Receita Federal)",
    url: "https://brasilapi.com.br",
  },
];

// ─── Score de risco ───────────────────────────────────────────────────────────

/**
 * Calcula o score de risco (0–100) a partir de sinais REAIS encontrados nas fontes.
 * Transparente: cada fator explica sua contribuição em linguagem acessível.
 * Nunca fabrica: sem dados = sem penalidade.
 *
 * Escala orientativa:
 *   0–29  → baixo   (poucos ou nenhum sinal de risco)
 *   30–59 → médio   (sinais de atenção, mas não críticos)
 *   60–100 → alto   (sanções ativas, infrações e/ou processos expressivos)
 */
function computeRisk(
  leaves: RawLeaf[],
): { score: number; label: "baixo" | "medio" | "alto"; factors: DossieRiskFactor[] } {
  const factors: DossieRiskFactor[] = [];
  let score = 0;

  // ── Sanções ──────────────────────────────────────────────────────────────────
  const sanctions = leaves.filter((l) => l.kind === "sanction");
  if (sanctions.length > 0) {
    const w = Math.min(40, 20 + sanctions.length * 5);
    score += w;
    factors.push({
      label: `${sanctions.length} sanção${sanctions.length > 1 ? "ões" : ""} (CEIS/CNEP)`,
      weight: w,
      detail:
        sanctions.length === 1
          ? "A empresa possui 1 registro de sanção no Portal da Transparência (CEIS/CNEP). Sanções indicam penalidades administrativas aplicadas pelo governo federal — como suspensão de contratos ou inidoneidade para licitar."
          : `A empresa possui ${sanctions.length} registros de sanção. Quanto mais sanções, maior o risco de restrições contratuais com o poder público.`,
    });
  }

  // ── Infrações ambientais ──────────────────────────────────────────────────────
  const envInf = leaves.filter((l) => l.kind === "environmental_infraction");
  if (envInf.length > 0) {
    const w = Math.min(30, 10 + envInf.length * 4);
    score += w;
    factors.push({
      label: `${envInf.length} infração${envInf.length > 1 ? "ões" : ""} ambiental${envInf.length > 1 ? "is" : ""} (IBAMA)`,
      weight: w,
      detail:
        `Foram encontrados ${envInf.length} auto${envInf.length > 1 ? "s" : ""} de infração ambiental lavrado${envInf.length > 1 ? "s" : ""} pelo IBAMA. Infrações ambientais podem gerar multas, interdições e restrições operacionais.`,
    });
  }

  // ── Processos judiciais ──────────────────────────────────────────────────────
  const legalProc = leaves.filter((l) => l.kind === "legal_process");
  if (legalProc.length > 0) {
    // Processos são indício de litígio, mas sem condenação confirmada — peso menor.
    const w = Math.min(20, 5 + legalProc.length * 2);
    score += w;
    factors.push({
      label: `${legalProc.length} processo${legalProc.length > 1 ? "s" : ""} judicial${legalProc.length > 1 ? "is" : ""} (CNJ)`,
      weight: w,
      detail:
        `Foram identificados ${legalProc.length} processo${legalProc.length > 1 ? "s" : ""} judiciais associados ao nome da empresa. Importante: o dataset do CNJ não discrimina as partes — um processo pode ter a empresa como autora ou ré. Verifique os detalhes individualmente.`,
    });
  }

  // ── Contratos públicos — contexto, não risco per se ──────────────────────────
  const contracts = leaves.filter((l) => l.kind === "public_contract");
  if (contracts.length > 0) {
    // Muitos contratos sem sanção = empresa estabelecida. Peso zero ou levemente positivo.
    factors.push({
      label: `${contracts.length} contrato${contracts.length > 1 ? "s" : ""} público${contracts.length > 1 ? "s" : ""} (PNCP)`,
      weight: 0,
      detail:
        "A empresa possui contratos com o poder público registrados no PNCP. Isso é um indicador de atividade legítima — não é um fator de risco por si só; avalie em conjunto com as sanções.",
    });
  }

  // ── Sem dados: empresa sem histórico público ────────────────────────────────
  if (leaves.length === 0) {
    factors.push({
      label: "Sem histórico nas fontes públicas",
      weight: 0,
      detail:
        "Nenhum registro foi encontrado nas fontes consultadas. Isso pode indicar uma empresa nova, de pequeno porte, ou simplesmente que seus dados ainda não foram indexados. Não é necessariamente um risco — avalie o contexto.",
    });
  }

  const clamped = Math.min(100, Math.max(0, score));
  const label: "baixo" | "medio" | "alto" =
    clamped >= 60 ? "alto" : clamped >= 30 ? "medio" : "baixo";

  return { score: clamped, label, factors };
}

// ─── Extração de sócios das leaves ───────────────────────────────────────────

function sociosFromLeaves(leaves: RawLeaf[]): DossieSocio[] {
  return leaves
    .filter((l) => l.kind === "person")
    .map((l) => {
      const nome = l.label;
      const qualificacao =
        l.details?.find((d) => d.label === "Qualificação")?.value ?? "";
      const entrada =
        l.details?.find((d) => d.label === "Entrada na sociedade")?.value ?? "";
      return { nome, qualificacao, entrada };
    });
}

// ─── Enriquecimento cadastral ─────────────────────────────────────────────────

/**
 * Monta os campos cadastrais a partir de:
 *   1. centerDetails do expandCnpj (cadastro BrasilAPI armazenado no D1), ou
 *   2. EmpresaCnpj do lookupCnpj (consulta on-demand Minha Receita).
 * Prefere o centerDetails quando disponível (evita a chamada extra paga/rate-limited).
 */
function buildCadastro(
  centerDetails: DetailField[] | undefined,
  empresa: EmpresaCnpj | undefined,
  cnpjFormatado: string,
): DetailField[] {
  // Usa centerDetails quando disponível (já extraído do BrasilAPI no D1)
  if (centerDetails && centerDetails.length > 0) {
    // Garante que o CNPJ aparece mesmo que o BrasilAPI não o inclua
    const hasCnpj = centerDetails.some((d) => d.label === "CNPJ");
    if (!hasCnpj) {
      return [{ label: "CNPJ", value: cnpjFormatado }, ...centerDetails];
    }
    return centerDetails;
  }

  // Fallback: EmpresaCnpj do lookupCnpj
  if (!empresa) {
    return [{ label: "CNPJ", value: cnpjFormatado }];
  }

  const fields: DetailField[] = [];
  const push = (label: string, value: string | number | undefined) => {
    if (value !== undefined && String(value).trim() !== "") {
      fields.push({ label, value: String(value) });
    }
  };

  push("CNPJ", empresa.cnpj ? formatCnpj(empresa.cnpj) : cnpjFormatado);
  push("Razão social", empresa.razaoSocial);
  push("Nome fantasia", empresa.nomeFantasia);
  push("Situação cadastral", empresa.situacao);
  push("CNAE principal", empresa.cnaePrincipal);
  push("Natureza jurídica", empresa.naturezaJuridica);
  push("Porte", empresa.porte);
  if (empresa.capitalSocial > 0) {
    push(
      "Capital social",
      empresa.capitalSocial.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    );
  }
  push("Abertura", empresa.abertura);
  push("Município/UF", [empresa.municipio, empresa.uf].filter(Boolean).join(" / "));
  push("Endereço", empresa.endereco);
  push("E-mail", empresa.email);
  push("Telefone", empresa.telefone);

  return fields;
}

// ─── Agrupamento de folhas em seções ─────────────────────────────────────────

function buildSections(leaves: RawLeaf[]): DossieSection[] {
  return SECTION_DEFS.map(({ kind, kindLabel }) => {
    const matching = leaves.filter((l) => l.kind === kind);
    const items: DossieItem[] = matching.map((l) => ({
      label: l.label,
      ...(l.sublabel !== undefined ? { sublabel: l.sublabel } : {}),
      ...(l.sourceUrl !== undefined ? { sourceUrl: l.sourceUrl } : {}),
      ...(l.details !== undefined ? { details: l.details } : {}),
    }));

    return {
      kind,
      kindLabel,
      count: matching.length,
      items,
    };
  });
}

// ─── Fontes do dossiê ─────────────────────────────────────────────────────────

function buildSources(
  expand: ExpandResult,
  empresa: EmpresaCnpj | undefined,
  generatedAt: string,
): DossieSource[] {
  const sources: DossieSource[] = [...STATIC_SOURCES];

  // Fonte premium (InfoSimples) quando marcas vierem de lá
  if (expand.trademarksPremium) {
    sources.push({
      label: "InfoSimples — Marcas INPI (premium, via proxy Fonte.ia)",
      url: "https://infosimples.com",
      collectedAt: generatedAt,
    });
  }

  // Fonte da Minha Receita quando lookupCnpj foi chamado
  if (empresa) {
    sources.push({
      label: "Minha Receita (Receita Federal) — Cadastro CNPJ on-demand",
      url: empresa.sourceUrl || `https://minhareceita.org/${expand.cnpj}`,
      collectedAt: generatedAt,
    });
  }

  return sources;
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Constrói o dossiê completo de um CNPJ.
 *
 * Chama `expandCnpj` (a maior parte do trabalho, já paralelizado internamente)
 * e, opcionalmente, `lookupCnpj` quando o enriquecimento cadastral do D1 não trouxer
 * os campos básicos (razão social, situação). Degrada graciosamente: se o lookupCnpj
 * falhar, usa o que o expand trouxe.
 *
 * NUNCA fabrica: seções vazias são explicitamente count=0, score calculado só de
 * sinais reais.
 */
export async function buildDossie(rawCnpj: string): Promise<Dossie> {
  const cnpj = sanitizeCnpj(rawCnpj);
  if (cnpj === "") {
    throw new Error("CNPJ inválido: informe os 14 dígitos (com ou sem máscara).");
  }

  const cnpjFormatado = formatCnpj(cnpj);
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];

  // 1. Expansão principal (D1 bulk — todos os módulos em paralelo)
  let expand: ExpandResult;
  try {
    expand = await expandCnpj(cnpj);
  } catch (err) {
    throw new Error(
      `Não foi possível consultar o CNPJ ${cnpjFormatado}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (expand.errors.length > 0) {
    warnings.push(...expand.errors);
  }

  // 2. Enriquecimento cadastral on-demand (Minha Receita), só se o D1 não trouxe
  //    campos básicos (situação, CNAE). Falha silenciosa — degrada para o que temos.
  let empresa: EmpresaCnpj | undefined;
  const hasCadastroFromD1 =
    (expand.centerDetails?.length ?? 0) > 2 &&
    expand.centerDetails?.some((d) => d.label === "Situação");

  if (!hasCadastroFromD1) {
    // Enriquecimento LAZY do BULK (TODO #96): quando o D1 ainda não tem o cadastro
    // `company`/QSA deste CNPJ, dispara o coletor `ingest-brasilapi` em background
    // para que a PRÓXIMA visita já encontre QSA/CNAE/capital no grafo. Best-effort:
    // não esperamos a resposta e nunca quebramos a tela (a chamada degrada sozinha).
    void requestCompanyEnrichment(cnpj);

    try {
      empresa = await lookupCnpj(cnpj);
    } catch (err) {
      warnings.push(
        `Cadastro on-demand indisponível: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 3. Razão social: prioriza centerLabel (já limpo pelo expand), depois lookup
  const razaoSocial =
    expand.centerLabel && expand.centerLabel !== cnpjFormatado
      ? expand.centerLabel
      : empresa?.razaoSocial ?? cnpjFormatado;

  // 4. Dados cadastrais
  const cadastro = buildCadastro(expand.centerDetails, empresa, cnpjFormatado);

  // 5. Sócios (QSA) — extraídos das folhas "person" geradas pelo expandCnpj
  const socios = sociosFromLeaves(expand.leaves);

  // 6. Seções por módulo
  const sections = buildSections(expand.leaves);

  // 7. Score de risco (exclusivamente de sinais reais)
  const { score: riskScore, label: riskLabel, factors: riskFactors } = computeRisk(expand.leaves);

  // 8. Fontes
  const sources = buildSources(expand, empresa, generatedAt);

  return {
    cnpj,
    razaoSocial,
    cadastro,
    socios,
    sections,
    riskScore,
    riskLabel,
    riskFactors,
    sources,
    generatedAt,
    warnings,
  };
}

// ─── Helper: dossiê → SavedReport ────────────────────────────────────────────

/**
 * Converte um Dossie em SavedReport para persistir em Relatórios.
 * O id é estável: `dossie:${cnpj}` — um dossiê por empresa, substituído ao reatualizar.
 */
export function dossieToReport(d: Dossie): SavedReport {
  const fields: ReportField[] = [
    { label: "CNPJ", value: formatCnpj(d.cnpj) },
    { label: "Razão social", value: d.razaoSocial },
    { label: "Score de risco", value: `${d.riskScore}/100 — ${riskLabelPt(d.riskLabel)}` },
    { label: "Fatores de risco", value: d.riskFactors.map((f) => f.label).join("; ") || "Nenhum identificado" },
    ...d.cadastro
      .filter((f) => f.label !== "CNPJ" && f.label !== "Razão social")
      .map((f) => ({ label: f.label, value: f.value })),
  ];

  // Adiciona sumário de cada seção
  for (const sec of d.sections) {
    if (sec.count > 0) {
      fields.push({
        label: sec.kindLabel,
        value: `${sec.count} registro${sec.count > 1 ? "s" : ""} encontrado${sec.count > 1 ? "s" : ""}`,
      });
    }
  }

  if (d.socios.length > 0) {
    fields.push({
      label: "Sócios/Administradores (QSA)",
      value: d.socios.map((s) => `${s.nome}${s.qualificacao ? ` (${s.qualificacao})` : ""}`).join("; "),
    });
  }

  const sources: ReportSource[] = d.sources.map((s) => ({
    label: s.label,
    ...(s.url !== undefined ? { url: s.url } : {}),
    ...(s.collectedAt !== undefined ? { collectedAt: s.collectedAt } : {}),
  }));

  return {
    id: `dossie:${d.cnpj}`,
    kind: "dossie",
    kindLabel: "Dossiê Empresarial",
    title: d.razaoSocial,
    subtitle: formatCnpj(d.cnpj),
    fields,
    sources,
    createdAt: d.generatedAt,
  };
}

/** Rótulo PT-BR do nível de risco. */
export function riskLabelPt(label: "baixo" | "medio" | "alto"): string {
  return label === "alto" ? "Alto" : label === "medio" ? "Médio" : "Baixo";
}

/** Cor CSS var para o nível de risco (compatível com o design system). */
export function riskColor(label: "baixo" | "medio" | "alto"): string {
  return label === "alto"
    ? "var(--danger)"
    : label === "medio"
      ? "var(--warn)"
      : "var(--ok)";
}
