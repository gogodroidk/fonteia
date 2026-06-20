/**
 * company-search.ts — Busca de empresa por NOME → CNPJ (reutilizável)
 *
 * "Buscar por nome antes do CNPJ" em TODA tela paga (Consultas, Raio-X, Dossiê,
 * Empresas). O usuário quase nunca tem o CNPJ na cabeça — tem o NOME. Esta camada
 * resolve nome → CNPJ varrendo o BULK (D1, via `fetchD1Entities`) por
 * `normalized_name` (param `q` do d1-bridge) nos kinds que carregam CNPJ, e
 * COLAPSA matriz + filiais pela RAIZ de 8 dígitos do CNPJ — assim "Banco do Brasil"
 * aparece UMA vez (a matriz/estabelecimento mais frequente), não uma por filial.
 *
 * Por que NÃO importar de `cerebro-api.ts`: o Cérebro tem o mesmo PADRÃO de busca
 * (searchEntities), mas está sob trabalho concorrente (#94) — duplicar a fatia
 * mínima aqui evita colisão de merge e mantém esta camada com foco único (achar a
 * empresa e seu CNPJ), sem o peso do grafo. A lógica de raiz/dedupe é a mesma.
 *
 * Enriquecimento LAZY (TODO do #96): `requestCompanyEnrichment(cnpj)` dispara o
 * coletor `ingest-brasilapi?cnpjs=<cnpj>` sob demanda quando o CNPJ aberto ainda
 * não tem `company`/QSA no D1. Falha SEMPRE em silêncio (nunca quebra a tela) — é
 * um "esquenta-cache" best-effort; a tela segue com o que já existir no D1.
 *
 * Nada é fabricado: sem correspondência, a lista volta vazia. Rastreabilidade
 * preservada — o CNPJ escolhido é real e aponta para as fontes oficiais a jusante.
 */

import {
  fetchD1Entities,
  type D1EntityRow,
} from "../../lib/d1-client";
import {
  getConfiguredApiUrl,
  getSupabasePublicConfig,
  trimTrailingSlash,
} from "../../lib/api-client";
import { sanitizeCnpj, formatCnpj } from "../../lib/cnpj";

