// Supabase Edge Function: "ingest-senado-votacoes"
// Ingestão de VOTAÇÕES NOMINAIS do Plenário — Senado Federal (Dados Abertos).
//
// FONTE (pública, SEM auth, SEM chave; formato JSON via sufixo .json):
//   Lista por ano:    GET {BASE}/plenario/lista/votacao/{ano}.json
//   Votação avulsa:   GET {BASE}/plenario/votacao/{codigo}.json   (não usada aqui;
//                     a lista anual já traz o placar e a matéria de cada votação)
//   BASE = https://legis.senado.leg.br/dadosabertos
//   Docs: https://legis.senado.leg.br/dadosabertos/docs/
//
// PORQUÊ ESTE COLETOR EXISTE
//   `ingest-senado` cobre apenas SENADORES em exercício (kind 'politician'). As
//   VOTAÇÕES não eram coletadas. Sem coleta, a página /sources mostra a fonte
//   sem run. Aqui normalizamos cada votação para kind 'legislative_vote' e
//   gravamos via RPC public.ingest_senado_votacoes, que registra source_runs
//   (running -> success/failed) + raw_records + entities + evidence, idêntico ao
//   par ingest-camara-votacoes / ingest_camara_votacoes.
//
// SHAPE DA RESPOSTA (varia entre serviços do Senado; tratamos defensivamente).
//   A lista anual costuma vir como:
//     { "ListaVotacoes": { "Votacoes": { "Votacao": [ {...}, {...} ] } } }
//   Cada Votacao tem campos como CodigoSessaoVotacao/CodigoSessao, DescricaoVotacao,
//   SiglaMateria/NumeroMateria/AnoMateria, DataSessao/DataVotacao, Resultado e os
//   placares (TotalVotosSim/Nao/Abstencao). Como o Senado já renomeou campos no
//   passado, lemos cada um por uma LISTA de aliases (pickStr) — nunca assumimos um
//   nome só. Se a forma mudar, caímos em fallback sem quebrar.
//
// CHAVE ESTÁVEL / IDEMPOTÊNCIA
//   id = código da votação (CodigoSessaoVotacao | CodigoVotacao | CodigoSessao).
//   A RPC faz upsert por (external_ids->>'senadoVotacaoId') where
//   kind='legislative_vote'. Rodar 2x o mesmo ano não duplica.
//
// ORÇAMENTO DE TEMPO / CURSOR (backfill multi-ano)
//   A lista de UM ano é uma única chamada e cabe bem em 150s. Para backfill de
//   vários anos, paginamos POR ANO: ?anoInicio & ?anoFim processam do mais
//   recente para o mais antigo, parando no TIME_BUDGET_MS e devolvendo
//   nextCursor = "<ano>" (próximo ano a processar). O chamador repete com
//   ?anoFim=<nextCursor>. Default: só o ano corrente.
//
// SECRETS: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY injetados pelo Supabase.
//   INGEST_CRON_SECRET (opcional) — se definido, exige Bearer correspondente.
//   NENHUM segredo hardcoded.
//
// PARÂMETROS (query):
//   ?ano=YYYY          -> ano único (atalho; equivale a anoInicio=anoFim=YYYY)
//   ?anoInicio=YYYY    -> ano mais antigo do intervalo (default = ano corrente)
//   ?anoFim=YYYY       -> ano mais recente do intervalo (default = ano corrente);
//                         processamos de anoFim p/ anoInicio (recente -> antigo)
//   ?maxAnos=N         -> teto de anos por invocação (default 1)
//
// Deploy: Verify JWT LIGADO (o cron/admin manda Authorization, igual às outras).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { parseDateBrt } from "../_shared/br.ts";

const BASE = "https://legis.senado.leg.br/dadosabertos";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "senado-dados-abertos";

const RPC_NAME = "ingest_senado_votacoes";
const RPC_BATCH = 200;
const TIME_BUDGET_MS = 115_000; // margem do limite ~150s da Edge Function
const FETCH_TIMEOUT_MS = 20_000;
// O Senado tem dados de votação nominal eletrônica a partir do início dos anos 90;
// guard-rail conservador para não pedir anos absurdos.
const MIN_YEAR = 1991;

// ── Helpers de leitura defensiva (Senado renomeia campos) ────────────────────

/** Primeiro valor não-vazio dentre chaves candidatas (case-sensitive nas chaves do Senado). */
function pickStr(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v !== null && v !== undefined) {
      const s = String(v).trim();
      if (s !== "") return s;
    }
  }
  return "";
}

