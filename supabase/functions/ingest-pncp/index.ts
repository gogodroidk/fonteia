// Supabase Edge Function: "ingest-pncp"
// Ingestão de LICITAÇÕES/CONTRATAÇÕES do PNCP — Portal Nacional de Contratações Públicas.
//
// Fonte: API pública de CONSULTA do PNCP (sem auth, sem chave):
//   GET https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao
//       ?dataInicial=AAAAMMDD&dataFinal=AAAAMMDD
//       &codigoModalidadeContratacao={1..14}&pagina={n}&tamanhoPagina=50
//
// LIMITE CONFIRMADO AO VIVO (2026-07-07): a API rejeita com 422 "Período inicial
// e final maior que 365 dias" quando (dataFinal - dataInicial) > 365. Uma janela
// de exatos 365 dias funciona. Por isso todo backfill de período longo é fatiado
// em CHUNKS <= CHUNK_DAYS (default 180 = semestre, bem dentro do limite) e cada
// chunk é uma chamada HTTP independente — múltiplas modalidades x múltiplos
// chunks x múltiplas páginas.
//
// VOLUME REAL (amostrado ao vivo, ano civil de 2025, uma única modalidade):
//   modalidade 8  (Dispensa)             ~718.000 contratações / ano
//   modalidade 9  (Inexigibilidade)      ~261.000 contratações / ano
//   modalidade 6  (Pregão Eletrônico)    ~397.000 contratações / ano
// Ou seja: incluir 8 e 9 no default multiplica em ordens de grandeza o volume
// coletado. Ver README/relatório de entrega para estimativa de custo/tempo de
// um backfill de 3 anos antes de disparar.
//
// Fluxo: para cada modalidade, para cada chunk de datas dentro da janela pedida,
// varre todas as páginas -> normaliza cada contratação -> chama a RPC
// public.ingest_pncp em lotes. Espelha 1:1 a ingest-receita-catalog.
//
// Idempotente: id da licitação = numeroControlePNCP (único e perene no PNCP),
// então rodar de novo na mesma janela (ou um chunk sobreposto) não duplica (a
// RPC faz upsert por id); há também dedup em memória por execução.
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente
// pelo Supabase nas Edge Functions — não precisa configurar nada.
//
// Parâmetros de query (todos opcionais):
//   ?dias=N              -> janela = [hoje - N, hoje]  (default 3; modo incremental/cron)
//   ?dataInicial=...      -> AAAAMMDD (sobrepõe ?dias) — início do BACKFILL
//   ?dataFinal=...        -> AAAAMMDD (default hoje)
//   ?modalidades=6,8      -> CSV de códigos (default 2,3,4,5,6,7,8,9)
//   ?uf=SP                -> filtra por UF
//   ?maxPaginas=N         -> teto de páginas por (modalidade,chunk) (0 = todas; default 0)
//   ?chunkDias=N           -> tamanho do fatiamento de datas (default 180; teto 365)
//   ?maxChunks=N           -> teto de chunks processados NESTA chamada (default 0 = todos
//                             os chunks da janela; use para fatiar o backfill em várias
//                             invocações e nunca estourar o timeout de ~150s da Edge Function)
//   ?cursor=AAAAMMDD       -> retoma o backfill a partir desta dataFinal de chunk (ver
//                             `next_cursor` na resposta quando `maxChunks` corta a execução)
//
// Backfill de ~2021-01-01 até hoje, por exemplo:
//   POST /ingest-pncp?dataInicial=20210101&dataFinal=20260107&modalidades=2,3,4,5,6,7,8,9
//        &chunkDias=180&maxChunks=1
// e repetir a chamada usando o `next_cursor` devolvido até a resposta trazer
// `next_cursor: null` (backfill completo). Rodar maxChunks alto processa mais
// chunks numa única invocação, mas arrisca timeout se o volume for grande —
// prefira maxChunks pequeno (1-2) para modalidades de alto volume (8, 9, 6).
//
// Deploy: Edge Functions -> Create function "ingest-pncp" -> cole este arquivo.
// (Verify JWT pode ficar LIGADO; o cron manda Authorization, igual às outras.)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";

const BASE = "https://pncp.gov.br/api/consulta";
const PORTAL = "https://pncp.gov.br";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "pncp-contratacoes";

