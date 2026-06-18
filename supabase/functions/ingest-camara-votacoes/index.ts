// Supabase Edge Function: "ingest-camara-votacoes"
// Ingestão de VOTAÇÕES da Câmara dos Deputados — Dados Abertos.
//
// Fonte: API pública de Dados Abertos da Câmara (sem auth, sem chave):
//   GET https://dadosabertos.camara.leg.br/api/v2/votacoes
//       ?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
//       &ordem=ASC&ordenarPor=dataHoraRegistro&pagina=N&itens=N
//   GET https://dadosabertos.camara.leg.br/api/v2/votacoes/{id}/votos
//       (votos individuais de cada deputado numa votação — somente se incluirVotos=true)
//
// Fluxo:
//   1. Busca lista de votações no intervalo via paginação HATEOAS rel="next".
//   2. Normaliza cada votação: id, siglaOrgao, aprovacao, placarSim/Nao/Abstencoes,
//      proposicaoObjeto, etc. votos: [] por padrão.
//   3. Se incluirVotos=true: para cada votação chama /votacoes/{id}/votos e normaliza
//      cada voto (deputadoId, tipoVoto, etc.). Pausa RATE_MS_VOTOS entre chamadas.
//   4. Dedup de votações por id dentro da execução.
//   5. Grava em lotes via RPC public.ingest_camara_votacoes.
//   6. Degradação elegante: erro numa página ou votação -> errors[], continua.
//
// Idempotente: id = id da votação na Câmara (perene). A RPC faz upsert por
//   (external_ids->>'votacaoId') where kind='votacao'.
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente
//   pelo Supabase nas Edge Functions — não precisa configurar nada.
// Opcional: INGEST_CRON_SECRET — se definido, exige Bearer correspondente.
//
// Parâmetros de query (todos opcionais):
//   ?dataInicio=YYYY-MM-DD  -> início do intervalo (default: 30 dias atrás)
//   ?dataFim=YYYY-MM-DD     -> fim do intervalo (default: hoje)
//   ?maxPaginas=N           -> teto de páginas de votações (0 = todas; default 5)
//   ?incluirVotos=true      -> busca votos individuais de cada votação (default false)
//   ?maxVotacoes=N          -> teto de votações a processar (0 = ilimitado; default 0)
//
// Deploy: Edge Functions -> "ingest-camara-votacoes". Verify JWT pode ficar LIGADO
//   (o cron/admin manda Authorization, igual às outras).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { parseDateBrt } from "../_shared/br.ts";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "camara-dados-abertos";

// Itens por chamada de RPC (evita payload gigante).
const RPC_BATCH = 100;
// Pausa educada entre páginas de votações (ms).
const RATE_MS = 300;
// Pausa entre chamadas de votos individuais (mais custoso).
const RATE_MS_VOTOS = 400;

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface CamaraLink {
  rel: string;
  href: string;
}

interface RawProposicao {
  id?: number;
  uri?: string;
  siglaTipo?: string;
  numero?: number;
  ano?: number;
  ementa?: string;
}

interface RawVotacao {
  id?: string;
  uri?: string;
  data?: string;
  dataHoraRegistro?: string;
  dataHoraUltimaAberturaVotacao?: string;
  descricao?: string;
  siglaOrgao?: string;
  idOrgao?: number;
  uriOrgao?: string;
  idEvento?: number;
  uriEvento?: string;
  aprovacao?: number | boolean | null;
  placarSim?: number;
  placarNao?: number;
  placarAbstencoes?: number;
  tipoVotacao?: string;
  urlRegistro?: string;
  proposicaoObjeto?: RawProposicao | null;
}

interface VotacoesPage {
  dados?: RawVotacao[];
  links?: CamaraLink[];
}

interface RawDeputadoVoto {
  id?: number;
  nome?: string;
  siglaPartido?: string;
  siglaUf?: string;
  idLegislatura?: number;
  urlFoto?: string;
  email?: string;
}

interface RawVoto {
  deputado_?: RawDeputadoVoto;
  tipoVoto?: string;
  dataRegistroVoto?: string;
}