function pickNum(obj: Record<string, unknown>, keys: string[]): number | null {
  const s = pickStr(obj, keys);
  if (s === "") return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Normaliza um array que pode vir como objeto único, array, ou ausente. */
function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === null || v === undefined) return [];
  return [v as T];
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Extração da lista de votações da resposta (tolerante a variações de shape) ──

function extractVotacoes(json: unknown): Array<Record<string, unknown>> {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  // Caminho documentado: ListaVotacoes.Votacoes.Votacao
  const lista = root["ListaVotacoes"] as Record<string, unknown> | undefined;
  if (lista) {
    const votacoes = lista["Votacoes"] as Record<string, unknown> | undefined;
    if (votacoes) {
      const arr = asArray<Record<string, unknown>>(votacoes["Votacao"]);
      if (arr.length > 0) return arr;
    }
    // Alguns serviços achatam para ListaVotacoes.Votacao
    const flat = asArray<Record<string, unknown>>(lista["Votacao"]);
    if (flat.length > 0) return flat;
  }
  // Fallback: alguns endpoints devolvem direto { Votacoes: { Votacao: [...] } }
  const v2 = root["Votacoes"] as Record<string, unknown> | undefined;
  if (v2) {
    const arr = asArray<Record<string, unknown>>(v2["Votacao"]);
    if (arr.length > 0) return arr;
  }
  return [];
}

// ── Normalização de uma votação -> item da RPC ────────────────────────────────

interface NormalizedVote {
  id: string;
  descricao: string;
  siglaMateria: string;
  data: string;
  resultado: string;
  codigoSessao: string;
  codigoMateria: string;
  sourceUrl: string;
  contentHash: string;
  attributes: Record<string, unknown>;
  raw: Record<string, unknown>;
}

async function normalizeVote(raw: Record<string, unknown>): Promise<NormalizedVote | null> {
  const id = pickStr(raw, [
    "CodigoSessaoVotacao",
    "CodigoVotacao",
    "CodigoSessao",
    "SequencialVotacao",
  ]);
  if (id === "") return null;

  const descricao = pickStr(raw, ["DescricaoVotacao", "Descricao", "DescricaoResultado"]) || "Votação";
  const siglaMateria = pickStr(raw, ["SiglaMateria", "IdentificacaoMateria", "Sigla"]);
  const numeroMateria = pickStr(raw, ["NumeroMateria", "Numero"]);
  const anoMateria = pickStr(raw, ["AnoMateria", "Ano"]);
  const dataRaw = pickStr(raw, ["DataSessao", "DataVotacao", "Data"]);
  const horaRaw = pickStr(raw, ["HoraInicio", "Hora"]);
  const resultado = pickStr(raw, ["Resultado", "DescricaoResultado", "SiglaResultado"]);

  const votosSim = pickNum(raw, ["TotalVotosSim", "VotosSim", "Sim"]);
  const votosNao = pickNum(raw, ["TotalVotosNao", "VotosNao", "Nao"]);
  const votosAbst = pickNum(raw, ["TotalVotosAbstencao", "VotosAbstencao", "Abstencao"]);

  const materiaLabel = [siglaMateria, numeroMateria && anoMateria ? `${numeroMateria}/${anoMateria}` : numeroMateria]
    .filter((s) => s && s !== "")
    .join(" ")
    .trim();

  const data = parseDateBrt(horaRaw ? `${dataRaw} ${horaRaw}`.trim() : dataRaw);
  const sourceUrl = `${BASE}/plenario/votacao/${encodeURIComponent(id)}`;

  const attributes: Record<string, unknown> = {
    casa: "senado",
    codigoVotacao: id,
    descricao,
    siglaMateria,
    numeroMateria,
    anoMateria,
    materia: materiaLabel || null,
    data,
    resultado: resultado || null,
    votosSim,
    votosNao,
    votosAbstencao: votosAbst,
    secreta: pickStr(raw, ["IndicadorVotacaoSecreta", "Secreta"]) === "Sim",
    urlPagina: sourceUrl,
  };

  const hashHex = await sha256Hex(JSON.stringify(raw));

  return {
    id,
    descricao,
    siglaMateria: materiaLabel || siglaMateria || "Senado",
    data,
    resultado,
    codigoSessao: pickStr(raw, ["CodigoSessao", "CodigoSessaoLegislativa"]),
    codigoMateria: pickStr(raw, ["CodigoMateria"]),
    sourceUrl,
    contentHash: `sha256:${hashHex}`,
    attributes,
    raw,
  };
}

// ── Fetch de um ano ───────────────────────────────────────────────────────────

