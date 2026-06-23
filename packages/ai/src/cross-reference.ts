/**
 * Cruzamento de entidades por CNPJ — o "ligar os pontos" da Fonte.ia.
 *
 * PORQUÊ
 * ------
 * Uma busca devolve UMA entidade (ex.: a empresa "ACME LTDA"). Mas o valor do
 * produto é CRUZAR: a mesma raiz/CNPJ aparece em contratos públicos, sanções,
 * transferências federais, licitações etc. (todos no Cloudflare D1, com a coluna
 * indexada `cnpj`). Este módulo recebe a entidade-âncora + as entidades que
 * compartilham o CNPJ e produz um RESUMO CITÁVEL e determinístico, agrupado por
 * tipo (quantos contratos, quantas sanções, valores somados, fontes oficiais).
 *
 * Tudo aqui é PURO (sem rede, sem Deno/relógio): a camada de I/O (edge `fonteia`)
 * busca as entidades relacionadas no d1-bridge e passa para cá. Isto mantém a
 * lógica de agregação testável e em PARIDADE com o espelho em
 * `supabase/functions/fonteia/_rag.ts` (a edge não importa este pacote).
 *
 * REGRA DE OURO preservada: este módulo NUNCA inventa. Só conta/soma o que veio
 * do acervo e sempre carrega a fonte oficial de cada item para citação.
 */

import type { RetrievalCandidate } from "./retrieval";

/* ─── Extração de CNPJ ───────────────────────────────────────────────────────
 * O CNPJ pode estar no campo `cnpj` (D1) ou em attributes.cnpj / id. Normalizamos
 * para 14 dígitos. A "raiz" são os 8 primeiros dígitos (identifica o grupo
 * econômico: matriz + filiais compartilham a raiz). */

const CNPJ_ATTR_KEYS = ["cnpj", "cnpjBase", "cnpj_base", "cnpjRaiz", "cnpj_raiz"];

/** Mantém só dígitos. */
function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}

/**
 * Extrai um CNPJ de 14 dígitos de um candidato (campo `cnpj` em attributes ou,
 * como último recurso, do `id` quando ele é exatamente um CNPJ). Retorna null
 * quando não há um CNPJ válido de 14 dígitos.
 */
export function extractCnpj(cand: Pick<RetrievalCandidate, "id" | "attributes">): string | null {
  const attrs = cand.attributes ?? {};
  for (const key of CNPJ_ATTR_KEYS) {
    const v = (attrs as Record<string, unknown>)[key];
    if (typeof v === "string") {
      const d = digitsOnly(v);
      if (d.length === 14) return d;
    } else if (typeof v === "number") {
      const d = String(v).padStart(14, "0");
      if (d.length === 14) return d;
    }
  }
  // Alguns kinds (company) usam o próprio CNPJ como id.
  if (typeof cand.id === "string") {
    const d = digitsOnly(cand.id);
    if (d.length === 14) return d;
  }
  return null;
}

/** Os 8 primeiros dígitos do CNPJ (raiz / grupo econômico). */
export function cnpjRoot(cnpj14: string): string {
  const d = digitsOnly(cnpj14);
  return d.length >= 8 ? d.slice(0, 8) : d;
}

