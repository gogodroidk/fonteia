// Supabase Edge Function: "ingest-inpe-queimadas"
// Ingestão de FOCOS DE INCÊNDIO — INPE / Programa Queimadas (dados abertos).
//
// Fonte pública, sem autenticação, suporta HTTP Range:
//   https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/mensal/Brasil/focos_mensal_br_YYYYMM.csv
//
// Estratégia (aggregação por município, dentro do budget de 150s/Edge Function):
//   1. Determina o mês-alvo via ?anoMes=YYYYMM (default: mês corrente).
//   2. Faz Range-fetches de CHUNK_BYTES por vez até esgotar a janela máxima
//      (DEFAULT_WINDOW_BYTES) ou o arquivo completo.
//   3. Parseia o CSV (comma-separated, UTF-8) linha a linha.
//   4. Agrega por municipio_id: conta focos, soma FRP, captura bioma dominante,
//      estado, max risco_fogo, max numero_dias_sem_chuva.
//   5. Grava como entities (kind="environmental_alert") via RPC
//      public.ingest_inpe_queimadas — um registro por município/mês.
//      id = "queimadas:<municipio_id>:<anoMes>" — upsert idempotente.
//
// CSV schema (comma-delimited, linha 1 = header):
//   id, lat, lon, data_hora_gmt, satelite, municipio, estado, pais,
//   municipio_id, estado_id, pais_id, numero_dias_sem_chuva, precipitacao,
//   risco_fogo, bioma, frp
//
// Parâmetros de query (todos opcionais):
//   ?anoMes=YYYYMM   — mês a ingerir (default: mês corrente em BRT)
//   ?window=4000000  — bytes a baixar por execução (default 4 MB)
//   ?offset=0        — byte offset de retomada dentro do arquivo
//   ?uf=SP           — filtro opcional de estado (sigla, ex. SP, AM)
//   ?limit=500       — teto de municípios únicos a persistir (default 500)
//
// Cursor de retomada: se o arquivo exceder a janela, a resposta inclui:
//   { nextCursor: "YYYYMM:<byteOffset>" }
// O chamador passa ?anoMes=YYYYMM&offset=<byteOffset> na próxima chamada.
//
// Idempotência: id = "queimadas:<municipio_id>:<anoMes>" — a RPC faz upsert por
//   esse id, portanto reprocessar o mesmo mês/janela não duplica registros.
//
// Degradação elegante: falha de rede/parse -> { ok:false, error:... } com 502.
//   Nunca retorna 200 com erro escondido.
//
// Secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — injetados pelo Supabase.
//   INGEST_CRON_SECRET — opcional; se definido, exige Bearer correspondente.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithTimeout } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";

// ── Constantes ──────────────────────────────────────────────────────────────

const BASE_URL =
  "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/mensal/Brasil";
const PORTAL =
  "https://terrabrasilis.dpi.inpe.br/queimadas/portal/dados-abertos/";
const SOURCE_ID = "inpe-queimadas-dados-abertos";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

// Bytes por Range-fetch (2 MB — cabe bem em RAM de Edge Function).
const CHUNK_BYTES = 2_000_000;
// Janela máxima padrão por execução (4 MB → ~2 chunks → ~140s budget).
const DEFAULT_WINDOW_BYTES = 4_000_000;
// Lote máximo de upsert por chamada de RPC.
const RPC_BATCH = 500;

// ── Tipos ────────────────────────────────────────────────────────────────────

interface MunicipioAggregate {
  municipioId: string;      // municipio_id do CSV (7 dígitos IBGE)
  municipio: string;        // nome do município
  estado: string;           // nome do estado por extenso
  uf: string;               // sigla derivada dos 2 primeiros dígitos do estado_id
  bioma: string;            // bioma dominante (maior contagem)
  totalFocos: number;       // quantidade de focos detectados no mês
  frpTotal: number;         // soma do Fire Radiative Power (FRP) em MW
  frpMedio: number;         // média do FRP
  maxRiscoFogo: number;     // maior valor de risco_fogo no mês (0–1)
  maxDiasSemChuva: number;  // máximo de numero_dias_sem_chuva
  anoMes: string;           // "YYYYMM"
  sourceUrl: string;        // URL do CSV mensal
  collectedAt: string;      // ISO timestamp da coleta
}