const MAX_PAGE_SIZE = 50;
// Pausa educada entre chamadas (ms).
const RATE_MS = 600; // PNCP dispara 429 sob 350ms em backfill; 600ms é o rate seguro observado ao vivo
// Itens por chamada de RPC (evita payload gigante).
const RPC_BATCH = 200;
// Default: licitações com disputa (concorrências, pregões, concurso, diálogo)
// + as duas maiores fontes de volume de contratação direta (Dispensa e
// Inexigibilidade — Lei 14.133/2021 arts. 74/75), que respondem pela imensa
// maioria das contratações públicas do país e estavam de fora do default.
const DEFAULT_MODALIDADES = [2, 3, 4, 5, 6, 7, 8, 9];
// Limite confirmado ao vivo na API: janela (dataFinal - dataInicial) > 365 dias
// devolve 422. Nunca gerar um chunk maior que isto.
const MAX_WINDOW_DAYS = 365;
// Tamanho de fatia default para o backfill (bem abaixo do teto, deixa margem
// e mantém cada chunk com paginação previsível).
const DEFAULT_CHUNK_DAYS = 180;

const MODALIDADES: Record<number, string> = {
  1: "Leilão - Eletrônico",
  2: "Diálogo Competitivo",
  3: "Concurso",
  4: "Concorrência - Eletrônica",
  5: "Concorrência - Presencial",
  6: "Pregão - Eletrônico",
  7: "Pregão - Presencial",
  8: "Dispensa de Licitação",
  9: "Inexigibilidade",
  10: "Manifestação de Interesse",
  11: "Pré-qualificação",
  12: "Credenciamento",
  13: "Leilão - Presencial",
  14: "Inaplicabilidade da Licitação",
};

interface RawOrgao {
  cnpj?: string;
  razaoSocial?: string;
  poderId?: string;
  esferaId?: string;
}
interface RawUnidade {
  ufNome?: string;
  ufSigla?: string;
  municipioNome?: string;
  codigoIbge?: string;
  codigoUnidade?: string;
  nomeUnidade?: string;
}
interface RawContratacao {
  numeroControlePNCP: string;
  numeroCompra?: string;
  anoCompra?: number;
  processo?: string;
  objetoCompra?: string;
  modalidadeId?: number;
  modalidadeNome?: string;
  modoDisputaNome?: string;
  situacaoCompraId?: number;
  situacaoCompraNome?: string;
  tipoInstrumentoConvocatorioNome?: string;
  valorTotalEstimado?: number | null;
  valorTotalHomologado?: number | null;
  srp?: boolean;
  dataPublicacaoPncp?: string;
  dataAberturaProposta?: string | null;
  dataEncerramentoProposta?: string | null;
  orgaoEntidade?: RawOrgao;
  unidadeOrgao?: RawUnidade;
  amparoLegal?: { nome?: string };
  linkSistemaOrigem?: string | null;
}
interface PncpPage {
  data?: RawContratacao[];
  totalRegistros?: number;
  totalPaginas?: number;
  numeroPagina?: number;
  paginasRestantes?: number;
  empty?: boolean;
}

function parseDate(value: string | null | undefined): string {
  if (!value) return "";
  const t = value.trim();
  if (t === "") return "";
  if (/[zZ]$/.test(t) || /[+-]\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) return `${t}-03:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T00:00:00-03:00`;
  return t;
}