export { sanitizeCnpj, formatCnpj };

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Uma empresa encontrada por nome — pronta para virar o CNPJ consultado. */
export interface CompanyHit {
  /** Razão social (ou nome fantasia) limpa para exibição. */
  name: string;
  /** CNPJ em 14 dígitos (sem máscara) — o identificador para abrir a empresa. */
  cnpj: string;
  /** CNPJ formatado (00.000.000/0001-91) para exibir. */
  cnpjFormatado: string;
  /** Subtítulo curto para desambiguar (UF, situação, nº de estabelecimentos…). */
  sublabel?: string | undefined;
  /** true quando o representante escolhido é a matriz (estabelecimento 0001). */
  isMatriz: boolean;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/**
 * Kinds varridos para achar uma EMPRESA por nome. Todos carregam um CNPJ por
 * linha (na coluna `cnpj` e/ou em attributes):
 *   • company           — cadastro BrasilAPI (a fonte mais limpa de razão social);
 *   • organization      — órgãos públicos (PNCP) — entram porque o usuário pode
 *                         buscar um órgão pelo nome;
 *   • public_contract   — fornecedores (o kind com mais CNPJs distintos);
 *   • bidding_opportunity — órgãos licitantes.
 * `legal_process` fica de fora: o dataset do CNJ é anonimizado (sem CNPJ/partes).
 */
const COMPANY_KINDS = [
  "company",
  "organization",
  "public_contract",
  "bidding_opportunity",
] as const;

/** Página pedida por kind. Maior para contratos (muitos CNPJs por nome). */
const PAGE_BY_KIND: Record<(typeof COMPANY_KINDS)[number], number> = {
  company: 40,
  organization: 40,
  public_contract: 80,
  bidding_opportunity: 60,
};

/** Teto de resultados devolvidos ao chamador (após dedupe por raiz). */
const MAX_HITS = 25;

/** Comprimento mínimo do termo para disparar a busca (evita varrer com "a"). */
const MIN_TERM_LEN = 2;

// ─── Helpers de extração (locais — espelham os de cerebro-api, sem importar) ──

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function attrs(row: D1EntityRow): Record<string, unknown> {
  return (row.attributes as Record<string, unknown> | undefined) ?? {};
}

function attr(row: D1EntityRow, key: string): unknown {
  return attrs(row)[key];
}

/** Normaliza texto p/ comparação (minúsculas, sem acento). */
function norm(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Sanitiza um CNPJ E rejeita placeholders todos-iguais (00000000000000 etc.),
 * comuns em bases municipais. Devolve "" nesses casos.
 */
function validCnpj(value: unknown): string {
  const cnpj = sanitizeCnpj(str(value));
  if (cnpj === "") return "";
  if (/^(.)\1{13}$/.test(cnpj)) return "";
  return cnpj;
}

/**
 * Limpa um rótulo cru de empresa (de contratos/despesas) para exibição.
 * Remove prefixos de contrato ("CONTRATADA: …") e o lado-categoria de despesas
 * CEAP ("CATEGORIA — FORNECEDOR" → fornecedor). Conservador: devolve o original
 * aparado se não conseguir limpar.
 */
function cleanCompanyName(raw: string): string {
  let s = raw.trim();
  if (s === "") return s;
  const emDash = s.lastIndexOf(" — ");
  if (emDash !== -1) {
    const after = s.slice(emDash + 3).trim();
    if (after !== "") s = after;
  }
  s = s.replace(
    /^(contratad[ao]|contratante|contrato|fornecedor|empresa|benefici[áa]ri[ao]|raz[ãa]o social)\s*[:\-–]\s*/i,
    "",
  );
  s = s.replace(/\s+/g, " ").replace(/^[\s.,;:–-]+|[\s.,;:–-]+$/g, "").trim();
  return s === "" ? raw.trim() : s;
}

// ─── Busca pública: nome → empresas (CNPJ) ────────────────────────────────────

/**
 * Procura empresas por NOME no BULK e devolve candidatos prontos para abrir o
 * CNPJ. Colapsa matriz+filiais pela raiz de 8 dígitos (uma linha por empresa).
 * NUNCA lança: erros por kind degradam (o resto da busca segue).
 *
 * @param termo  texto digitado pelo usuário (razão social, fantasia, órgão).
 * @param fetcher injeção para testes; usa `fetch` global por padrão.
 */
export async function searchCompaniesByName(
  termo: string,
  fetcher: typeof fetch = fetch,
): Promise<CompanyHit[]> {
  const q = termo.trim();
  if (q.length < MIN_TERM_LEN) return [];
  const qn = norm(q);

  const perKind = await Promise.allSettled(
    COMPANY_KINDS.map(async (kind) => {
      const { rows } = await fetchD1Entities(
        { kind, q, limit: PAGE_BY_KIND[kind] },
        fetcher,
      );
      return rows
        .map((row) => {
          const cnpj = validCnpj(
            str(row.cnpj) ||
              str(attr(row, "fornecedorCnpj")) ||
              str(attr(row, "cnpj")),
          );
          if (cnpj === "") return null;
          const rawName =
            str(attr(row, "razaoSocial")) ||
            str(attr(row, "fornecedorNome")) ||
            str(row.name);
          const name = cleanCompanyName(rawName) || rawName;
          if (name === "" || name.length < 2) return null;
          const uf = str(attr(row, "uf")) || str(attr(row, "ufNome"));
          const situacao = str(attr(row, "situacaoCadastral"));
          return { kind, cnpj, name, uf, situacao };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    }),
  );

  // Conta a frequência por RAIZ de CNPJ (8 dígitos) para escolher o
  // estabelecimento mais relevante e mostrar "N estabelecimentos".
  const rootCount = new Map<string, number>();
  const allHits: Array<{
    kind: string;
    cnpj: string;
    name: string;
    uf: string;
    situacao: string;
  }> = [];
  for (const r of perKind) {
    if (r.status !== "fulfilled") continue;
    for (const hit of r.value) {
      allHits.push(hit);
      const root = hit.cnpj.slice(0, 8);
      rootCount.set(root, (rootCount.get(root) ?? 0) + 1);
    }
  }

  // Dedupe por RAIZ de CNPJ — um representante por empresa. Score: matriz (0001)
  // primeiro, depois raiz mais frequente, depois nome que casa com a busca, e por
  // fim a fonte mais confiável de razão social (company > organization > resto).
  const chosen = new Map<string, { hit: CompanyHit; score: number }>();
  for (const hit of allHits) {
    const root = hit.cnpj.slice(0, 8);
    const isMatriz = hit.cnpj.slice(8, 12) === "0001";
    const freq = rootCount.get(root) ?? 0;
    const nameHit = norm(hit.name).includes(qn) ? 1 : 0;
    const kindRank = hit.kind === "company" ? 2 : hit.kind === "organization" ? 1 : 0;
    const score = (isMatriz ? 1000 : 0) + freq * 4 + nameHit * 2 + kindRank;

    const prev = chosen.get(root);
    if (prev && score <= prev.score) continue;

    const sublabelBits = [
      hit.uf,
      hit.situacao,
      freq > 1 ? `${freq} estabelecimentos` : "",
    ].filter(Boolean);

    chosen.set(root, {
      score,
      hit: {
        name: hit.name,
        cnpj: hit.cnpj,
        cnpjFormatado: formatCnpj(hit.cnpj),
        isMatriz,
        sublabel: sublabelBits.length > 0 ? sublabelBits.join(" · ") : undefined,
      },
    });
  }

  const hits = [...chosen.values()].map((c) => c.hit);
  // Ordena: correspondência exata de nome primeiro, depois alfabético pt-BR.
  hits.sort((a, b) => {
    const ae = norm(a.name) === qn ? 0 : 1;
    const be = norm(b.name) === qn ? 0 : 1;
    if (ae !== be) return ae - be;
    return a.name.localeCompare(b.name, "pt-BR");
  });
  return hits.slice(0, MAX_HITS);
}

// ─── Enriquecimento LAZY do cadastro (TODO #96) ───────────────────────────────

/**
 * Monta a URL do coletor `ingest-brasilapi` derivando-a da base da função
 * `fonteia` (mesmo host/projeto Supabase). Devolve null se a base não estiver
 * configurada (modo degradado — não dispara nada).
 */
function ingestBrasilApiUrl(cnpj: string): string | null {
  const fonteiaUrl = getConfiguredApiUrl();
  if (!fonteiaUrl) return null;
  // Troca o último segmento de caminho (".../fonteia") por ".../ingest-brasilapi".
  const base = trimTrailingSlash(fonteiaUrl).replace(/\/[^/]+$/, "/ingest-brasilapi");
  return `${base}?cnpjs=${encodeURIComponent(cnpj)}`;
}

/**
 * Dispara o enriquecimento sob demanda do cadastro/QSA de um CNPJ no D1, chamando
 * o coletor `ingest-brasilapi?cnpjs=<cnpj>` (auth por header `apikey` publishable,
 * o mesmo padrão do d1-bridge). É um "esquenta-cache" best-effort:
 *
 *   • NUNCA lança e NUNCA bloqueia a tela — resolve com `true`/`false` apenas
 *     indicando se a chamada chegou a ser feita com sucesso de transporte;
 *   • o resultado NÃO precisa ser aguardado pela UI: chame e siga renderizando o
 *     que já existe no D1. Numa próxima visita ao mesmo CNPJ, o cadastro estará lá.
 *
 * @param rawCnpj CNPJ cru (com ou sem máscara).
 * @param fetcher injeção para testes.
 */
export async function requestCompanyEnrichment(
  rawCnpj: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const cnpj = sanitizeCnpj(rawCnpj);
  if (cnpj === "") return false;

  const target = ingestBrasilApiUrl(cnpj);
  if (!target) return false;

  const { key } = getSupabasePublicConfig();
  try {
    const response = await fetcher(target, {
      method: "GET",
      headers: {
        accept: "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
      },
    });
    return response.ok;
  } catch {
    // Coletor indisponível / CORS / rede — degrada em silêncio. A tela não muda.
    return false;
  }
}
