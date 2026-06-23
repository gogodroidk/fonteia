// _rag.ts — Recuperação híbrida + reranking para a edge `fonteia` (runtime Deno).
//
// PORQUÊ ESTE ARQUIVO EXISTE (e não importa @fonteia/ai)
// ------------------------------------------------------
// A edge `fonteia` é deployada ISOLADA (Deno, sem o monorepo). Não pode importar
// o pacote workspace `@fonteia/ai`. Por isso este módulo REIMPLEMENTA a MESMA
// lógica pura de `packages/ai/src/retrieval.ts` (RRF + reranker heurístico +
// extração de fonte) E de `packages/ai/src/cross-reference.ts` (cruzamento por
// CNPJ — "ligar os pontos"), e adiciona a camada de I/O específica da edge:
//   - keywordSearch(): chama a edge `d1-bridge` (/query, name LIKE) p/ o sinal léxico.
//   - relatedByCnpj(): chama a edge `d1-bridge` (/query?cnpj=) p/ as entidades que
//     compartilham o CNPJ (contratos, sanções, transferências, licitações etc.).
// Mantenha os dois conjuntos em PARIDADE: ao mudar um algoritmo aqui, espelhe lá.
//
// TUDO É ADITIVO: estas funções só são chamadas pelas rotas /ai/search e /ai/chat
// e nunca alteram a forma da resposta — só melhoram a ORDEM/RECALL e o CONTEXTO.

import { fetchWithTimeout } from "../_shared/http.ts";

/* ─── Tipos (espelham RetrievalCandidate / RankedList / FusedCandidate) ──────── */

export interface RetrievalCandidate {
  id: string;
  kind: string;
  name: string;
  attributes: Record<string, unknown>;
  /** Score cosine [0,1] do vetor quando o item veio do lado vetorial; senão undefined. */
  score?: number;
}

export interface RankedList {
  source: "vector" | "keyword";
  items: RetrievalCandidate[];
  weight?: number;
}

export interface FusedCandidate extends RetrievalCandidate {
  fusionScore: number;
  rerankScore: number;
}

/* ─── Normalização / tokenização pt-BR ──────────────────────────────────────── */

export function normalizePtBr(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacríticos (acentos) — bloco combining marks
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizePtBr(text: string): string[] {
  const norm = normalizePtBr(text);
  if (!norm) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of norm.split(" ")) {
    if (tok.length <= 1) continue;
    if (!seen.has(tok)) {
      seen.add(tok);
      out.push(tok);
    }
  }
  return out;
}

/* ─── Reciprocal Rank Fusion ────────────────────────────────────────────────── */

const RRF_K = 60;