interface VotosPage {
  dados?: RawVoto[];
  links?: CamaraLink[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ymd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nextLink(links: CamaraLink[] | undefined): string | null {
  const next = (links ?? []).find((l) => l.rel === "next");
  return next?.href ?? null;
}

function buildVotacoesUrl(dataInicio: string, dataFim: string, pagina: number): string {
  const search = new URLSearchParams({
    dataInicio,
    dataFim,
    ordem: "ASC",
    ordenarPor: "dataHoraRegistro",
    pagina: String(pagina),
    itens: "100",
  });
  return `${BASE}/votacoes?${search.toString()}`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url, {
    timeoutMs: 15000,
    retries: 3,
    backoffMs: 800,
    init: { headers: HEADERS },
  });
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return (await res.json()) as T;
}

function normalizeProposicao(
  raw: RawProposicao | null | undefined,
): Record<string, unknown> | null {
  if (!raw || raw.id == null) return null;
  return {
    id: raw.id,
    siglaTipo: (raw.siglaTipo ?? "").trim(),
    numero: raw.numero ?? null,
    ano: raw.ano ?? null,
    ementa: (raw.ementa ?? "").trim(),
  };
}

function normalizeVotacao(raw: RawVotacao): Record<string, unknown> {
  const votacaoId = String(raw.id ?? "");

  // aprovacao pode vir como 0/1 (int) ou null
  let aprovacao: boolean | null = null;
  if (raw.aprovacao === 1 || raw.aprovacao === true) aprovacao = true;
  else if (raw.aprovacao === 0 || raw.aprovacao === false) aprovacao = false;

  return {
    id: votacaoId,
    sourceId: SOURCE_ID,
    data: parseDateBrt(raw.dataHoraRegistro ?? raw.data),
    dataHoraRegistro: parseDateBrt(raw.dataHoraRegistro),
    dataHoraUltimaAberturaVotacao: parseDateBrt(raw.dataHoraUltimaAberturaVotacao),
    descricao: (raw.descricao ?? "").trim(),
    siglaOrgao: (raw.siglaOrgao ?? "").trim(),
    idOrgao: raw.idOrgao ?? null,
    idEvento: raw.idEvento ?? null,
    aprovacao,
    placarSim: raw.placarSim ?? null,
    placarNao: raw.placarNao ?? null,
    placarAbstencoes: raw.placarAbstencoes ?? null,
    tipoVotacao: (raw.tipoVotacao ?? "").trim(),
    urlRegistro: (raw.urlRegistro ?? "").trim(),
    proposicao: normalizeProposicao(raw.proposicaoObjeto),
    votos: [] as Array<Record<string, unknown>>,
  };
}

function normalizeVoto(raw: RawVoto): Record<string, unknown> {
  const dep = raw.deputado_ ?? {};
  return {
    deputadoId: dep.id ?? null,
    deputadoNome: (dep.nome ?? "").trim(),
    partido: (dep.siglaPartido ?? "").trim(),
    uf: (dep.siglaUf ?? "").trim(),
    tipoVoto: (raw.tipoVoto ?? "").trim(),
    dataRegistroVoto: parseDateBrt(raw.dataRegistroVoto),
  };
}

async function fetchVotos(votacaoId: string): Promise<Array<Record<string, unknown>>> {
  const url = `${BASE}/votacoes/${encodeURIComponent(votacaoId)}/votos`;
  let page: VotosPage;
  try {
    page = await getJson<VotosPage>(url);
  } catch (e) {
    throw new Error(`votos de ${votacaoId}: ${String(e)}`);
  }
  return (page.dados ?? []).map(normalizeVoto);
}

// ─── Handler ───────────────────────────────────────────────────────────────────

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
    console.warn("[ingest-camara-votacoes] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const url = new URL(req.url);

  // Calcula defaults dentro do handler para evitar estado global.
  const now = new Date();
  const defaultDataInicio = ymd(new Date(now.getTime() - 30 * 86_400_000));
  const defaultDataFim = ymd(now);

  const dataInicio = url.searchParams.get("dataInicio") ?? defaultDataInicio;
  const dataFim = url.searchParams.get("dataFim") ?? defaultDataFim;
  const maxPaginas = Number(url.searchParams.get("maxPaginas") ?? "5"); // 0 = todas
  const incluirVotos = url.searchParams.get("incluirVotos") === "true";
  const maxVotacoes = Number(url.searchParams.get("maxVotacoes") ?? "0"); // 0 = ilimitado

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const items: Array<Record<string, unknown>> = [];
    const errors: Array<{ contexto: string; error: string }> = [];
    const seen = new Set<string>(); // dedup por votacaoId dentro da execução

    // ── 1. Busca lista de votações via paginação HATEOAS ──────────────────────
    let pagina = 1;
    let hasMore = true;
    while (hasMore) {
      const target = buildVotacoesUrl(dataInicio, dataFim, pagina);
      try {
        const page = await getJson<VotacoesPage>(target);
        const dados = page.dados ?? [];

        for (const raw of dados) {
          if (!raw?.id) continue;
          const votacaoId = String(raw.id);
          if (seen.has(votacaoId)) continue;
          seen.add(votacaoId);
          items.push(normalizeVotacao(raw));

          if (maxVotacoes > 0 && items.length >= maxVotacoes) break;
        }

        // Segue rel="next" se disponível, senão para.
        const next = nextLink(page.links);
        if (!next || dados.length === 0) {
          hasMore = false;
        } else {
          // Verificamos via next link mas controlamos a paginação pelo counter.
          hasMore = true;
        }

        if (maxVotacoes > 0 && items.length >= maxVotacoes) break;
      } catch (e) {
        errors.push({ contexto: `votacoes pagina ${pagina}`, error: String(e) });
        break; // degradação elegante: para de paginar se a página falhou
      }

      if (maxPaginas > 0 && pagina >= maxPaginas) break;
      pagina += 1;
      if (hasMore && RATE_MS > 0) await sleep(RATE_MS);
    }

    // ── 2. Busca votos individuais (opcional, caro em chamadas) ───────────────
    if (incluirVotos) {
      for (const item of items) {
        const votacaoId = String(item.id);
        try {
          const votos = await fetchVotos(votacaoId);
          item.votos = votos;
        } catch (e) {
          errors.push({ contexto: `votos votacao ${votacaoId}`, error: String(e) });
          // continua com votos: [] para esta votação
        }
        if (RATE_MS_VOTOS > 0) await sleep(RATE_MS_VOTOS);
      }
    }

    // ── 3. Grava em lotes via a RPC ───────────────────────────────────────────
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_camara_votacoes", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    return jsonResponse({
      ok: true,
      janela: { dataInicio, dataFim },
      paginas: pagina,
      coletadas: items.length,
      incluirVotos,
      ingested,
      errors,
    }, {}, req);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, { status: 500 }, req);
  }
});
