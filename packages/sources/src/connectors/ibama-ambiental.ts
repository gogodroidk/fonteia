// Conector do IBAMA Dados Abertos — Autos de Infração ambiental (módulo Ambiental).
//
// Fonte oficial, aberta e anônima (sem auth, sem chave):
//   https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao
// O arquivo de dados é um ZIP único hospedado em Azure Blob (≈120 MB) contendo
// UMA planilha CSV por ano (auto_infracao_1977.csv … auto_infracao_2026.csv),
// codificada em UTF-8 e delimitada por ";".
//
// ── Por que não baixamos o ZIP inteiro ──────────────────────────────────────
// O CKAN do IBAMA NÃO expõe `datastore_search` (a action retorna 400 "Action
// name not known"), então não há API JSON paginada. O único formato é o ZIP de
// ~120 MB — grande demais para uma Edge Function bufferizar e descompactar
// (memória ~150 MB + limite de CPU). Porém o Blob suporta HTTP Range (206) e
// cada entrada do ZIP é um DEFLATE independente cujo cabeçalho local traz
// `compressedSize` (flags bit-3 = 0, sem data descriptor).
//
// ── Estratégia de amostragem recente (o que este conector faz) ──────────────
//   1. Caminha os local file headers via Range requests minúsculos (30 bytes +
//      nome), pulando os dados comprimidos por `compressedSize`. ~48 entradas.
//   2. Escolhe a entrada do ANO MAIS RECENTE (ex.: auto_infracao_2026.csv).
//   3. Faz UM Range request da fatia inicial do DEFLATE dessa entrada (alguns
//      MB) e descomprime via DecompressionStream("deflate-raw") até onde os
//      bytes permitirem — o erro de stream truncado é esperado e tratado; ficamos
//      com os primeiros milhares de autos de infração mais recentes.
//   4. Faz parse do CSV (UTF-8, ";"), normaliza e devolve registros estáveis.
//
// Idempotente: o id = SEQ_AUTO_INFRACAO (perene). Rodar de novo faz upsert.

import { fetchWithRetry } from "../internal/http";

export const IBAMA_BLOB_AUTO_INFRACAO_ZIP =
  "https://stibamadadosabertosprd.blob.core.windows.net/dados-abertos/dados/SIFISC/auto_infracao/auto_infracao/auto_infracao_csv.zip";

export const IBAMA_DATASET_URL =
  "https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao";

/** User-Agent honesto — não fingir navegador (espelha os outros conectores). */
export const IBAMA_USER_AGENT = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

/** Identificador da fonte gravado em cada item. */
export const IBAMA_SOURCE_ID = "ibama-dados-abertos";

const DEFAULT_HEADERS: Record<string, string> = {
  "user-agent": IBAMA_USER_AGENT,
};

// Quantos bytes COMPRIMIDOS da entrada do ano mais recente baixar e inflar.
// ~2 MB de DEFLATE rendem ~10 MB de CSV ≈ alguns milhares de linhas recentes —
// amostra honesta sem aproximar os 120 MB do arquivo completo.
const DEFAULT_COMPRESSED_WINDOW = 2_000_000;

// Limite de entradas a percorrer no diretório do ZIP (proteção contra loop).
const MAX_ZIP_ENTRIES = 200;

// Valor sentinela de ZIP64: compressedSize/uncompressedSize = 0xFFFFFFFF indica
// que o tamanho real está num campo extra ZIP64 (não parseado aqui).
const ZIP64_SENTINEL = 0xffffffff;

// ---------------------------------------------------------------------------
// Tipo normalizado — o que o produto lê (guardado em entities.attributes).
// Chave estável = SEQ_AUTO_INFRACAO.
// ---------------------------------------------------------------------------