export function reciprocalRankFusion(lists: RankedList[]): FusedCandidate[] {
  const byId = new Map<string, { cand: RetrievalCandidate; fusion: number }>();

  for (const list of lists) {
    const weight = typeof list.weight === "number" && list.weight > 0 ? list.weight : 1;
    let rank = 0;
    for (const item of list.items) {
      if (!item || typeof item.id !== "string" || item.id.length === 0) continue;
      rank += 1;
      const contribution = weight / (RRF_K + rank);
      const existing = byId.get(item.id);
      if (existing) {
        existing.fusion += contribution;
        const incoming = typeof item.score === "number" ? item.score : undefined;
        if (incoming !== undefined && (existing.cand.score === undefined || incoming > existing.cand.score)) {
          existing.cand = { ...existing.cand, score: incoming };
        }
        if ((!existing.cand.name || existing.cand.name.length === 0) && item.name) {
          existing.cand = { ...existing.cand, name: item.name };
        }
      } else {
        byId.set(item.id, {
          cand: {
            id: item.id,
            kind: item.kind ?? "",
            name: item.name ?? "",
            attributes: item.attributes ?? {},
            ...(typeof item.score === "number" ? { score: item.score } : {}),
          },
          fusion: contribution,
        });
      }
    }
  }

  const fused: FusedCandidate[] = [];
  for (const { cand, fusion } of byId.values()) {
    fused.push({ ...cand, fusionScore: fusion, rerankScore: fusion });
  }
  fused.sort((a, b) => (b.fusionScore - a.fusionScore) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return fused;
}

/* ─── Reranker heurístico determinístico ────────────────────────────────────── */

const SEARCHABLE_ATTR_KEYS = [
  "name", "nome", "razao_social", "razaoSocial", "nome_fantasia", "nomeFantasia",
  "titulo", "title", "descricao", "description", "objeto", "municipio", "city",
  "uf", "orgao", "agency", "cnpj", "marca", "partido",
];

function candidateText(cand: RetrievalCandidate): string {
  const parts: string[] = [cand.name ?? ""];
  const attrs = cand.attributes ?? {};
  for (const key of SEARCHABLE_ATTR_KEYS) {
    const v = (attrs as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) parts.push(v);
    else if (typeof v === "number") parts.push(String(v));
  }
  return parts.join(" ");
}

const RERANK_WEIGHTS = {
  exactName: 1.0,
  nameStarts: 0.5,
  phraseInName: 0.45,
  termOverlap: 0.6,
  vector: 0.7,
  fusion: 0.5,
};

export function rerankCandidates(query: string, fused: FusedCandidate[]): FusedCandidate[] {
  const qNorm = normalizePtBr(query);
  const qTerms = tokenizePtBr(query);
  const maxFusion = fused.reduce((m, c) => (c.fusionScore > m ? c.fusionScore : m), 0);

  const scored = fused.map((cand) => {
    const nameNorm = normalizePtBr(cand.name ?? "");
    const textNorm = normalizePtBr(candidateText(cand));

    const exactName = qNorm.length > 0 && nameNorm === qNorm ? 1 : 0;
    const nameStarts = qNorm.length > 0 && nameNorm.startsWith(qNorm) ? 1 : 0;
    const phraseInName = qNorm.length > 0 && nameNorm.includes(qNorm) ? 1 : 0;

    let overlap = 0;
    if (qTerms.length > 0) {
      let hits = 0;
      for (const term of qTerms) if (textNorm.includes(term)) hits += 1;
      overlap = hits / qTerms.length;
    }

    const vector = typeof cand.score === "number" && cand.score > 0 ? Math.min(cand.score, 1) : 0;
    const fusionNorm = maxFusion > 0 ? cand.fusionScore / maxFusion : 0;

    const rerankScore =
      RERANK_WEIGHTS.exactName * exactName +
      RERANK_WEIGHTS.nameStarts * nameStarts +
      RERANK_WEIGHTS.phraseInName * phraseInName +
      RERANK_WEIGHTS.termOverlap * overlap +
      RERANK_WEIGHTS.vector * vector +
      RERANK_WEIGHTS.fusion * fusionNorm;

    return { ...cand, rerankScore };
  });

  scored.sort(
    (a, b) =>
      b.rerankScore - a.rerankScore ||
      b.fusionScore - a.fusionScore ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return scored;
}

export function hybridRank(lists: RankedList[], query: string, limit: number): FusedCandidate[] {
  const fused = reciprocalRankFusion(lists);
  const reranked = rerankCandidates(query, fused);
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : reranked.length;
  return reranked.slice(0, n);
}

/* ─── Extração de fonte citável + bloco de contexto ─────────────────────────── */

export interface EntitySource {
  name: string;
  kind: string;
  sourceUrl?: string;
  date?: string;
}

const SOURCE_URL_KEYS = ["sourceUrl", "source_url", "url", "link", "fonte", "fonteUrl", "permalink"];
const SOURCE_DATE_KEYS = ["collectedAt", "collected_at", "updatedAt", "updated_at", "data", "date", "dataColeta"];

function firstStringField(attrs: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = attrs[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

export function extractEntitySource(cand: RetrievalCandidate): EntitySource {
  const attrs = cand.attributes ?? {};
  const url = firstStringField(attrs, SOURCE_URL_KEYS);
  const date = firstStringField(attrs, SOURCE_DATE_KEYS);
  return {
    name: cand.name ?? "(sem nome)",
    kind: cand.kind ?? "",
    ...(url ? { sourceUrl: url } : {}),
    ...(date ? { date } : {}),
  };
}

export function buildRetrievalContextBlock(
  candidates: RetrievalCandidate[],
  opts: { maxItems?: number; maxChars?: number } = {},
): string {
  const maxItems = opts.maxItems && opts.maxItems > 0 ? opts.maxItems : 6;
  const maxChars = opts.maxChars && opts.maxChars > 0 ? opts.maxChars : 1800;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";

  const lines: string[] = [];
  let i = 0;
  for (const cand of candidates) {
    if (i >= maxItems) break;
    const src = extractEntitySource(cand);
    const bits = [`[${i + 1}] ${src.name} (tipo: ${src.kind || "desconhecido"})`];
    if (src.sourceUrl) bits.push(`fonte: ${src.sourceUrl}`);
    if (src.date) bits.push(`data: ${src.date}`);
    lines.push(bits.join(" · "));
    i += 1;
  }
  const block = lines.join("\n");
  return block.length > maxChars ? block.slice(0, maxChars) : block;
}

/* ─── Sinal de palavra-chave: chama a edge d1-bridge (/query, name LIKE) ─────── */

interface D1Entity {
  id?: string;
  kind?: string;
  name?: string;
  attributes?: unknown;
}
interface D1QueryResponse {
  count?: number;
  entities?: D1Entity[];
}

/**
 * Busca léxica no BULK (Cloudflare D1) via edge `d1-bridge`.
 * É o COMPLEMENTO do vetor: acerta CNPJ/nome próprio/número exato que o embedding
 * erra. Best-effort e tolerante a falha: QUALQUER erro/timeout ⇒ devolve [] e o
 * caller cai para o vetor puro (comportamento atual preservado).
 *
 * @param supabaseUrl base do projeto (Deno.env SUPABASE_URL).
 * @param apikey      chave pública do projeto (header `apikey`, igual à edge).
 * @param query       texto livre do usuário.
 * @param kind        filtro de kind opcional (mesmo do /ai/search).
 * @param limit       teto de itens (cap defensivo aplicado pelo d1-bridge também).
 */
export async function keywordSearch(
  supabaseUrl: string,
  apikey: string,
  query: string,
  kind: string | null,
  limit: number,
): Promise<RetrievalCandidate[]> {
  if (!supabaseUrl || !apikey) return [];
  const q = query.trim();
  if (q.length === 0) return [];

  const params = new URLSearchParams();
  params.set("q", q.slice(0, 200)); // o d1-bridge faz o escape do LIKE; só limitamos tamanho
  if (kind) params.set("kind", kind);
  params.set("limit", String(Math.min(Math.max(limit, 1), 50)));

  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/d1-bridge/query?${params.toString()}`;
  try {
    const res = await fetchWithTimeout(url, { headers: { apikey, accept: "application/json" } }, 8000);
    if (!res.ok) {
      console.warn(`[fonteia] keywordSearch d1-bridge HTTP ${res.status} (fallback p/ vetor puro)`);
      return [];
    }
    const data = (await res.json()) as D1QueryResponse;
    const rows = Array.isArray(data.entities) ? data.entities : [];
    const out: RetrievalCandidate[] = [];
    for (const r of rows) {
      if (!r || typeof r.id !== "string" || r.id.length === 0) continue;
      out.push({
        id: r.id,
        kind: typeof r.kind === "string" ? r.kind : "",
        name: typeof r.name === "string" ? r.name : "",
        attributes:
          r.attributes && typeof r.attributes === "object" && !Array.isArray(r.attributes)
            ? (r.attributes as Record<string, unknown>)
            : {},
        // keyword não tem score vetorial — fica undefined (entra na fusão por rank).
      });
    }
    return out;
  } catch (e) {
    console.warn("[fonteia] keywordSearch falhou (fallback p/ vetor puro):", String(e));
    return [];
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * CRUZAMENTO POR CNPJ — "ligar os pontos"
 * Espelho PURO de packages/ai/src/cross-reference.ts + a I/O da edge
 * (relatedByCnpj → d1-bridge /query?cnpj=). Ao mudar a agregação aqui, espelhe lá.
 * Regra de ouro preservada: NUNCA inventa; só conta/soma o que veio do acervo e
 * carrega a fonte oficial de cada item.
 * ════════════════════════════════════════════════════════════════════════════ */

const CNPJ_ATTR_KEYS = ["cnpj", "cnpjBase", "cnpj_base", "cnpjRaiz", "cnpj_raiz"];

function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}

/** Extrai CNPJ de 14 dígitos de attributes.cnpj ou do id (quando é o próprio CNPJ). */
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
  if (typeof cand.id === "string") {
    const d = digitsOnly(cand.id);
    if (d.length === 14) return d;
  }
  return null;
}

/** Formata 14 dígitos como 00.000.000/0000-00. */
export function formatCnpj(cnpj14: string): string {
  const d = digitsOnly(cnpj14);
  if (d.length !== 14) return cnpj14;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const VALUE_ATTR_KEYS = [
  "valor", "valorTotal", "valor_total", "valorContrato", "valorGlobal",
  "valueCents", "valorMulta", "valorEstimado", "valorHomologado", "montante",
];

function parseBrlNumber(raw: string): number | null {
  const s = raw.replace(/[^0-9.,-]/g, "").trim();
  if (s === "" || s === "-" || s === ",") return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

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

const ATTENTION_KINDS = new Set(["sanction", "environmental_infraction"]);

export interface CrossRefGroup {
  kind: string;
  count: number;
  totalValueBRL: number | null;
  attention: boolean;
  samples: Array<{ name: string; sourceUrl?: string }>;
}

export interface CrossReferenceSummary {
  cnpj: string;
  anchorName: string;
  totalRelated: number;
  groups: CrossRefGroup[];
}

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
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    totalRelated += 1;

    const kind = item.kind || "desconhecido";
    let group = byKind.get(kind);
    if (!group) {
      group = { kind, count: 0, totalValueBRL: null, attention: ATTENTION_KINDS.has(kind), samples: [] };
      byKind.set(kind, group);
    }
    group.count += 1;

    const attrs = item.attributes ?? {};
    const value = extractValueBRL(attrs);
    if (value !== null) group.totalValueBRL = (group.totalValueBRL ?? 0) + value;
    if (group.samples.length < maxSamples) {
      const sourceUrl = firstStringField(attrs, SOURCE_URL_KEYS);
      group.samples.push({ name: item.name || "(sem nome)", ...(sourceUrl ? { sourceUrl } : {}) });
    }
  }

  const groups = [...byKind.values()].sort((a, b) => {
    if (a.attention !== b.attention) return a.attention ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
  });

  return { cnpj: formatCnpj(cnpj14), anchorName: anchor.name || "(sem nome)", totalRelated, groups };
}

export function formatBRLCompact(value: number): string {
  if (!Number.isFinite(value)) return "valor indisponível";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `R$ ${(value / 1_000_000_000).toFixed(1).replace(".", ",")} bi`;
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(value / 1_000)} mil`;
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

/** Bloco de contexto citável do cruzamento. "" quando não há relacionados. */
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
    if (g.totalValueBRL !== null && g.totalValueBRL > 0) bits.push(`somando ${formatBRLCompact(g.totalValueBRL)}`);
    const srcSample = g.samples.find((s) => s.sourceUrl)?.sourceUrl;
    if (srcSample) bits.push(`fonte: ${srcSample}`);
    lines.push(bits.join(" · "));
  }
  const block = lines.join("\n");
  return block.length > maxChars ? block.slice(0, maxChars) : block;
}

/**
 * Busca no BULK (D1) as entidades que compartilham o CNPJ da âncora, via edge
 * `d1-bridge` (/query?cnpj=, coluna indexada — exato, parametrizado pelo bridge).
 * É o que permite a IA CRUZAR ("essa empresa tem X contratos e Y sanções").
 * Best-effort: qualquer erro/timeout ⇒ devolve [] (a resposta segue sem cruzamento).
 *
 * @param cnpj14 CNPJ de 14 dígitos (já normalizado por extractCnpj).
 * @param limit  teto de itens trazidos (o d1-bridge também aplica cap).
 */
export async function relatedByCnpj(
  supabaseUrl: string,
  apikey: string,
  cnpj14: string,
  limit: number,
): Promise<RetrievalCandidate[]> {
  if (!supabaseUrl || !apikey) return [];
  const cnpj = digitsOnly(cnpj14);
  if (cnpj.length !== 14) return [];

  const params = new URLSearchParams();
  params.set("cnpj", cnpj);
  params.set("limit", String(Math.min(Math.max(limit, 1), 200)));

  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/d1-bridge/query?${params.toString()}`;
  try {
    const res = await fetchWithTimeout(url, { headers: { apikey, accept: "application/json" } }, 8000);
    if (!res.ok) {
      console.warn(`[fonteia] relatedByCnpj d1-bridge HTTP ${res.status} (segue sem cruzamento)`);
      return [];
    }
    const data = (await res.json()) as D1QueryResponse;
    const rows = Array.isArray(data.entities) ? data.entities : [];
    const out: RetrievalCandidate[] = [];
    for (const r of rows) {
      if (!r || typeof r.id !== "string" || r.id.length === 0) continue;
      out.push({
        id: r.id,
        kind: typeof r.kind === "string" ? r.kind : "",
        name: typeof r.name === "string" ? r.name : "",
        attributes:
          r.attributes && typeof r.attributes === "object" && !Array.isArray(r.attributes)
            ? (r.attributes as Record<string, unknown>)
            : {},
      });
    }
    return out;
  } catch (e) {
    console.warn("[fonteia] relatedByCnpj falhou (segue sem cruzamento):", String(e));
    return [];
  }
}