/** Formata 14 dígitos como 00.000.000/0000-00 (para exibição/citação). */
export function formatCnpj(cnpj14: string): string {
  const d = digitsOnly(cnpj14);
  if (d.length !== 14) return cnpj14;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/* ─── Valores monetários (best-effort, pt-BR e numérico) ──────────────────── */

const VALUE_ATTR_KEYS = [
  "valor", "valorTotal", "valor_total", "valorContrato", "valorGlobal",
  "valueCents", "valorMulta", "valorEstimado", "valorHomologado", "montante",
];

/**
 * Tenta extrair um valor em REAIS de attributes. Aceita number (centavos quando a
 * chave for *Cents, senão reais) e string pt-BR ("396.237,13"). Retorna o valor em
 * reais ou null. Conservador: ignora o que não parecer um número monetário.
 */
export function extractValueBRL(attrs: Record<string, unknown>): number | null {
  for (const key of VALUE_ATTR_KEYS) {
    const v = (attrs as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      return key.toLowerCase().includes("cents") ? v / 100 : v;
    }
    if (typeof v === "string" && v.trim().length > 0) {
      const parsed = parseBrlNumber(v);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

/** Converte "1.234.567,89" (pt-BR) ou "1234567.89" em número. null se não der. */
function parseBrlNumber(raw: string): number | null {
  const s = raw.replace(/[^0-9.,-]/g, "").trim();
  if (s === "" || s === "-" || s === ",") return null;
  let normalized: string;
  if (s.includes(",")) {
    // pt-BR: ponto = milhar, vírgula = decimal.
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/* ─── Rótulos amigáveis por kind (pt-BR) ─────────────────────────────────────
 * Tornam o resumo legível para um usuário leigo ("3 contratos públicos" em vez de
 * "3 public_contract"). Singular/plural simples. Kinds desconhecidos caem no kind
 * cru (nunca quebra). */

const KIND_LABELS: Record<string, { one: string; many: string }> = {
  company: { one: "empresa", many: "empresas" },
  organization: { one: "órgão/organização", many: "órgãos/organizações" },
  public_contract: { one: "contrato público", many: "contratos públicos" },
  bidding_opportunity: { one: "licitação", many: "licitações" },
  sanction: { one: "sanção", many: "sanções" },
  federal_transfer: { one: "transferência federal", many: "transferências federais" },
  parliamentary_expense: { one: "despesa parlamentar", many: "despesas parlamentares" },
  environmental_infraction: { one: "infração ambiental", many: "infrações ambientais" },
  environmental_alert: { one: "alerta ambiental", many: "alertas ambientais" },
  fiscal_report: { one: "relatório fiscal", many: "relatórios fiscais" },
  trademark: { one: "marca (INPI)", many: "marcas (INPI)" },
  legal_process: { one: "processo judicial", many: "processos judiciais" },
};

export function labelForKind(kind: string, count: number): string {
  const l = KIND_LABELS[kind];
  if (!l) return `${count} ${kind}`;
  return `${count} ${count === 1 ? l.one : l.many}`;
}

/* ─── Agregação por kind ─────────────────────────────────────────────────── */

/** Sinaliza kinds que pesam como "atenção" (sem linguagem acusatória). */
const ATTENTION_KINDS = new Set(["sanction", "environmental_infraction"]);

export interface CrossRefGroup {
  kind: string;
  count: number;
  /** Soma dos valores em reais quando os itens carregam valor (senão null). */
  totalValueBRL: number | null;
  /** true se este grupo é um "sinal de atenção" (sanção/infração). */
  attention: boolean;
  /** Até N exemplos citáveis (nome + fonte) para a IA referenciar. */
  samples: Array<{ name: string; sourceUrl?: string | undefined }>;
}

export interface CrossReferenceSummary {
  /** CNPJ de 14 dígitos usado como âncora do cruzamento (formatado). */
  cnpj: string;
  /** Nome da entidade-âncora (a empresa/órgão consultado). */
  anchorName: string;
  /** Total de entidades relacionadas (excluindo a âncora). */
  totalRelated: number;
  /** Grupos por kind, ordenados por: atenção primeiro, depois por contagem desc. */
  groups: CrossRefGroup[];
}

const SOURCE_URL_KEYS = ["sourceUrl", "source_url", "url", "link", "fonte", "fonteUrl", "permalink"];

function firstStringField(attrs: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = attrs[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

/**
 * Agrega entidades relacionadas (mesmo CNPJ) num resumo por kind. PURO.
 *
 * @param anchor   entidade consultada (excluída da contagem por id).
 * @param cnpj14   CNPJ de 14 dígitos da âncora (para exibir no resumo).
 * @param related  entidades que compartilham o CNPJ/raiz (do d1-bridge).
 * @param opts     maxSamplesPerKind: exemplos citáveis por grupo (default 2).
 */
export function summarizeCrossReference(
  anchor: Pick<RetrievalCandidate, "id" | "name">,
  cnpj14: string,
  related: RetrievalCandidate[],
  opts: { maxSamplesPerKind?: number } = {},
): CrossReferenceSummary {
  const maxSamples = opts.maxSamplesPerKind && opts.maxSamplesPerKind > 0 ? opts.maxSamplesPerKind : 2;
  const byKind = new Map<string, CrossRefGroup>();
  const seenIds = new Set<string>([anchor.id]);
  let totalRelated = 0;

  for (const item of related) {
    if (!item || typeof item.id !== "string" || item.id.length === 0) continue;
    if (seenIds.has(item.id)) continue; // não conta a âncora nem duplicatas
    seenIds.add(item.id);
    totalRelated += 1;

    const kind = item.kind || "desconhecido";
    let group = byKind.get(kind);
    if (!group) {
      group = {
        kind,
        count: 0,
        totalValueBRL: null,
        attention: ATTENTION_KINDS.has(kind),
        samples: [],
      };
      byKind.set(kind, group);
    }
    group.count += 1;

    const attrs = item.attributes ?? {};
    const value = extractValueBRL(attrs);
    if (value !== null) {
      group.totalValueBRL = (group.totalValueBRL ?? 0) + value;
    }
    if (group.samples.length < maxSamples) {
      const sourceUrl = firstStringField(attrs, SOURCE_URL_KEYS);
      group.samples.push({
        name: item.name || "(sem nome)",
        ...(sourceUrl ? { sourceUrl } : {}),
      });
    }
  }

  // Ordena: grupos de atenção primeiro, depois por contagem desc, depois kind asc
  // (determinístico). Assim "sanções" aparece antes de "contratos" no resumo.
  const groups = [...byKind.values()].sort((a, b) => {
    if (a.attention !== b.attention) return a.attention ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
  });

  return {
    cnpj: formatCnpj(cnpj14),
    anchorName: anchor.name || "(sem nome)",
    totalRelated,
    groups,
  };
}

/** Formata um valor em reais para exibição compacta (R$ 1,2 mi / R$ 396 mil). */
export function formatBRLCompact(value: number): string {
  if (!Number.isFinite(value)) return "valor indisponível";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `R$ ${(value / 1_000_000_000).toFixed(1).replace(".", ",")} bi`;
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(value / 1_000)} mil`;
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

/**
 * Monta o BLOCO DE CONTEXTO CITÁVEL do cruzamento (texto para o prompt).
 * Cada linha resume um grupo ("- 3 contratos públicos · fonte: ...") e marca os
 * sinais de atenção. Retorna "" quando não há relacionados (o caller então NÃO
 * injeta — preservando o guardrail de "evidência insuficiente").
 *
 * Esta é a peça que faz a IA "ligar os pontos": ela recebe, junto da entidade,
 * um panorama factual do que mais existe sobre aquele CNPJ no acervo.
 */
export function buildCrossReferenceBlock(
  summary: CrossReferenceSummary,
  opts: { maxChars?: number } = {},
): string {
  const maxChars = opts.maxChars && opts.maxChars > 0 ? opts.maxChars : 1200;
  if (summary.totalRelated === 0 || summary.groups.length === 0) return "";

  const head =
    `Cruzamento por CNPJ ${summary.cnpj} (${summary.anchorName}): ` +
    `${summary.totalRelated} registro(s) relacionado(s) no acervo.`;

  const lines: string[] = [head];
  for (const g of summary.groups) {
    const bits = [`- ${labelForKind(g.kind, g.count)}`];
    if (g.attention) bits.push("(sinal de atenção — requer validação humana)");
    if (g.totalValueBRL !== null && g.totalValueBRL > 0) {
      bits.push(`somando ${formatBRLCompact(g.totalValueBRL)}`);
    }
    const srcSample = g.samples.find((s) => s.sourceUrl)?.sourceUrl;
    if (srcSample) bits.push(`fonte: ${srcSample}`);
    lines.push(bits.join(" · "));
  }

  const block = lines.join("\n");
  return block.length > maxChars ? block.slice(0, maxChars) : block;
}