export interface IbamaInfracao {
  /** Id estável = SEQ_AUTO_INFRACAO (como string). */
  id: string;
  sourceId: string;
  /** Nome do infrator (pessoa física ou jurídica). "" quando ausente. */
  infrator: string;
  /** CPF (mascarado pela fonte) ou CNPJ do infrator. undefined quando ausente. */
  cpfCnpj?: string | undefined;
  /** Sigla da UF (ex.: "SP"). "" quando ausente. */
  uf: string;
  /** Nome do município. "" quando ausente. */
  municipio?: string | undefined;
  /** Código IBGE do município (quando informado). */
  codigoIbge?: string | undefined;
  /** Tipo da infração (ex.: "Flora", "Fauna") — cai em DES_INFRACAO. */
  tipoInfracao: string;
  /** Valor da multa em CENTAVOS (inteiro). undefined quando não há multa. */
  valorMultaCents?: number | undefined;
  /** Data/hora do auto de infração em ISO com offset BRT (-03:00). */
  data: string;
  /** Descrição livre do auto (DES_AUTO_INFRACAO). "" quando ausente. */
  descricao: string;
  /** Nº do processo formatado, útil para rastreio. */
  numProcesso?: string | undefined;
}

// ---------------------------------------------------------------------------
// Util: Range fetch
// ---------------------------------------------------------------------------