interface CsvIndex {
  id: number;
  lat: number;
  lon: number;
  dataHoraGmt: number;
  satelite: number;
  municipio: number;
  estado: number;
  pais: number;
  municipioId: number;
  estadoId: number;
  paisId: number;
  diasSemChuva: number;
  precipitacao: number;
  riscoFogo: number;
  bioma: number;
  frp: number;
}

// ── Helpers de data BRT ─────────────────────────────────────────────────────

/** Retorna "YYYYMM" para o mês corrente no fuso BRT (UTC-3). */
function currentAnoMes(): string {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000); // UTC → BRT
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

/** Valida "YYYYMM": 4 dígitos de ano + 2 de mês (01–12). */
function validAnoMes(s: string): boolean {
  if (!/^\d{6}$/.test(s)) return false;
  const m = Number(s.slice(4));
  return m >= 1 && m <= 12;
}

function csvFileUrl(anoMes: string): string {
  return `${BASE_URL}/focos_mensal_br_${anoMes}.csv`;
}

// ── Range-fetch ─────────────────────────────────────────────────────────────

async function fetchRange(
  url: string,
  start: number,
  end: number,
): Promise<{ bytes: Uint8Array; status: number }> {
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        "user-agent": UA,
        "Range": `bytes=${start}-${end}`,
      },
    },
    25000,
  );
  if (res.status === 416) {
    // Range Not Satisfiable — offset está além do fim do arquivo.
    return { bytes: new Uint8Array(0), status: 416 };
  }
  if (res.status !== 206 && res.status !== 200) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `INPE dataserver respondeu ${res.status} para Range ${start}-${end}: ${body.slice(0, 200)}`,
    );
  }
  return { bytes: new Uint8Array(await res.arrayBuffer()), status: res.status };
}

// ── CSV parse ────────────────────────────────────────────────────────────────

/**
 * Parseia CSV simples (comma-delimited, sem aspas multi-linha) linha a linha.
 * Retorna linhas como arrays de strings; descarta a última linha se incompleta
 * (sem \n final) para evitar campos truncados.
 *
 * @param text  Texto CSV (pode ser trecho parcial, sem garantia de linha final)
 * @param discardLast  true = descarta última linha (padrão para chunks parciais)
 */
function parseCsvLines(text: string, discardLast = true): string[][] {
  const lines = text.split("\n");
  // Remove CR de CRLF
  const cleaned = lines.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  // Descarta última linha potencialmente truncada
  const usable = discardLast && cleaned.length > 1
    ? cleaned.slice(0, -1)
    : cleaned;
  return usable
    .filter((l) => l.trim() !== "")
    .map((l) => l.split(","));
}

/** Lê o índice de colunas a partir do header (linha 0). */
function buildIndex(header: string[]): CsvIndex {
  const idx = (name: string) => header.indexOf(name.trim());
  return {
    id: idx("id"),
    lat: idx("lat"),
    lon: idx("lon"),
    dataHoraGmt: idx("data_hora_gmt"),
    satelite: idx("satelite"),
    municipio: idx("municipio"),
    estado: idx("estado"),
    pais: idx("pais"),
    municipioId: idx("municipio_id"),
    estadoId: idx("estado_id"),
    paisId: idx("pais_id"),
    diasSemChuva: idx("numero_dias_sem_chuva"),
    precipitacao: idx("precipitacao"),
    riscoFogo: idx("risco_fogo"),
    bioma: idx("bioma"),
    frp: idx("frp"),
  };
}

function safeNum(v: string | undefined): number {
  if (v === undefined) return 0;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : 0;
}
function safeStr(v: string | undefined): string {
  return (v ?? "").trim();
}

// ── Agregação ────────────────────────────────────────────────────────────────

interface MunicipioAccum {
  municipio: string;
  estado: string;
  uf: string;
  biomas: Record<string, number>;
  totalFocos: number;
  frpSum: number;
  frpCount: number;
  maxRiscoFogo: number;
  maxDiasSemChuva: number;
}