function toCents(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function parseNumeroControle(num: string): { cnpj: string; sequencial: string; ano: string } | null {
  // [0-9A-Z]{14} — suporte a CNPJ alfanumérico (IN RFB 2.229/2026, vigência 01/07/2026)
  const m = /^([0-9A-Z]{14})-\d+-(\d+)\/(\d{4})$/.exec(num.trim().toUpperCase());
  if (!m) return null;
  const cnpj = m[1], seq = m[2], ano = m[3];
  if (!cnpj || !seq || !ano) return null;
  return { cnpj, sequencial: String(Number(seq)), ano };
}

function portalUrl(num: string): string {
  const p = parseNumeroControle(num);
  if (p) return `${PORTAL}/app/editais/${p.cnpj}/${p.ano}/${p.sequencial}`;
  return `${PORTAL}/app/editais?q=${encodeURIComponent(num)}`;
}

function ymd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** Parseia "AAAAMMDD" -> Date (meia-noite UTC). Lança se o formato for inválido. */
function parseYmd(value: string): Date {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim());
  if (!m) throw new Error(`Data inválida (esperado AAAAMMDD): "${value}"`);
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (Number.isNaN(date.getTime())) throw new Error(`Data inválida: "${value}"`);
  return date;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

interface DateChunk {
  dataInicial: string;
  dataFinal: string;
}

/**
 * Fatia [dataInicial, dataFinal] (ambas AAAAMMDD, inclusive) em chunks de no
 * máximo `chunkDays` dias, respeitando o teto de 365 dias da API do PNCP.
 * Chunks são contíguos e não sobrepostos, em ordem cronológica ascendente.
 */
function buildDateChunks(dataInicial: string, dataFinal: string, chunkDays: number): DateChunk[] {
  const start = parseYmd(dataInicial);
  const end = parseYmd(dataFinal);
  const safeChunkDays = Math.max(1, Math.min(chunkDays, MAX_WINDOW_DAYS));
  if (end.getTime() < start.getTime()) return [];

  const chunks: DateChunk[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const chunkEnd = addDays(cursor, safeChunkDays - 1);
    const clampedEnd = chunkEnd.getTime() > end.getTime() ? end : chunkEnd;
    chunks.push({ dataInicial: ymd(cursor), dataFinal: ymd(clampedEnd) });
    cursor = addDays(clampedEnd, 1);
  }
  return chunks;
}

function normalize(raw: RawContratacao, collectedAt: string): Record<string, unknown> {
  const orgao = raw.orgaoEntidade ?? {};
  const unidade = raw.unidadeOrgao ?? {};
  const modalidade =
    raw.modalidadeNome ??
    (raw.modalidadeId !== undefined ? MODALIDADES[raw.modalidadeId] ?? `Modalidade ${raw.modalidadeId}` : "Não informado");
  const sourceUrl =
    raw.linkSistemaOrigem && raw.linkSistemaOrigem.trim() !== ""
      ? raw.linkSistemaOrigem.trim()
      : portalUrl(raw.numeroControlePNCP);

  const out: Record<string, unknown> = {
    id: raw.numeroControlePNCP,
    sourceId: SOURCE_ID,
    numeroControlePNCP: raw.numeroControlePNCP,
    objeto: (raw.objetoCompra ?? "").trim(),
    orgao: (orgao.razaoSocial ?? unidade.nomeUnidade ?? "Órgão não informado").trim(),
    modalidade,
    valorEstimadoCents: toCents(raw.valorTotalEstimado),
    dataPublicacao: parseDate(raw.dataPublicacaoPncp),
    dataAbertura: parseDate(raw.dataAberturaProposta),
    dataEncerramento: parseDate(raw.dataEncerramentoProposta),
    sourceUrl,
    collectedAt,
    raw,
  };
  if (raw.numeroCompra) out.numeroCompra = raw.numeroCompra;
  if (raw.anoCompra !== undefined) out.anoCompra = raw.anoCompra;
  if (raw.processo) out.processo = raw.processo;
  if (orgao.cnpj) out.orgaoCnpj = orgao.cnpj;
  if (unidade.nomeUnidade) out.unidade = unidade.nomeUnidade.trim();
  if (unidade.ufSigla) out.uf = unidade.ufSigla;
  if (unidade.ufNome) out.ufNome = unidade.ufNome;
  if (unidade.municipioNome) out.municipio = unidade.municipioNome;
  if (unidade.codigoIbge) out.codigoIbge = unidade.codigoIbge;
  if (orgao.esferaId) out.esfera = orgao.esferaId;
  if (orgao.poderId) out.poder = orgao.poderId;
  if (raw.modalidadeId !== undefined) out.modalidadeId = raw.modalidadeId;
  if (raw.modoDisputaNome) out.modoDisputa = raw.modoDisputaNome;
  if (raw.situacaoCompraId !== undefined) out.situacaoId = raw.situacaoCompraId;
  if (raw.situacaoCompraNome) out.situacao = raw.situacaoCompraNome;
  if (raw.tipoInstrumentoConvocatorioNome) out.instrumento = raw.tipoInstrumentoConvocatorioNome;
  if (raw.valorTotalHomologado !== undefined && raw.valorTotalHomologado !== null) {
    out.valorHomologadoCents = toCents(raw.valorTotalHomologado);
  }
  if (raw.srp !== undefined) out.srp = raw.srp;
  if (raw.amparoLegal?.nome) out.amparoLegal = raw.amparoLegal.nome;
  return out;
}

function buildUrl(
  dataInicial: string,
  dataFinal: string,
  modalidade: number,
  pagina: number,
  uf: string | null,
): string {
  const search = new URLSearchParams({
    dataInicial,
    dataFinal,
    codigoModalidadeContratacao: String(modalidade),
    pagina: String(pagina),
    tamanhoPagina: String(MAX_PAGE_SIZE),
  });
  if (uf) search.set("uf", uf);
  return `${BASE}/v1/contratacoes/publicacao?${search.toString()}`;
}

async function getJson(url: string): Promise<PncpPage> {
  const res = await fetchWithRetry(url, {
    timeoutMs: 15000,
    retries: 4,
    backoffMs: 800, // backoff 0.8→6.4s: absorve 429 ocasional sem estourar o time-budget do chunk
    init: { headers: HEADERS },
  });
  if (res.status === 204) return { data: [], totalPaginas: 0, empty: true };
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return (await res.json()) as PncpPage;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // Defense-in-depth: se INGEST_CRON_SECRET estiver definido, exige Bearer correspondente.
  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (cronSecret) {
    if (!hasValidBearerSecret(req, cronSecret)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 }, req);
    }
  } else {
    console.warn("[ingest-pncp] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const url = new URL(req.url);

  // Janela de datas. Modo default (sem dataInicial explícito) = incremental do
  // cron: [hoje - dias, hoje]. Passar dataInicial ativa o modo BACKFILL, que
  // fatia a janela inteira em chunks <= chunkDias (teto MAX_WINDOW_DAYS).
  const dias = Number(url.searchParams.get("dias") ?? "3");
  const now = new Date();
  const dataFinal = url.searchParams.get("dataFinal") ?? ymd(now);
  const dataInicialParam = url.searchParams.get("dataInicial");
  const dataInicial =
    dataInicialParam ?? ymd(new Date(now.getTime() - Math.max(0, dias) * 86_400_000));

  // Modalidades.
  const modParam = url.searchParams.get("modalidades");
  const modalidades = modParam
    ? modParam
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 14)
    : DEFAULT_MODALIDADES;

  const uf = url.searchParams.get("uf");
  const maxPaginas = Number(url.searchParams.get("maxPaginas") ?? "0"); // 0 = todas
  const chunkDiasParam = Number(url.searchParams.get("chunkDias") ?? String(DEFAULT_CHUNK_DAYS));
  const chunkDias = Number.isFinite(chunkDiasParam) && chunkDiasParam > 0 ? chunkDiasParam : DEFAULT_CHUNK_DAYS;
  const maxChunks = Number(url.searchParams.get("maxChunks") ?? "0"); // 0 = todos os chunks da janela
  const cursorParam = url.searchParams.get("cursor"); // AAAAMMDD: retoma a partir daqui
  const rateMsParam = Number(url.searchParams.get("rateMs") ?? String(RATE_MS));
  const rateMs = Number.isFinite(rateMsParam) && rateMsParam >= 0 ? rateMsParam : RATE_MS; // pausa entre páginas (calibrável p/ o rate limit do PNCP)

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Monta todos os chunks da janela pedida e, se houver cursor, pula os que
    // já foram processados em chamadas anteriores (retomada de backfill).
    let allChunks: DateChunk[];
    try {
      allChunks = buildDateChunks(dataInicial, dataFinal, chunkDias);
    } catch (e) {
      return jsonResponse({ ok: false, error: String(e) }, { status: 400 }, req);
    }
    const totalChunksJanela = allChunks.length;
    let chunks = allChunks;
    if (cursorParam) {
      const idx = chunks.findIndex((c) => c.dataInicial > cursorParam);
      chunks = idx === -1 ? [] : chunks.slice(idx);
    }
    const chunksToRun = maxChunks > 0 ? chunks.slice(0, maxChunks) : chunks;
    const remaining = chunks.length - chunksToRun.length;

    const errors: Array<{ modalidade: number; chunk: DateChunk; pagina: number; error: string }> = [];
    const seen = new Set<string>(); // dedup por numeroControlePNCP dentro da execução
    let coletadas = 0;
    let ingested = 0;
    let chunksProcessados = 0;
    let chunkIncompleto: DateChunk | null = null;

    for (const chunk of chunksToRun) {
      // Buffer por chunk (não acumula a janela inteira em memória — importante
      // em backfills de milhões de registros).
      const chunkItems: Array<Record<string, unknown>> = [];
      const errorsBefore = errors.length;

      for (const modalidade of modalidades) {
        let pagina = 1;
        let totalPaginas = 1;
        do {
          const target = buildUrl(chunk.dataInicial, chunk.dataFinal, modalidade, pagina, uf);
          try {
            const page = await getJson(target);
            totalPaginas = page.totalPaginas ?? 0;
            for (const raw of page.data ?? []) {
              if (!raw?.numeroControlePNCP || seen.has(raw.numeroControlePNCP)) continue;
              seen.add(raw.numeroControlePNCP);
              chunkItems.push(normalize(raw, collectedAt));
            }
            console.log(
              `[ingest-pncp] modalidade=${modalidade} chunk=${chunk.dataInicial}-${chunk.dataFinal} ` +
                `pagina=${pagina}/${totalPaginas} total=${page.totalRegistros ?? "?"}`,
            );
            if ((page.data ?? []).length === 0) break;
          } catch (e) {
            errors.push({ modalidade, chunk, pagina, error: String(e) });
            break; // não insiste numa modalidade/chunk que falhou
          }
          pagina += 1;
          if (maxPaginas > 0 && pagina > maxPaginas) break;
          if (pagina <= totalPaginas && rateMs > 0) await sleep(rateMs);
        } while (pagina <= totalPaginas);
        if (rateMs > 0) await sleep(rateMs);
      }

      // Grava o chunk em lotes via a RPC antes de seguir para o próximo chunk
      // — progresso é persistido incrementalmente, nunca perdido se a próxima
      // fatia falhar ou o tempo acabar.
      for (let i = 0; i < chunkItems.length; i += RPC_BATCH) {
        const batch = chunkItems.slice(i, i + RPC_BATCH);
        const { data, error } = await supabase.rpc("ingest_pncp", {
          p_payload: { collectedAt, items: batch },
        });
        if (error) throw error;
        ingested += typeof data === "number" ? data : batch.length;
      }
      coletadas += chunkItems.length;
      chunksProcessados += 1;
      console.log(
        `[ingest-pncp] chunk concluído ${chunk.dataInicial}-${chunk.dataFinal}: ` +
          `${chunkItems.length} itens coletados (acumulado: ${coletadas} coletadas, ${ingested} ingeridas)`,
      );

      // Se ALGUMA página deste chunk falhou (ex.: 429 que não recuperou nos
      // retries), o chunk está incompleto. Paramos aqui e NÃO deixamos o cursor
      // passar dele — a próxima invocação o reprocessa do início (o upsert por
      // numeroControlePNCP é idempotente). Evita perda silenciosa de dados nos
      // períodos de maior volume, que é justamente onde o 429 aparece.
      if (errors.length > errorsBefore) {
        chunkIncompleto = chunk;
        break;
      }
    }

    let nextCursor: string | null;
    if (chunkIncompleto) {
      // cursor = véspera do início do chunk incompleto → o filtro `> cursor` o reinclui
      nextCursor = ymd(addDays(parseYmd(chunkIncompleto.dataInicial), -1));
    } else {
      const lastChunk = chunksToRun[chunksToRun.length - 1];
      nextCursor = remaining > 0 && lastChunk ? lastChunk.dataFinal : null;
    }

    return jsonResponse({
      ok: true,
      janela: { dataInicial, dataFinal },
      modalidades,
      uf: uf ?? null,
      chunkDias,
      chunks_total_janela: totalChunksJanela, // total de chunks na janela inteira (dataInicial..dataFinal)
      chunks_pendentes_antes: chunks.length, // pendentes ao iniciar esta chamada (pós-cursor)
      chunks_processados: chunksProcessados,
      chunks_restantes: remaining, // ainda faltam após esta chamada (use next_cursor p/ continuar)
      processed: coletadas,
      total: null, // desconhecido a priori (depende de totalRegistros por modalidade/chunk)
      coletadas,
      ingested,
      errors,
      next_cursor: nextCursor,
    }, {}, req);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, { status: 500 }, req);
  }
});
