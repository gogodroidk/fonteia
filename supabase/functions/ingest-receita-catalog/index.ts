// Supabase Edge Function: "ingest-receita-catalog"
// Ingestão do CATÁLOGO COMPLETO da Receita (todos os editais e lotes — não só destaques).
//
// Fluxo: GET api/editais-disponiveis -> achata TODOS os editais (próximos, abertos,
// encerrados, cancelados) -> por edital, GET api/edital/{edle} (traz listaLotes[]) ->
// normaliza cada lote (com valorAvaliacaoCents, category, imageUrls, situação) ->
// chama a RPC public.ingest_receita_catalog em lotes.
//
// Idempotente: id do lote = edle-nrAtribuido (MESMO esquema do destaque, sem duplicar).
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente pelo
// Supabase nas Edge Functions — não precisa configurar nada.
//
// Deploy: Edge Functions -> Create function "ingest-receita-catalog" -> cole este arquivo.
// (Verify JWT pode ficar LIGADO; o cron já manda Authorization, igual à ingest-receita-leiloes.)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://www25.receita.fazenda.gov.br/sle-sociedade";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };

// Pausa educada entre editais (ms). 800ms ~= 45 editais em ~36s (dentro do timeout).
const RATE_MS = 800;
// Lotes por chamada de RPC (evita payload gigante).
const RPC_BATCH = 200;

function parseEdle(edle: string): { unidade: string; numero: string; exercicio: string } {
  const [unidade, numero, exercicio] = edle.split("/");
  if (!unidade || !numero || !exercicio) throw new Error(`edle inválido: ${edle}`);
  return { unidade, numero, exercicio };
}

function editalApiUrl(edle: string): string {
  const { unidade, numero, exercicio } = parseEdle(edle);
  return `${BASE}/api/edital/${unidade}/${numero}/${exercicio}`;
}

function lotePortalUrl(edle: string, lote: string | number): string {
  const { unidade, numero, exercicio } = parseEdle(edle);
  return `${BASE}/portal/edital/${unidade}/${numero}/${exercicio}/lote/${lote}`;
}

function parseReceitaDate(value: string | undefined): string {
  if (!value) return "";
  const [datePart, timePart = "00:00"] = value.split(" ");
  const [year, month, day] = (datePart ?? "").split("-");
  if (!year || !month || !day) return value;
  return `${year}-${month}-${day}T${timePart}:00-03:00`;
}

function toCents(reais: unknown): number {
  const n = typeof reais === "number" ? reais : Number(reais);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

interface RawLot {
  loleNrSq: number;
  nrAtribuido: number;
  tipo?: string;
  situacaoLote?: number;
  valorMinimo: number;
  valorAvaliacao?: number;
  permitePF?: boolean;
  imagens?: Array<{ src?: string }>;
}

interface RawEdital {
  edital: string;
  edle: string;
  situacao?: number;
  permitePF?: boolean;
  orgao: string;
  cidade: string;
  dataFimPropostas?: string;
  listaLotes?: RawLot[];
}

function normalizeLot(edital: RawEdital, lote: RawLot, collectedAt: string): Record<string, unknown> {
  const eligiblePF = lote.permitePF ?? edital.permitePF ?? false;
  const images = (lote.imagens ?? []).map((i) => i.src).filter((s): s is string => Boolean(s));
  const id = `${edital.edle.replaceAll("/", "-")}-${lote.nrAtribuido}`;
  const lot: Record<string, unknown> = {
    id,
    sourceId: "receita-leiloes-sle",
    edital: edital.edital,
    edle: edital.edle,
    lotNumber: String(lote.nrAtribuido),
    displayNumber: String(lote.nrAtribuido),
    city: edital.cidade,
    agency: edital.orgao,
    minimumBidCents: toCents(lote.valorMinimo),
    proposalDeadline: parseReceitaDate(edital.dataFimPropostas),
    eligiblePersonTypes: eligiblePF ? ["pf", "pj"] : ["pj"],
    sourceUrl: lotePortalUrl(edital.edle, lote.nrAtribuido),
    collectedAt,
    situacao: edital.situacao ?? null,
    lotSituacao: lote.situacaoLote ?? null,
    raw: lote,
  };
  if (lote.valorAvaliacao !== undefined) lot.valorAvaliacaoCents = toCents(lote.valorAvaliacao);
  if (lote.tipo) lot.category = lote.tipo;
  if (images.length > 0) {
    lot.imageUrl = images[0];
    lot.imageUrls = images;
  }
  return lot;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const maxEditais = Number(url.searchParams.get("maxEditais") ?? "0"); // 0 = todos

  try {
    const disponiveis = await getJson<{
      agora?: string;
      situacoes?: Array<{ situacao?: number; lista?: Array<{ edle: string }> }>;
    }>(`${BASE}/api/editais-disponiveis`);
    const collectedAt = parseReceitaDate(disponiveis.agora) || new Date().toISOString();
    // Por padrão só editais ABERTOS/próximos (situação 2,3,5,6,7) — o que dá pra arrematar.
    // ?all=1 inclui encerrados/cancelados (histórico para análise de médias).
    const includeAll = url.searchParams.get("all") === "1";
    const OPEN = new Set([2, 3, 5, 6, 7]);
    let editais = (disponiveis.situacoes ?? [])
      .filter((g) => includeAll || (typeof g.situacao === "number" && OPEN.has(g.situacao)))
      .flatMap((g) => g.lista ?? []);
    if (maxEditais > 0) editais = editais.slice(0, maxEditais);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const lots: Array<Record<string, unknown>> = [];
    const errors: Array<{ edle: string; error: string }> = [];

    for (let i = 0; i < editais.length; i++) {
      const edle = editais[i]!.edle;
      try {
        const edital = await getJson<RawEdital>(editalApiUrl(edle));
        for (const lote of edital.listaLotes ?? []) {
          lots.push(normalizeLot(edital, lote, collectedAt));
        }
      } catch (e) {
        errors.push({ edle, error: String(e) });
      }
      if (i < editais.length - 1 && RATE_MS > 0) await sleep(RATE_MS);
    }

    // Grava em lotes via a RPC.
    let ingested = 0;
    for (let i = 0; i < lots.length; i += RPC_BATCH) {
      const batch = lots.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_receita_catalog", {
        p_payload: { collectedAt, lots: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    return new Response(
      JSON.stringify({ ok: true, editais: editais.length, lots: lots.length, ingested, errors }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