/**
 * Deriva a sigla do estado (UF) a partir do estado_id numérico.
 * O estado_id no CSV corresponde ao código IBGE do estado (e.g. 35 = SP).
 */
const ESTADO_ID_TO_UF: Record<number, string> = {
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA",
  16: "AP", 17: "TO", 21: "MA", 22: "PI", 23: "CE",
  24: "RN", 25: "PB", 26: "PE", 27: "AL", 28: "SE",
  29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP",
  41: "PR", 42: "SC", 43: "RS", 50: "MS", 51: "MT",
  52: "GO", 53: "DF",
};

function estadoIdToUf(estadoId: number): string {
  return ESTADO_ID_TO_UF[estadoId] ?? String(estadoId);
}

function accumulate(
  accum: Map<string, MunicipioAccum>,
  rows: string[][],
  idx: CsvIndex,
  ufFilter: string,
): void {
  for (const row of rows) {
    const municipioId = safeStr(row[idx.municipioId]);
    if (!municipioId || municipioId === "municipio_id") continue; // cabeçalho residual
    if (!/^\d+$/.test(municipioId)) continue; // linha malformada

    const estadoId = safeNum(row[idx.estadoId]);
    const uf = estadoIdToUf(estadoId);

    // Filtro de UF (se solicitado)
    if (ufFilter && uf !== ufFilter) continue;

    const municipio = safeStr(row[idx.municipio]);
    const estado = safeStr(row[idx.estado]);
    const bioma = safeStr(row[idx.bioma]) || "Não informado";
    const frp = safeNum(row[idx.frp]);
    const riscoFogo = safeNum(row[idx.riscoFogo]);
    const diasSemChuva = safeNum(row[idx.diasSemChuva]);

    let acc = accum.get(municipioId);
    if (!acc) {
      acc = {
        municipio,
        estado,
        uf,
        biomas: {},
        totalFocos: 0,
        frpSum: 0,
        frpCount: 0,
        maxRiscoFogo: 0,
        maxDiasSemChuva: 0,
      };
      accum.set(municipioId, acc);
    }
    acc.totalFocos += 1;
    acc.frpSum += frp;
    if (frp > 0) acc.frpCount += 1;
    if (riscoFogo > acc.maxRiscoFogo) acc.maxRiscoFogo = riscoFogo;
    if (diasSemChuva > acc.maxDiasSemChuva) acc.maxDiasSemChuva = diasSemChuva;
    acc.biomas[bioma] = (acc.biomas[bioma] ?? 0) + 1;
    // Atualiza nome caso esteja vazio (pode ocorrer em primeiros rows)
    if (!acc.municipio && municipio) acc.municipio = municipio;
    if (!acc.estado && estado) acc.estado = estado;
  }
}

function finalizeAggregates(
  accum: Map<string, MunicipioAccum>,
  anoMes: string,
  sourceUrl: string,
  collectedAt: string,
  limit: number,
): MunicipioAggregate[] {
  const out: MunicipioAggregate[] = [];
  for (const [municipioId, acc] of accum) {
    // Bioma dominante: maior contagem
    let biomaDominante = "Não informado";
    let biomaMax = 0;
    for (const [b, cnt] of Object.entries(acc.biomas)) {
      if (cnt > biomaMax) {
        biomaMax = cnt;
        biomaDominante = b;
      }
    }

    out.push({
      municipioId,
      municipio: acc.municipio || "Não informado",
      estado: acc.estado || "Não informado",
      uf: acc.uf,
      bioma: biomaDominante,
      totalFocos: acc.totalFocos,
      frpTotal: Math.round(acc.frpSum * 10) / 10,
      frpMedio: acc.frpCount > 0
        ? Math.round((acc.frpSum / acc.frpCount) * 10) / 10
        : 0,
      maxRiscoFogo: Math.round(acc.maxRiscoFogo * 1000) / 1000,
      maxDiasSemChuva: acc.maxDiasSemChuva,
      anoMes,
      sourceUrl,
      collectedAt,
    });

    if (limit > 0 && out.length >= limit) break;
  }
  return out;
}

// ── Serialização para RPC ────────────────────────────────────────────────────

