// _rag.ts — Recuperação híbrida + reranking para a edge `fonteia` (runtime Deno).
//
// PORQUÊ ESTE ARQUIVO EXISTE (e não importa @fonteia/ai)
// ------------------------------------------------------
// A edge `fonteia` é deployada ISOLADA (Deno, sem o monorepo). Não pode importar
// o pacote workspace `@fonteia/ai`. Por isso este módulo REIMPLEMENTA a MESMA
// lógica pura de `packages/ai/src/retrieval.ts` (RRF + reranker heurístico +
// extração de fonte) e adiciona a camada de I/O específica da edge:
//   - keywordSearch(): chama a edge `d1-bridge` (/query, name LIKE) p/ o sinal léxico.
// Mantenha os dois arquivos em PARIDADE: ao mudar um algoritmo aqui, espelhe lá.
//
// TUDO É ADITIVO: estas funções só são chamadas pelas rotas /ai/search e /ai/chat
// e nunca alteram a forma da resposta — só melhoram a ORDEM/RECALL dos resultados.

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
