// Supabase Edge Function: "ingest-querido-diario"
// Ingestão de INDÍCIOS DE LICITAÇÃO MUNICIPAL a partir do Querido Diário — Open
// Knowledge Brasil (OKBR): acervo público de diários oficiais MUNICIPAIS em
// texto, com busca full-text. Cobre a long-tail de prefeituras que não publicam
// no PNCP.
//
// Fonte: API pública do Querido Diário (sem auth, sem chave). Host confirmado
// por fetch ao vivo (2026-07-07) — NÃO é o domínio dos docs
// (queridodiario.ok.org.br está atrás de um desafio Cloudflare e devolve HTML
// "Just a moment..." para clientes sem JS; inutilizável por um coletor de
// servidor). O host que responde JSON diretamente é:
//
//   GET https://api.queridodiario.ok.org.br/gazettes
//       ?querystring=...        (termo de busca full-text; OBRIGATÓRIO)
//       &territory_ids=...      (código IBGE; repetível; opcional)
//       &published_since=...    (AAAA-MM-DD; opcional)
//       &published_until=...    (AAAA-MM-DD; opcional)
//       &size=...               (itens por página; usamos <=50)
//       &offset=...             (paginação; 0-based)
//       &excerpt_size=...       (tamanho do trecho de texto por ocorrência)
//       &number_of_excerpts=... (trechos por diário)
//
// Resposta confirmada: { total_gazettes, gazettes: [{ territory_id, date,
// scraped_at, url, territory_name, state_code, excerpts[], edition,
// is_extra_edition, txt_url }] }.
//
// NÃO é dado estruturado de licitação — é texto de diário oficial. A estratégia
// é buscar por termos típicos de aviso de licitação e registrar cada ocorrência
// (diário × termo) como uma oportunidade candidata (kind='bidding_opportunity',
// attributes.origem='querido-diario', attributes.confianca='indicio_textual'),
// com o excerpt + a URL do diário como evidência. Ver
// packages/sources/src/connectors/querido-diario.ts para a lógica de
// normalização (replicada inline aqui pois Edge Functions Deno não importam de
// packages/ sem um passo de build).
//
// PAGINAÇÃO E RATE LIMIT: a doc recomenda ~60 req/min. Fatiar por TERMO (um
// termo por vez, avançando offset) e usar RATE_MS=1100ms entre chamadas
// (~54 req/min, com folga). Para nunca estourar o timeout de ~150s da Edge
// Function, cada invocação respeita um orçamento de tempo (TIME_BUDGET_MS) e,
// se não terminar todos os termos/municípios pedidos, devolve
// `{"ok": true, "processed": N, "total": M, "next_cursor": {...}}` — quem chama
// (cron) reinvoca passando `?cursor=<json ou o parametro individual>` para
// retomar exatamente de onde parou. Nunca trava por timeout: o corte de tempo é
// checado antes de cada nova chamada de rede.
//
// Idempotente: id de cada ocorrência = hash estável de
// (territory_id + date + edition + termo) — rodar a mesma janela de novo não
// duplica (a RPC ingest_querido_diario faz upsert por
// external_ids->>'queridoDiarioId').
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente
// pelo Supabase nas Edge Functions — não precisa configurar nada.
//
// Parâmetros de query (todos opcionais):
//   ?termos=pregão,dispensa de licitação   -> CSV de termos (default: lista embutida)
//   ?municipios=3550308,3304557            -> CSV de códigos IBGE (default: nenhum filtro = Brasil todo)
//   ?uf=SP                                  -> hoje sem suporte nativo na API (Querido Diário filtra
//                                              por territory_ids, não por UF); mantido apenas para
//                                              compor mensagens de erro/telemetria futura.
//   ?dataInicial=2026-01-01                -> published_since (AAAA-MM-DD)
//   ?dataFinal=2026-07-01                  -> published_until (AAAA-MM-DD)
//   ?tamanhoPagina=N                       -> size por chamada (máx. 50; default 50)
//   ?maxPaginasPorTermo=N                  -> teto de páginas por termo nesta invocação (0 = sem teto; default 0)
//   ?cursor={"termoIndex":0,"offset":0}    -> retomada explícita (normalmente devolvido por uma chamada anterior)
//
// Deploy: Edge Functions -> Create function "ingest-querido-diario" -> cole este
// arquivo. (Verify JWT pode ficar LIGADO; o cron manda Authorization, igual às
// outras.)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";