async function fetchRange(
  url: string,
  start: number,
  end: number,
  fetcher: typeof fetch | undefined,
): Promise<Uint8Array> {
  const res = await fetchWithRetry(url, {
    init: { headers: { ...DEFAULT_HEADERS, Range: `bytes=${start}-${end}` } },
    fetcher,
  });
  if (res.status !== 206 && res.status !== 200) {
    throw new Error(`IBAMA Blob respondeu ${res.status} em Range ${start}-${end}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// ZIP: percorre local file headers achando a entrada do ano mais recente.
// PK\x03\x04 = local file header. Layout (little-endian) a partir do offset:
//   0: sig(4) 4: ver(2) 6: flags(2) 8: method(2) 10: mtime(2) 12: mdate(2)
//   14: crc(4) 18: compressedSize(4) 22: uncompressedSize(4)
//   26: nameLen(2) 28: extraLen(2) 30: name(nameLen) extra(extraLen) data(...)
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  /** Offset absoluto do início dos dados comprimidos. */
  dataOffset: number;
  compressedSize: number;
  uncompressedSize: number;
}

function readU16(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}
function readU32(b: Uint8Array, o: number): number {
  // >>> 0 mantém como inteiro sem sinal de 32 bits.
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}

/** Caminha o ZIP por Range e lista as entradas (sem baixar os dados). */
export async function listZipEntries(
  url: string,
  fetcher?: typeof fetch,
): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  let offset = 0;
  for (let i = 0; i < MAX_ZIP_ENTRIES; i++) {
    // Cabeçalho fixo (30 bytes) + margem para o nome (até 256 bytes).
    const head = await fetchRange(url, offset, offset + 30 + 256 - 1, fetcher);
    if (head.length < 30) break;
    const sig = readU32(head, 0);
    if (sig !== 0x04034b50) break; // não é mais um local file header (chegou no central directory)
    const compressedSize = readU32(head, 18);
    const uncompressedSize = readU32(head, 22);
    const nameLen = readU16(head, 26);
    const extraLen = readU16(head, 28);
    const nameBytes = head.subarray(30, 30 + nameLen);
    const name = new TextDecoder("utf-8").decode(nameBytes);
    const dataOffset = offset + 30 + nameLen + extraLen;

    // fix #2b: guarda ZIP64 — se compressedSize for 0xFFFFFFFF (sentinela ZIP64)
    // ou 0 (data descriptor / entrada vazia), o offset calculado seria inválido.
    // Pulamos a entrada em vez de propagar um offset incorreto.
    if (compressedSize === ZIP64_SENTINEL || compressedSize === 0) {
      // Não podemos calcular o próximo offset com segurança; paramos a varredura.
      // A entrada pode ainda ser adicionada se precisarmos dela; como não
      // conseguimos pular, simplesmente interrompemos.
      break;
    }

    entries.push({ name, dataOffset, compressedSize, uncompressedSize });
    offset = dataOffset + compressedSize;
  }
  return entries;
}

/** Extrai o ano de "auto_infracao_2026.csv" -> 2026 (NaN se não casar).
 *
 * fix #2c: regex ancorada ao nome do arquivo para evitar falsos positivos em
 * paths com diretórios (ex.: "2024/auto_infracao_2026.csv").
 */
function entryYear(name: string): number {
  // Captura o ano do padrão "auto_infracao_AAAA.csv" (case-insensitive).
  const m = /auto_infracao_(\d{4})\.csv$/i.exec(name);
  return m ? Number(m[1]) : Number.NaN;
}

/** Escolhe a entrada CSV do ano mais recente. */
export function pickLatestEntry(entries: ZipEntry[]): ZipEntry | undefined {
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

// ---------------------------------------------------------------------------
// DEFLATE: infla uma fatia inicial (truncada) de um stream raw-deflate.
// DecompressionStream("deflate-raw") existe em Deno (Edge runtime) e em browsers
// modernos. Ao acabar os bytes a stream "trava"/erra — capturamos e ficamos com
// o que já saiu. Removemos a última linha (potencialmente parcial) depois.
// ---------------------------------------------------------------------------

export async function inflatePartial(compressed: Uint8Array): Promise<Uint8Array> {
  // fix #2a: tipar DecompressionStream sem `any` — usa `unknown` + narrowing.
  // `typeof DecompressionStream` só existe quando definido no runtime; usamos
  // `globalThis` para acessar sem erros de compilação em ambientes sem a Web API.
  type DecompressionStreamCtor = typeof DecompressionStream | undefined;
  const DS = (globalThis as Record<string, unknown>)["DecompressionStream"] as DecompressionStreamCtor;

  if (typeof DS !== "function") {
    throw new Error("DecompressionStream indisponível neste runtime (necessário deflate-raw).");
  }
  const ds = new DS("deflate-raw");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  const chunks: Uint8Array[] = [];
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(value as Uint8Array);
      }
    } catch {
      // Stream truncado no fim da janela — esperado; mantemos o que já lemos.
    }
  })();

  try {
    await writer.write(compressed);
    await writer.close();
  } catch {
    // close() pode reclamar do stream truncado — ignorável.
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

// ---------------------------------------------------------------------------
// CSV: parser tolerante (delimitador ";", aspas duplas, CRLF/LF). Suficiente
// para o IBAMA, que usa ";" e raramente cita aspas dentro dos campos.
// ---------------------------------------------------------------------------

export function parseCsvSemicolon(text: string): string[][] {
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
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ";") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignora; o \n seguinte fecha a linha
    } else {
      field += ch;
    }
  }
  // Última linha (se houver conteúdo pendente).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/**
 * "8000,00" / "107.000,50" -> centavos inteiros.
 *
 * fix #2e: "0,00" e "0" devolvem 0 (zero explícito), não undefined — só
 * devolve undefined para vazio/ausente (string vazia ou undefined).
 */
export function parseBrlToCents(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const cleaned = value.trim();
  if (cleaned === "") return undefined;
  // Remove separador de milhar "." e troca decimal "," por ".".
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return undefined;
  if (num < 0) return undefined;
  return Math.round(num * 100);
}

/**
 * "2026-01-02 12:02:27" -> ISO com offset BRT (-03:00).
 *
 * fix #2d: strings sem timezone são BRT, não UTC. Anexamos "-03:00" em vez de
 * deixar o construtor Date interpretar como UTC (que causaria desvio de 3h).
 * Devolve a string original se não parsear como data conhecida.
 */
function parseDate(value: string | undefined): string {
  if (!value) return "";
  const s = value.trim();
  if (s === "") return "";
  // "YYYY-MM-DD HH:MM:SS" (formato IBAMA) ou "YYYY-MM-DDTHH:MM:SS" -> BRT
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) {
    const iso = s.replace(" ", "T");
    // Já tem timezone? Mantém.
    if (/[zZ]$/.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso)) return iso;
    // Sem timezone: assume BRT (-03:00) — nunca interpreta como UTC.
    return `${iso}-03:00`;
  }
  // "YYYY-MM-DD" puro -> meia-noite BRT.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00-03:00`;
  return s;
}

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

/**
 * Converte as linhas cruas do CSV (com cabeçalho na primeira) em registros
 * normalizados. Linhas sem id são descartadas.
 */
export function normalizeInfracoes(rows: string[][]): IbamaInfracao[] {
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim());
  const idx = (name: string): number => header.indexOf(name);

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

  const at = (row: string[], i: number): string | undefined =>
    i >= 0 && i < row.length ? row[i] : undefined;

  const out: IbamaInfracao[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const id = clean(at(row, I.seq));
    if (id === "") continue;

    const tipo = clean(at(row, I.tipo)) || clean(at(row, I.desInfr));
    const cents = parseBrlToCents(at(row, I.valor));
    const cpfCnpj = clean(at(row, I.cpfCnpj));
    const municipio = clean(at(row, I.municipio));
    const codigoIbge = clean(at(row, I.codMun));
    const proc = clean(at(row, I.proc));

    out.push({
      id,
      sourceId: IBAMA_SOURCE_ID,
      infrator: clean(at(row, I.nome)),
      cpfCnpj: cpfCnpj === "" ? undefined : cpfCnpj,
      uf: clean(at(row, I.uf)).toUpperCase(),
      municipio: municipio === "" ? undefined : municipio,
      codigoIbge: codigoIbge === "" ? undefined : codigoIbge,
      tipoInfracao: tipo || "Não informado",
      valorMultaCents: cents,
      data: parseDate(at(row, I.data)),
      descricao: clean(at(row, I.desc)),
      numProcesso: proc === "" ? undefined : proc,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Orquestração de alto nível — o que a Edge Function chama.
// ---------------------------------------------------------------------------

export interface FetchInfracoesOptions {
  /** URL do ZIP (default: produção do IBAMA). */
  url?: string;
  /** Bytes comprimidos a baixar da entrada mais recente (default ~2 MB). */
  compressedWindow?: number;
  /** Teto de registros normalizados a devolver. */
  limit?: number;
  fetcher?: typeof fetch;
}

export interface FetchInfracoesResult {
  /** Nome da entrada lida (ex.: "auto_infracao_2026.csv"). */
  entryName: string;
  /** Ano inferido da entrada. */
  ano: number;
  infracoes: IbamaInfracao[];
}

/**
 * Busca uma amostra recente de autos de infração do IBAMA:
 * caminha o ZIP, escolhe o ano mais recente, infla a fatia inicial, faz parse e
 * normaliza. Lança erro se a fonte estiver inacessível (a Edge trata p/ empty).
 */
export async function fetchRecentInfracoes(
  options: FetchInfracoesOptions = {},
): Promise<FetchInfracoesResult> {
  const url = options.url ?? IBAMA_BLOB_AUTO_INFRACAO_ZIP;
  const window = options.compressedWindow ?? DEFAULT_COMPRESSED_WINDOW;
  const fetcher = options.fetcher;

  const entries = await listZipEntries(url, fetcher);
  const latest = pickLatestEntry(entries);
  if (!latest) {
    throw new Error("Nenhuma entrada CSV encontrada no ZIP do IBAMA.");
  }

  const windowEnd = latest.dataOffset + Math.min(window, latest.compressedSize) - 1;
  const compressed = await fetchRange(url, latest.dataOffset, windowEnd, fetcher);
  const inflated = await inflatePartial(compressed);
  const text = new TextDecoder("utf-8").decode(inflated);

  const allRows = parseCsvSemicolon(text);
  // Remove a última linha (provavelmente truncada pela janela), preservando o
  // cabeçalho mesmo se o conjunto for minúsculo.
  const rows = allRows.length > 2 ? allRows.slice(0, -1) : allRows;

  let infracoes = normalizeInfracoes(rows);
  if (typeof options.limit === "number" && options.limit > 0) {
    infracoes = infracoes.slice(0, options.limit);
  }

  return { entryName: latest.name, ano: entryYear(latest.name), infracoes };
}
