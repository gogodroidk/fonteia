// Supabase Edge Function: "ingest-ambiental"
// Ingestão de AUTOS DE INFRAÇÃO ambiental — IBAMA Dados Abertos (módulo Ambiental).
//
// Fonte: ZIP público (sem auth) em Azure Blob com UMA planilha CSV por ano:
//   https://stibamadadosabertosprd.blob.core.windows.net/dados-abertos/dados/SIFISC/auto_infracao/auto_infracao/auto_infracao_csv.zip
// O CKAN do IBAMA NÃO expõe datastore_search (retorna 400), então não há API
// JSON paginada. O ZIP tem ~120 MB — grande demais para bufferizar/descompactar
// numa Edge Function. Mas o Blob suporta HTTP Range (206) e cada entrada é um
// DEFLATE independente cujo header local traz compressedSize (flags bit-3 = 0).
//
// Estratégia (amostra recente, sem baixar 120 MB):
//   1. Caminha os local file headers via Range minúsculos, pulando dados por
//      compressedSize. Acha a entrada do ANO MAIS RECENTE (ex.: 2026).
//   2. Range-fetch da fatia inicial do DEFLATE dessa entrada (~2 MB) e infla via
//      DecompressionStream("deflate-raw") até onde os bytes permitirem (o stream
//      truncado no fim é esperado e tratado).
//   3. Parse do CSV (UTF-8, ";"), normaliza -> kind='environmental_infraction',
//      e grava em lotes via a RPC public.ingest_ambiental.
//
// Idempotente: id = SEQ_AUTO_INFRACAO. A RPC faz upsert por índice único parcial.
//
// Degradação elegante: se o IBAMA estiver inacessível/instável, devolve
// { ok:false, ... } com 200/502 e NÃO derruba o pipeline — a tela mostra empty.
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados pelo Supabase.
//
// Parâmetros de query (opcionais):
//   ?uf=SP       -> filtra (nesta função) só os autos da UF.
//   ?limit=2000  -> teto de registros normalizados.
//   ?window=2000000 -> bytes comprimidos a baixar da entrada mais recente.
//
// Deploy: Verify JWT LIGADO (igual às outras); o invocador manda Authorization.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ZIP_URL =
  "https://stibamadadosabertosprd.blob.core.windows.net/dados-abertos/dados/SIFISC/auto_infracao/auto_infracao/auto_infracao_csv.zip";
const PORTAL = "https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const SOURCE_ID = "ibama-dados-abertos";

const DEFAULT_WINDOW = 2_000_000; // bytes comprimidos da entrada mais recente
const MAX_ZIP_ENTRIES = 200;
const RPC_BATCH = 500;

// ── ZIP Range helpers ───────────────────────────────────────────────────────