const BASE = "https://api.queridodiario.ok.org.br";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "querido-diario";

const MAX_PAGE_SIZE = 50;
// Pausa educada entre chamadas (ms). ~60 req/min recomendado pela doc; usamos
// 1100ms (~54 req/min) para ter folga e nunca ser o vizinho barulhento.
const RATE_MS = 1100;
// Itens por chamada de RPC (evita payload gigante).
const RPC_BATCH = 200;
// Orçamento de tempo por invocação — Edge Functions do Supabase têm limite de
// ~150s; paramos a coleta bem antes disso e devolvemos next_cursor para o cron
// reinvocar. Isto é o que garante "nunca travar por timeout".
const TIME_BUDGET_MS = 100_000;

const DEFAULT_TERMS: readonly string[] = [
  "aviso de licitação",
  "pregão eletrônico",
  "pregão presencial",
  "tomada de preços",
  "concorrência pública",
  "dispensa de licitação",
  "inexigibilidade de licitação",
  "chamamento público",
];

// ---------------------------------------------------------------------------
// Tipos crus — formato confirmado por fetch ao vivo em api.queridodiario.ok.org.br
// ---------------------------------------------------------------------------

interface RawGazette {
  territory_id: string;
  date: string;
  scraped_at?: string;
  url: string;
  territory_name?: string;
  state_code?: string;
  excerpts?: string[];
  edition?: string;
  is_extra_edition?: boolean;
  txt_url?: string;
}

interface SearchResponse {
  total_gazettes?: number;
  gazettes?: RawGazette[];
}

interface Cursor {
  termoIndex: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Normalização (espelha packages/sources/src/connectors/querido-diario.ts —
// duplicado aqui pois Deno Edge Functions não importam de packages/ sem build)
// ---------------------------------------------------------------------------

function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function opportunityId(gazette: RawGazette, termo: string): string {
  const key = `${gazette.territory_id}|${gazette.date}|${gazette.edition ?? ""}|${termo.toLowerCase()}`;
  return `qd-${stableHash(key)}`;
}

function normalize(gazette: RawGazette, termo: string, collectedAt: string): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: opportunityId(gazette, termo),
    sourceId: SOURCE_ID,
    municipio: (gazette.territory_name ?? "").trim() || "Município não informado",
    uf: gazette.state_code ?? "",
    ibgeCode: gazette.territory_id,
    data: gazette.date,
    trecho: (gazette.excerpts?.[0] ?? "").trim(),
    termo,
    extraEdicao: gazette.is_extra_edition ?? false,
    sourceUrl: gazette.url,
    collectedAt,
    raw: gazette,
  };
  if (gazette.edition) out.edicao = gazette.edition;
  if (gazette.txt_url) out.txtUrl = gazette.txt_url;
  if (gazette.scraped_at) out.scrapedAt = gazette.scraped_at;
  return out;
}

function buildUrl(
  termo: string,
  offset: number,
  size: number,
  territoryIds: string[],
  publishedSince: string | null,
  publishedUntil: string | null,
): string {
  const search = new URLSearchParams({
    querystring: termo,
    size: String(Math.min(size, MAX_PAGE_SIZE)),
    offset: String(offset),
    excerpt_size: "500",
    number_of_excerpts: "1",
  });
  for (const id of territoryIds) search.append("territory_ids", id);
  if (publishedSince) search.set("published_since", publishedSince);
  if (publishedUntil) search.set("published_until", publishedUntil);
  return `${BASE}/gazettes?${search.toString()}`;
}

async function getJson(url: string): Promise<SearchResponse> {
  const res = await fetchWithRetry(url, {
    timeoutMs: 15000,
    retries: 3,
    backoffMs: 800,
    init: { headers: HEADERS },
  });
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return (await res.json()) as SearchResponse;
}

function parseCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Cursor>;
    if (typeof parsed.termoIndex === "number" && typeof parsed.offset === "number") {
      return { termoIndex: parsed.termoIndex, offset: parsed.offset };
    }
  } catch {
    // cursor malformado -> ignora e recomeça do zero.
  }
  return null;
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
    console.warn("[ingest-querido-diario] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const url = new URL(req.url);

  const termosParam = url.searchParams.get("termos");
  const termos = termosParam
    ? termosParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [...DEFAULT_TERMS];

  const municipiosParam = url.searchParams.get("municipios");
  const territoryIds = municipiosParam
    ? municipiosParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d{7}$/.test(s))
    : [];

  const publishedSince = url.searchParams.get("dataInicial");
  const publishedUntil = url.searchParams.get("dataFinal");
  const tamanhoPagina = Number(url.searchParams.get("tamanhoPagina") ?? String(MAX_PAGE_SIZE));
  const maxPaginasPorTermo = Number(url.searchParams.get("maxPaginasPorTermo") ?? "0"); // 0 = sem teto

  const startCursor = parseCursor(url.searchParams.get("cursor")) ?? { termoIndex: 0, offset: 0 };

  if (termos.length === 0) {
    return jsonResponse({ ok: false, error: "Nenhum termo de busca válido informado." }, { status: 400 }, req);
  }

  const startedAt = Date.now();
  const timeIsUp = () => Date.now() - startedAt > TIME_BUDGET_MS;

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const items: Array<Record<string, unknown>> = [];
    const errors: Array<{ termo: string; offset: number; error: string }> = [];
    const seen = new Set<string>(); // dedup por id estável dentro da execução

    let termoIndex = startCursor.termoIndex;
    let offset = startCursor.offset;
    let paginasNesteTermo = 0;
    let nextCursor: Cursor | null = null;
    let truncatedByTime = false;

    outer: while (termoIndex < termos.length) {
      const termo = termos[termoIndex]!;

      while (true) {
        if (timeIsUp()) {
          nextCursor = { termoIndex, offset };
          truncatedByTime = true;
          break outer;
        }

        const target = buildUrl(termo, offset, tamanhoPagina, territoryIds, publishedSince, publishedUntil);
        let page: SearchResponse;
        try {
          page = await getJson(target);
        } catch (e) {
          errors.push({ termo, offset, error: String(e) });
          break; // não insiste neste termo; avança para o próximo
        }

        const gazettes = page.gazettes ?? [];
        for (const raw of gazettes) {
          if (!raw?.territory_id || !raw?.date) continue;
          const normalized = normalize(raw, termo, collectedAt);
          const id = normalized.id as string;
          if (seen.has(id)) continue;
          seen.add(id);
          items.push(normalized);
        }

        paginasNesteTermo += 1;
        const total = page.total_gazettes ?? gazettes.length;
        const proximoOffset = offset + gazettes.length;

        const acabouEsteTermo =
          gazettes.length === 0 ||
          proximoOffset >= total ||
          (maxPaginasPorTermo > 0 && paginasNesteTermo >= maxPaginasPorTermo);

        if (acabouEsteTermo) {
          offset = 0;
          paginasNesteTermo = 0;
          termoIndex += 1;
          if (RATE_MS > 0) await sleep(RATE_MS);
          break;
        }

        offset = proximoOffset;
        if (RATE_MS > 0) await sleep(RATE_MS);
      }
    }

    // Grava em lotes via a RPC.
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_querido_diario", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    return jsonResponse({
      ok: true,
      termos,
      municipios: territoryIds.length > 0 ? territoryIds : null,
      janela: { dataInicial: publishedSince ?? null, dataFinal: publishedUntil ?? null },
      processed: items.length,
      ingested,
      truncatedByTime,
      next_cursor: nextCursor,
      errors,
    }, {}, req);
  } catch (e) {
    return jsonResponse({ ok: false, source: SOURCE_ID, error: String(e) }, { status: 500 }, req);
  }
});
