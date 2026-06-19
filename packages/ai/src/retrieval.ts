/**
 * Recuperação híbrida + reranking — funções PURAS, determinísticas e sem rede.
 *
 * PORQUÊ
 * ------
 * A busca semântica (pgvector / `match_entities`) tem ótima cobertura conceitual,
 * mas erra em consultas "léxicas" (um CNPJ, um número de processo, um nome próprio
 * exato). A busca por palavra-chave (d1-bridge `name LIKE %q%`) acerta exatamente
 * esses casos, mas ignora sinônimos/semântica. Fundir as duas listas (Reciprocal
 * Rank Fusion) e depois RERANKAR por um heurístico transparente entrega o melhor
 * dos dois mundos: mais recall + os itens mais relevantes no topo.
 *
 * Tudo aqui é PURO (sem `fetch`, sem `Deno`, sem `process`): recebe candidatos já
 * coletados e devolve a lista reordenada. A camada de I/O (Edge Function) chama o
 * vetor e o keyword e passa os resultados para cá. Mantém o pacote testável e
 * reutilizável tanto no Worker (`@fonteia/ai`) quanto — espelhado — no runtime Deno.
 *
 * NOTA DE PARIDADE: o runtime Deno da edge `fonteia` NÃO importa este pacote
 * (deploy isolado), então `supabase/functions/fonteia/_rag.ts` reimplementa esta
 * MESMA lógica. Ao mudar um algoritmo aqui, espelhe lá (e vice-versa).
 */

/** Um candidato de recuperação, neutro quanto à origem (vetor ou keyword). */
export interface RetrievalCandidate {
  id: string;
  kind: string;
  name: string;
  attributes: Record<string, unknown>;
  /**
   * Score de similaridade do VETOR no intervalo [0,1] (cosine de `match_entities`),
   * quando o item veio (também) do lado vetorial. `undefined`/0 quando só veio do
   * keyword. Usado como sinal no reranker, NÃO como ordenação final.
   */
  score?: number | undefined;
}

/** Uma lista ranqueada de candidatos vinda de uma fonte (vetor ou keyword). */
export interface RankedList {
  /** Origem da lista — só para peso/telemetria. */
  source: "vector" | "keyword";
  /** Itens JÁ em ordem de relevância decrescente daquela fonte. */
  items: RetrievalCandidate[];
  /** Peso relativo desta fonte na fusão (default 1). */
  weight?: number | undefined;
}

/** Resultado final exposto ao caller: o candidato + os scores de diagnóstico. */
export interface FusedCandidate extends RetrievalCandidate {
  /** Score da fusão RRF (maior = melhor). Determinístico. */
  fusionScore: number;
  /** Score final do reranker (maior = melhor). Determinístico. */
  rerankScore: number;
}

/**
 * Constante de amortecimento do RRF. 60 é o valor clássico de Cormack et al.;
 * suaviza o peso das primeiras posições para que itens medianos em ambas as
 * listas possam superar um item que é #1 em só uma delas.
 */
const RRF_K = 60;

/** Normaliza texto pt-BR: minúsculas, sem acento, pontuação→espaço. */
export function normalizePtBr(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacríticos (acentos) — bloco combining marks
    .replace(/[^a-z0-9\s]/g, " ") // pontuação vira espaço
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokeniza uma string pt-BR em termos únicos (descarta tokens de 1 char). */
export function tokenizePtBr(text: string): string[] {
  const norm = normalizePtBr(text);
  if (!norm) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of norm.split(" ")) {
    if (tok.length <= 1) continue; // ignora ruído ("a", "o", "e", dígito solto)
    if (!seen.has(tok)) {
      seen.add(tok);
      out.push(tok);
    }
  }
  return out;
}

/**
 * Reciprocal Rank Fusion: funde N listas ranqueadas num único ranking.
 *
 * Para cada item: fusionScore = Σ_listas ( peso / (RRF_K + rank_naquela_lista) ).
 * Itens que aparecem bem posicionados em VÁRIAS listas sobem; um item que é #1
 * em só uma lista não domina sozinho. Determinístico e estável (desempate por id).
 *
 * Defensivo: ignora itens sem `id`, deduplica por `id` preservando o melhor score
 * vetorial visto e o `name`/`attributes` do primeiro registro não vazio.
 */