interface RpcItem {
  id: string;
  sourceId: string;
  name: string;
  cnpj: null;
  codigoIbge: string;
  kind: "environmental_alert";
  anoMes: string;
  municipio: string;
  estado: string;
  uf: string;
  bioma: string;
  totalFocos: number;
  frpTotal: number;
  frpMedio: number;
  maxRiscoFogo: number;
  maxDiasSemChuva: number;
  sourceUrl: string;
  collectedAt: string;
}

function toRpcItem(agg: MunicipioAggregate): RpcItem {
  return {
    // id idempotente: fonte:municipio_id:anoMes
    id: `queimadas:${agg.municipioId}:${agg.anoMes}`,
    sourceId: SOURCE_ID,
    name: `Focos de incêndio — ${agg.municipio} (${agg.uf}) — ${agg.anoMes.slice(0, 4)}/${agg.anoMes.slice(4)}`,
    cnpj: null,
    codigoIbge: agg.municipioId,
    kind: "environmental_alert",
    anoMes: agg.anoMes,
    municipio: agg.municipio,
    estado: agg.estado,
    uf: agg.uf,
    bioma: agg.bioma,
    totalFocos: agg.totalFocos,
    frpTotal: agg.frpTotal,
    frpMedio: agg.frpMedio,
    maxRiscoFogo: agg.maxRiscoFogo,
    maxDiasSemChuva: agg.maxDiasSemChuva,
    sourceUrl: agg.sourceUrl,
    collectedAt: agg.collectedAt,
  };
}