async function fetchRange(start: number, end: number): Promise<Uint8Array> {
  const res = await fetch(ZIP_URL, {
    headers: { "user-agent": UA, Range: `bytes=${start}-${end}` },
  });
  if (res.status !== 206 && res.status !== 200) {
    throw new Error(`IBAMA Blob respondeu ${res.status} em Range ${start}-${end}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function readU16(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}
function readU32(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}

interface ZipEntry {
  name: string;
  dataOffset: number;
  compressedSize: number;
}

async function listZipEntries(): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  let offset = 0;
  for (let i = 0; i < MAX_ZIP_ENTRIES; i++) {
    const head = await fetchRange(offset, offset + 30 + 256 - 1);
    if (head.length < 30) break;
    if (readU32(head, 0) !== 0x04034b50) break; // chegou no central directory
    const compressedSize = readU32(head, 18);
    const nameLen = readU16(head, 26);
    const extraLen = readU16(head, 28);
    const name = new TextDecoder("utf-8").decode(head.subarray(30, 30 + nameLen));
    const dataOffset = offset + 30 + nameLen + extraLen;
    entries.push({ name, dataOffset, compressedSize });
    offset = dataOffset + compressedSize;
  }
  return entries;
}

function entryYear(name: string): number {
  const m = name.match(/(\d{4})/);
  return m ? Number(m[1]) : Number.NaN;
}

function pickLatestEntry(entries: ZipEntry[]): ZipEntry | undefined {
  const csvs = entries.filter((e) => e.name.toLowerCase().endsWith(".csv"));
  const pool = csvs.length > 0 ? csvs : entries;
  let best: ZipEntry | undefined;
  let bestYear = -Infinity;
  for (const e of pool) {
    const y = entryYear(e.name);
    const key = Number.isNaN(y) ? -1 : y;
    if (key > bestYear) {
      bestYear = key;
      best = e;
    }
  }
  return best;
}

// ── Partial raw-inflate ─────────────────────────────────────────────────────

async function inflatePartial(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];

  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
    } catch {
      // stream truncado no fim da janela — esperado
    }
  })();

  try {
    await writer.write(compressed);
    await writer.close();
  } catch {
    // close() pode reclamar do stream truncado — ignorável
  }
  await pump;

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

// ── CSV (";", aspas, CRLF/LF) ───────────────────────────────────────────────

function parseCsvSemicolon(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ";") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignora
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ── Normalização ────────────────────────────────────────────────────────────

function parseBrlToCents(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.trim();
  if (cleaned === "" || cleaned === "0" || cleaned === "0,00") return undefined;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Math.round(num * 100);
}

function parseDate(value: string | undefined): string {
  if (!value) return "";
  const s = value.trim();
  if (s === "") return "";
  const iso = s.includes(" ") ? s.replace(" ", "T") : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

interface Infracao {
  id: string;
  sourceId: string;
  infrator: string;
  cpfCnpj?: string;
  uf: string;
  municipio?: string;
  codigoIbge?: string;
  tipoInfracao: string;
  valorMultaCents?: number;
  data: string;
  descricao: string;
  numProcesso?: string;
}

function normalizeInfracoes(rows: string[][]): Infracao[] {
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const I = {
    seq: idx("SEQ_AUTO_INFRACAO"),
    nome: idx("NOME_INFRATOR"),
    cpfCnpj: idx("CPF_CNPJ_INFRATOR"),
    uf: idx("UF"),
    municipio: idx("MUNICIPIO"),
    codMun: idx("COD_MUNICIPIO"),
    tipo: idx("TIPO_INFRACAO"),
    desInfr: idx("DES_INFRACAO"),
    valor: idx("VAL_AUTO_INFRACAO"),
    data: idx("DAT_HORA_AUTO_INFRACAO"),
    desc: idx("DES_AUTO_INFRACAO"),
    proc: idx("NU_PROCESSO_FORMATADO"),
  };
  const at = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : undefined);

  const out: Infracao[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const id = clean(at(row, I.seq));
    if (id === "") continue;
    const tipo = clean(at(row, I.tipo)) || clean(at(row, I.desInfr));
    const cpfCnpj = clean(at(row, I.cpfCnpj));
    const municipio = clean(at(row, I.municipio));
    const codigoIbge = clean(at(row, I.codMun));
    const proc = clean(at(row, I.proc));
    const item: Infracao = {
      id,
      sourceId: SOURCE_ID,
      infrator: clean(at(row, I.nome)),
      uf: clean(at(row, I.uf)).toUpperCase(),
      tipoInfracao: tipo || "Não informado",
      data: parseDate(at(row, I.data)),
      descricao: clean(at(row, I.desc)),
    };
    if (cpfCnpj !== "") item.cpfCnpj = cpfCnpj;
    if (municipio !== "") item.municipio = municipio;
    if (codigoIbge !== "") item.codigoIbge = codigoIbge;
    const cents = parseBrlToCents(at(row, I.valor));
    if (cents !== undefined) item.valorMultaCents = cents;
    if (proc !== "") item.numProcesso = proc;
    out.push(item);
  }
  return out;
}

// ── HTTP handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const ufFilter = (url.searchParams.get("uf") ?? "").trim().toUpperCase();
  const limit = Number(url.searchParams.get("limit") ?? "") || 0;
  const window = Number(url.searchParams.get("window") ?? "") || DEFAULT_WINDOW;

  try {
    const collectedAt = new Date().toISOString();

    // 1) Acha a entrada do ano mais recente caminhando o ZIP.
    const entries = await listZipEntries();
    const latest = pickLatestEntry(entries);
    if (!latest) {
      // Degradação elegante: fonte respondeu mas sem CSV reconhecível.
      return new Response(
        JSON.stringify({
          ok: false,
          fonte: PORTAL,
          motivo: "Nenhuma entrada CSV encontrada no ZIP do IBAMA.",
          coletados: 0,
          ingested: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2) Infla a fatia inicial do ano mais recente.
    const windowEnd = latest.dataOffset + Math.min(window, latest.compressedSize) - 1;
    const compressed = await fetchRange(latest.dataOffset, windowEnd);
    const inflated = await inflatePartial(compressed);
    const text = new TextDecoder("utf-8").decode(inflated);

    // 3) Parse + normaliza (descarta a última linha, potencialmente truncada).
    const allRows = parseCsvSemicolon(text);
    const rows = allRows.length > 2 ? allRows.slice(0, -1) : allRows;

    const seen = new Set<string>();
    const items: Infracao[] = [];
    for (const it of normalizeInfracoes(rows)) {
      if (ufFilter && it.uf !== ufFilter) continue;
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push(it);
      if (limit > 0 && items.length >= limit) break;
    }

    // 4) Grava em lotes via a RPC.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_ambiental", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        fonte: PORTAL,
        arquivo: latest.name,
        ano: entryYear(latest.name),
        uf: ufFilter || null,
        coletados: items.length,
        ingested,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    // Degradação elegante: IBAMA inacessível/instável -> 502, pipeline segue,
    // a tela cai no empty state.
    return new Response(
      JSON.stringify({ ok: false, fonte: PORTAL, error: String(e), coletados: 0, ingested: 0 }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
});