export function reciprocalRankFusion(lists: RankedList[]): FusedCandidate[] {
  const byId = new Map<
    string,
    { cand: RetrievalCandidate; fusion: number }
  >();

  for (const list of lists) {
    const weight = typeof list.weight === "number" && list.weight > 0 ? list.weight : 1;
    let rank = 0;
    for (const item of list.items) {
      if (!item || typeof item.id !== "string" || item.id.length === 0) continue;
      rank += 1; // 1-based: o primeiro item tem rank 1
      const contribution = weight / (RRF_K + rank);
      const existing = byId.get(item.id);
      if (existing) {
        existing.fusion += contribution;
        // Mantém o maior score vetorial visto (keyword traz score undefined/0).
        const incoming = typeof item.score === "number" ? item.score : undefined;
        if (incoming !== undefined && (existing.cand.score === undefined || incoming > existing.cand.score)) {
          existing.cand = { ...existing.cand, score: incoming };
        }
        // Preenche name/attributes se o primeiro registro veio mais pobre.
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
            score: typeof item.score === "number" ? item.score : undefined,
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
  // Ordena por fusionScore desc, desempate estável por id (determinismo).
  fused.sort((a, b) => (b.fusionScore - a.fusionScore) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return fused;
}

/** Campos de `attributes` que costumam conter texto pesquisável (por kind). */
const SEARCHABLE_ATTR_KEYS = [
  "name",
  "nome",
  "razao_social",
  "razaoSocial",
  "nome_fantasia",
  "nomeFantasia",
  "titulo",
  "title",
  "descricao",
  "description",
  "objeto",
  "municipio",
  "city",
  "uf",
  "orgao",
  "agency",
  "cnpj",
  "marca",
  "partido",
];

/** Concatena name + campos textuais conhecidos de attributes (para o overlap). */
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

/**
 * Pesos do reranker heurístico (transparentes e auditáveis).
 *
 * Sinais (todos normalizados para [0,1] antes de multiplicar pelo peso):
 *  - exactName:   o nome é EXATAMENTE a query (ignorando caixa/acento).
 *  - nameStarts:  o nome começa com a query.
 *  - phraseInName: a query aparece como substring contígua no nome.
 *  - termOverlap: fração dos termos da query presentes no texto do candidato.
 *  - vector:      o score de similaridade vetorial [0,1].
 *  - fusion:      o score RRF normalizado pelo topo da lista (mantém o sinal de
 *                 concordância entre as duas fontes).
 */
const RERANK_WEIGHTS = {
  exactName: 1.0,
  nameStarts: 0.5,
  phraseInName: 0.45,
  termOverlap: 0.6,
  vector: 0.7,
  fusion: 0.5,
} as const;

/**
 * Reranker heurístico determinístico. Um cross-encoder seria caro/indisponível no
 * runtime Deno; aqui combinamos sinais léxicos transparentes (match exato,
 * prefixo, substring, sobreposição de termos), o score vetorial e o sinal de
 * fusão. Não usa rede, não usa relógio: mesma entrada ⇒ mesma saída.
 *
 * Retorna a lista reordenada por `rerankScore` desc (desempate por fusionScore,
 * depois por id), preservando todos os campos do candidato.
 */
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
      for (const term of qTerms) {
        // \b...\b para casar termo inteiro; fallback includes p/ termos curtos.
        if (textNorm.includes(term)) hits += 1;
      }
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

/**
 * Pipeline completo: funde (RRF) + reranqueia + corta no topo.
 * `limit` é aplicado SÓ no fim, depois do reranking, para não descartar cedo um
 * item que o reranker promoveria.
 */
export function hybridRank(lists: RankedList[], query: string, limit: number): FusedCandidate[] {
  const fused = reciprocalRankFusion(lists);
  const reranked = rerankCandidates(query, fused);
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : reranked.length;
  return reranked.slice(0, n);
}

/** Fonte citável extraída de uma entidade (para o contexto do chat). */
export interface EntitySource {
  name: string;
  kind: string;
  /** URL oficial, se houver em attributes (sourceUrl/url/link/fonte). */
  sourceUrl?: string | undefined;
  /** Data de coleta/atualização, se houver. */
  date?: string | undefined;
}

/** Chaves de attributes que costumam carregar a URL oficial da fonte. */
const SOURCE_URL_KEYS = ["sourceUrl", "source_url", "url", "link", "fonte", "fonteUrl", "permalink"];
const SOURCE_DATE_KEYS = ["collectedAt", "collected_at", "updatedAt", "updated_at", "data", "date", "dataColeta"];

function firstStringField(attrs: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = attrs[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

/**
 * Extrai a fonte citável de um candidato (nome + URL/data quando presentes em
 * attributes). Puro e defensivo: nunca lança, devolve ao menos name+kind.
 */
export function extractEntitySource(cand: RetrievalCandidate): EntitySource {
  const attrs = cand.attributes ?? {};
  const out: EntitySource = { name: cand.name ?? "(sem nome)", kind: cand.kind ?? "" };
  const url = firstStringField(attrs, SOURCE_URL_KEYS);
  if (url) out.sourceUrl = url;
  const date = firstStringField(attrs, SOURCE_DATE_KEYS);
  if (date) out.date = date;
  return out;
}

/**
 * Monta um bloco de contexto textual CITÁVEL a partir dos candidatos, para
 * injetar no prompt do chat. Cada linha numerada traz nome, kind, e (quando há)
 * a URL oficial e a data — material que a IA é instruída a CITAR. Trunca por
 * número de itens e por tamanho para proteger custo/janela.
 *
 * Retorna "" quando não há candidatos (o caller deve então NÃO injetar contexto
 * e o prompt instrui a responder "evidência insuficiente").
 */
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