async function fetchAno(ano: number): Promise<Array<Record<string, unknown>>> {
  const url = `${BASE}/plenario/lista/votacao/${ano}.json`;
  const res = await fetchWithRetry(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    retries: 3,
    backoffMs: 800,
    init: { headers: HEADERS },
  });
  if (res.status === 404) return []; // ano sem votações catalogadas -> vazio, não erro
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Senado respondeu ${res.status} para ${ano}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return extractVotacoes(json);
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (cronSecret) {
    if (!hasValidBearerSecret(req, cronSecret)) {
      return jsonResponse({ ok: false, source: SOURCE_ID, error: "Unauthorized" }, { status: 401 }, req);
    }
  } else {
    console.warn("[ingest-senado-votacoes] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const url = new URL(req.url);
  const nowYear = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCFullYear(); // BRT

  const anoUnico = Number(url.searchParams.get("ano") ?? "");
  let anoFim = Number(url.searchParams.get("anoFim") ?? "");
  let anoInicio = Number(url.searchParams.get("anoInicio") ?? "");
  if (Number.isFinite(anoUnico) && anoUnico > 0) {
    anoInicio = anoUnico;
    anoFim = anoUnico;
  }
  if (!Number.isFinite(anoFim) || anoFim <= 0) anoFim = nowYear;
  if (!Number.isFinite(anoInicio) || anoInicio <= 0) anoInicio = nowYear;
  anoFim = Math.min(Math.max(anoFim, MIN_YEAR), nowYear);
  anoInicio = Math.min(Math.max(anoInicio, MIN_YEAR), anoFim);
  const maxAnos = Math.max(1, Number(url.searchParams.get("maxAnos") ?? "1") || 1);

  const startedAt = Date.now();

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const anosProcessados: number[] = [];
    const errors: Array<{ ano: number; error: string }> = [];
    let coletados = 0;
    let ingested = 0;
    let nextCursor: string | null = null;

    // Processa do ano mais recente (anoFim) para o mais antigo (anoInicio).
    let ano = anoFim;
    let anosFeitos = 0;
    while (ano >= anoInicio && anosFeitos < maxAnos) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        nextCursor = String(ano); // retomar deste ano na próxima invocação
        break;
      }

      let rawList: Array<Record<string, unknown>> = [];
      try {
        rawList = await fetchAno(ano);
      } catch (e) {
        errors.push({ ano, error: String(e) });
        ano -= 1;
        anosFeitos += 1;
        continue; // degradação elegante: pula o ano que falhou
      }

      const items: NormalizedVote[] = [];
      const seen = new Set<string>();
      for (const raw of rawList) {
        const norm = await normalizeVote(raw);
        if (!norm) continue;
        if (seen.has(norm.id)) continue;
        seen.add(norm.id);
        items.push(norm);
      }
      coletados += items.length;

      // Grava em lotes via RPC (que escreve source_runs).
      for (let i = 0; i < items.length; i += RPC_BATCH) {
        const batch = items.slice(i, i + RPC_BATCH).map((it) => ({
          id: it.id,
          descricao: it.descricao,
          siglaMateria: it.siglaMateria,
          data: it.data,
          resultado: it.resultado,
          codigoSessao: it.codigoSessao,
          codigoMateria: it.codigoMateria,
          sourceUrl: it.sourceUrl,
          contentHash: it.contentHash,
          attributes: it.attributes,
          raw: it.raw,
        }));
        const { data, error } = await supabase.rpc(RPC_NAME, {
          p_payload: { collectedAt, ano, items: batch },
        });
        if (error) {
          // Falha honesta da RPC (ex.: migration 0022 ainda não aplicada).
          return jsonResponse(
            {
              ok: false,
              source: SOURCE_ID,
              error: `RPC ${RPC_NAME}: ${error.message}`,
              anosProcessados,
              ingested,
              nextCursor: String(ano),
            },
            { status: 502 },
            req,
          );
        }
        ingested += typeof data === "number" ? data : batch.length;
      }

      anosProcessados.push(ano);
      anosFeitos += 1;
      ano -= 1;
      if (ano >= anoInicio && anosFeitos < maxAnos) await sleep(250);
    }

    // Se ainda há anos a processar abaixo do último feito, sinaliza cursor.
    if (nextCursor === null && ano >= anoInicio) nextCursor = String(ano);

    return jsonResponse(
      {
        ok: errors.length === 0,
        source: SOURCE_ID,
        intervalo: { anoInicio, anoFim },
        anosProcessados,
        coletados,
        ingested,
        nextCursor,
        errors,
        elapsedMs: Date.now() - startedAt,
      },
      {},
      req,
    );
  } catch (e) {
    return jsonResponse(
      { ok: false, source: SOURCE_ID, error: String(e), elapsedMs: Date.now() - startedAt },
      { status: 500 },
      req,
    );
  }
});