// ── HTTP handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // Auth gate: se INGEST_CRON_SECRET definido, exige Bearer correspondente.
  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (cronSecret) {
    if (!hasValidBearerSecret(req, cronSecret)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 }, req);
    }
  } else {
    console.warn(
      "[ingest-inpe-queimadas] INGEST_CRON_SECRET não definido — função sem segredo de cron.",
    );
  }

  const reqUrl = new URL(req.url);

  // Parâmetros
  const rawAnoMes = (reqUrl.searchParams.get("anoMes") ?? "").trim();
  const anoMes = rawAnoMes && validAnoMes(rawAnoMes) ? rawAnoMes : currentAnoMes();
  const ufFilter = (reqUrl.searchParams.get("uf") ?? "").trim().toUpperCase();
  const windowBytes = Math.max(
    CHUNK_BYTES,
    Number(reqUrl.searchParams.get("window") ?? "") || DEFAULT_WINDOW_BYTES,
  );
  const startOffset = Math.max(
    0,
    Number(reqUrl.searchParams.get("offset") ?? "") || 0,
  );
  const limit = Math.max(
    0,
    Number(reqUrl.searchParams.get("limit") ?? "") || RPC_BATCH,
  );

  const fileUrl = csvFileUrl(anoMes);
  const collectedAt = new Date().toISOString();

  try {
    // Acumula focos por município à medida que baixamos chunks.
    const accum = new Map<string, MunicipioAccum>();
    let idx: CsvIndex | null = null;
    // Carrega cabeçalho do início do arquivo se startOffset > 0
    // (o header sempre está nos primeiros bytes — baixamos byte 0 primeiro).
    let headerLoaded = false;

    // Rastro de texto de linha incompleta do chunk anterior
    let leftover = "";

    let bytePos = startOffset;
    const windowEnd = startOffset + windowBytes;
    let fileExhausted = false;
    let chunksRead = 0;

    // Se startOffset > 0, precisamos do header (linha 0) do início do arquivo.
    if (startOffset > 0) {
      const { bytes: headBytes, status: headStatus } = await fetchRange(
        fileUrl,
        0,
        Math.min(2047, startOffset - 1), // primeiros 2 KB são suficientes para o header
      );
      if (headStatus !== 416 && headBytes.length > 0) {
        const headText = new TextDecoder("utf-8").decode(headBytes);
        const headRows = parseCsvLines(headText, false);
        if (headRows.length > 0) {
          idx = buildIndex(headRows[0]!.map((h) => h.trim()));
          headerLoaded = true;
        }
      }
    }

    // Loop de chunks dentro da janela desta execução
    while (bytePos < windowEnd) {
      const chunkEnd = Math.min(bytePos + CHUNK_BYTES - 1, windowEnd - 1);
      const { bytes, status } = await fetchRange(fileUrl, bytePos, chunkEnd);

      if (status === 416 || bytes.length === 0) {
        fileExhausted = true;
        break;
      }

      chunksRead += 1;
      bytePos += bytes.length;

      // Decodifica e prepend do leftover do chunk anterior
      const raw = new TextDecoder("utf-8").decode(bytes);
      const text = leftover + raw;

      // Guarda a parte após o último \n para o próximo chunk
      const lastNl = text.lastIndexOf("\n");
      if (lastNl >= 0) {
        leftover = text.slice(lastNl + 1);
      } else {
        leftover = text;
      }
      const completePart = lastNl >= 0 ? text.slice(0, lastNl + 1) : "";
      if (!completePart) continue;

      const rows = parseCsvLines(completePart, false);
      if (rows.length === 0) continue;

      // Primeiro chunk: linha 0 é o header
      if (!headerLoaded && chunksRead === 1) {
        idx = buildIndex(rows[0]!.map((h) => h.trim()));
        headerLoaded = true;
        accumulate(accum, rows.slice(1), idx, ufFilter);
      } else if (idx) {
        // Chunks subsequentes: todas as linhas são dados
        accumulate(accum, rows, idx, ufFilter);
      }

      // Se o servidor devolveu menos bytes que o pedido, chegamos ao fim
      if (bytes.length < CHUNK_BYTES) {
        fileExhausted = true;
        break;
      }
    }

    // Processa o leftover final (última linha sem \n) se o arquivo foi esgotado
    if (fileExhausted && leftover.trim() !== "" && idx) {
      const lastRows = parseCsvLines(leftover, false);
      accumulate(accum, lastRows, idx, ufFilter);
    }

    // Finaliza os agregados
    const aggregates = finalizeAggregates(accum, anoMes, fileUrl, collectedAt, limit);

    // Calcula nextCursor para retomada (só se o arquivo não foi esgotado)
    const nextCursor = fileExhausted ? null : `${anoMes}:${bytePos}`;

    // Persiste em lotes via RPC
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let ingested = 0;
    const rpcErrors: string[] = [];

    for (let i = 0; i < aggregates.length; i += RPC_BATCH) {
      const batch = aggregates.slice(i, i + RPC_BATCH).map(toRpcItem);
      const { data, error } = await supabase.rpc("ingest_inpe_queimadas", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) {
        // Falha de RPC é fatal — retorna erro imediatamente.
        return jsonResponse(
          {
            ok: false,
            error: `RPC ingest_inpe_queimadas: ${error.message}`,
            processed: ingested,
            nextCursor,
          },
          { status: 500 },
          req,
        );
      }
      ingested += typeof data === "number" ? data : batch.length;
    }

    // Amostra para inspeção no manifest (primeiros 3 municípios)
    const sample = aggregates.slice(0, 3).map((a) => ({
      id: `queimadas:${a.municipioId}:${a.anoMes}`,
      municipio: a.municipio,
      uf: a.uf,
      bioma: a.bioma,
      totalFocos: a.totalFocos,
      frpMedio: a.frpMedio,
      maxRiscoFogo: a.maxRiscoFogo,
    }));

    return jsonResponse(
      {
        ok: true,
        fonte: PORTAL,
        arquivo: fileUrl,
        anoMes,
        ufFilter: ufFilter || null,
        bytesLidos: bytePos - startOffset,
        municipiosAgregados: accum.size,
        processed: aggregates.length,
        ingested,
        rpcErrors,
        nextCursor,
        fileExhausted,
        sample,
      },
      {},
      req,
    );
  } catch (e) {
    // Degradação elegante: INPE inacessível -> 502, pipeline segue.
    return jsonResponse(
      {
        ok: false,
        fonte: PORTAL,
        arquivo: fileUrl,
        anoMes,
        error: String(e),
        processed: 0,
        ingested: 0,
        nextCursor: null,
      },
      { status: 502 },
      req,
    );
  }
});
