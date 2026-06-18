// Supabase Edge Function: "ingest-inpi"
// Ingestao de MARCAS — INPI / RPI (Revista da Propriedade Industrial) (modulo INPI).
//
// Fonte (GRATIS, oficial): a RPI publica semanalmente um ZIP com UM XML por
// servico. Para Marcas o arquivo fica em:
//   https://revistas.inpi.gov.br/txt/RM<NUMERO>.zip   (ex.: RM2893.zip)
// Cada ZIP de marcas tem ~9 MB comprimido / ~49 MB de XML — NAO sao os 12 GB da
// base completa; e o boletim da semana (movimentacoes/despachos). Confirmado em
// 16/06/2026: revista 2893, layout `rpi_xml_marcas_versao_103`.
//
// Estrutura real do XML (confirmada baixando RM2893.xml):
//   <revista numero="2893" data="16/06/2026">
//     <processo numero="936904577" data-deposito="05/11/2024"
//               data-concessao="16/06/2026" data-vigencia="16/06/2036">
//       <despachos><despacho codigo="IPAS158" nome="Concessao de registro"/></despachos>
//       <titulares><titular nome-razao-social="..." pais="BR" uf="SP"/></titulares>
//       <marca apresentacao="Nominativa" natureza="Produtos e/ou Servico">
//         <nome>GRUPO AGROPARANA</nome></marca>
//       <lista-classe-nice>
//         <classe-nice codigo="29"><especificacao>...</especificacao><status>Deferida</status></classe-nice>
//       </lista-classe-nice>
//       <procurador>...</procurador>
//     </processo>
//   </revista>
//   Numero do processo = SEMPRE 9 digitos. Pode haver >1 <titular> e >1 <classe-nice>.
//
// BLOQUEADOR conhecido (honesto): o XML da RPI NAO traz CPF/CNPJ estruturado do
// titular — so `nome-razao-social`, `pais`, `uf`. A unica forma de obter CNPJ e
// extrair os 14 digitos QUANDO vierem embutidos no nome (caso comum de MEI/EI,
// ex.: "RICARDO ... 00390846120 ME" ou "55.538.443 MARGARETH ..."). Fazemos isso
// best-effort: quando da, gravamos entities.cnpj e a busca por CNPJ funciona;
// quando nao da, a marca entra com cnpj=null (ainda buscavel por nome no front).
//
// Estrategia (mesma do template ingest-ambiental — ZIP grande via HTTP Range):
//   1. O ZIP tem UMA entrada (RM<n>.xml) com general-purpose bit-3 setado, entao
//      compressedSize=0 no local header. dataOffset e fixo (72). Range-fetch da
//      fatia inicial (~3 MB comprimidos => ~15 MB de XML, ~8.800 <processo>).
//   2. Infla via DecompressionStream("deflate-raw") tolerando truncamento no fim
//      da janela (esperado), corta no ultimo </processo> completo.
//   3. Parseia cada <processo> por regex (sem DOM — streaming-friendly), normaliza
//      -> kind='trademark', grava em lotes via a RPC public.ingest_inpi.
//
// IMPORTANTE sobre retomada: DEFLATE e um bitstream continuo — NAO da para
// inflar a partir de um offset arbitrario no meio (testado: "invalid block
// type"). Entao SEMPRE inflamos do inicio do stream. Felizmente o arquivo
// inteiro (~9 MB comprimidos => ~49 MB XML, 29.522 processos) infla em <0.2s e
// cabe folgado no budget. O default ja varre o arquivo todo numa invocacao. Para
// links lentos, ?skip=<n> reprocessa do inicio (re-infla, barato) e pula os N
// primeiros processos ja gravados — a resposta devolve `nextSkip` quando o
// `limit` cortou antes do fim.
//
// Idempotente: id = numero do processo (9 digitos). A RPC faz upsert por indice
// unico parcial em (external_ids->>'processNumber') where kind='trademark'.
//
// Degradacao elegante: se o INPI estiver inacessivel/instavel, devolve
// { ok:false, ... } com 200/502 e NAO derruba o pipeline — a tela cai no estado
// pendente honesto.
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao injetados pelo Supabase.
//   INGEST_CRON_SECRET (opcional): se definido, exige Bearer correspondente.
//
// Parametros de query (opcionais):
//   ?revista=2893    -> forca o numero da revista (default: descobre a mais recente).
//   ?uf=SP           -> filtra (nesta funcao) so as marcas com titular daquela UF.
//   ?limit=40000     -> teto de processos normalizados nesta invocacao (default cobre tudo).
//   ?skip=0          -> pula os N primeiros <processo> (retomada por contagem).
//   ?window=12000000 -> bytes COMPRIMIDOS a baixar (default cobre o arquivo inteiro).
//
// Deploy: Verify JWT LIGADO (igual as outras); o invocador manda Authorization.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, fetchWithTimeout } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { extractCnpj, parseDateBrt } from "../_shared/br.ts";

const RPI_BASE = "https://revistas.inpi.gov.br/txt"; // RM<numero>.zip (marcas)
const PORTAL = "https://revistas.inpi.gov.br/rpi/";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const SOURCE_ID = "inpi-dados-abertos";

// O ZIP de marcas tem UMA entrada com bit-3 (data descriptor) setado, entao o
// dado deflate-raw comeca logo apos o local header. Confirmado: dataOffset = 72
// (30 fixos + nameLen=10 "RM####.xml" + extraLen=32). Calculamos dinamicamente
// pelo header de qualquer forma, com 72 como fallback.
const FALLBACK_DATA_OFFSET = 72;

// Default cobre o arquivo INTEIRO: o ZIP de marcas tem ~9.3 MB; pegamos uma
// janela generosa (12 MB) a partir do inicio do stream e inflamos tudo (~0.2s).
const DEFAULT_WINDOW = 12_000_000; // bytes comprimidos (>= filesize) => arquivo todo
const DEFAULT_LIMIT = 40_000; // teto de processos (a edicao tem ~29.5k; folga p/ crescer)
const RPC_BATCH = 500;

// Ancora conhecida para estimar a revista mais recente sem sondar centenas de
// numeros: a RPI publica ~1 edicao/semana. Em 16/06/2026 a edicao de marcas era
// a 2893. A descoberta parte de uma ESTIMATIVA por semanas decorridas (+folga) e
// caminha para baixo ate achar o primeiro RM<n>.zip que existe — tipicamente
// 1-3 requests. Limitamos o passo para nao varrer indefinidamente se a fonte cair.
const REVISTA_ANCHOR_NUMBER = 2893;
const REVISTA_ANCHOR_DATE_MS = Date.UTC(2026, 5, 16); // 2026-06-16 (mes 0-based)
const REVISTA_PROBE_LOOKAHEAD = 4; // edicoes acima da estimativa (folga)
const REVISTA_PROBE_MAX_STEPS = 30; // teto de requests na descoberta

// ── ZIP/Range helpers ─────────────────────────────────────────────────────────

function zipUrl(revista: number): string {
  return `${RPI_BASE}/RM${revista}.zip`;
}

function readU16(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}
function readU32(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}

async function fetchRange(url: string, start: number, end: number): Promise<Uint8Array> {
  const res = await fetchWithRetry(url, {
    init: { headers: { "user-agent": UA, Range: `bytes=${start}-${end}` } },
    timeoutMs: 20000,
    retries: 3,
    backoffMs: 1000,
  });
  if (res.status !== 206 && res.status !== 200) {
    throw new Error(`INPI/RPI respondeu ${res.status} em Range ${start}-${end} (${url})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Le o local file header e devolve o offset onde o dado deflate comeca. */
function dataOffsetFromHeader(head: Uint8Array): number {
  if (head.length < 30 || readU32(head, 0) !== 0x04034b50) return FALLBACK_DATA_OFFSET;
  const nameLen = readU16(head, 26);
  const extraLen = readU16(head, 28);
  return 30 + nameLen + extraLen;
}

/** true se RM<n>.zip existe (responde 206/200 a um Range minimo). */
async function revistaExists(n: number): Promise<boolean> {
  let res: Response;
  try {
    res = await fetchWithTimeout(zipUrl(n), {
      headers: { "user-agent": UA, Range: "bytes=0-0" },
    }, 12000);
  } catch {
    return false;
  }
  // drena o corpo (1 byte) para liberar a conexao
  try { await res.arrayBuffer(); } catch { /* ignore */ }
  return res.status === 206 || res.status === 200;
}

/**
 * Descobre a revista de marcas mais recente: estima o numero por semanas
 * decorridas desde a ancora (+folga) e caminha para baixo ate achar o primeiro
 * RM<n>.zip existente. ~1-3 requests no caso normal; teto de PROBE_MAX_STEPS.
 */
async function discoverLatestRevista(): Promise<number | null> {
  const weeks = Math.floor((Date.now() - REVISTA_ANCHOR_DATE_MS) / (7 * 24 * 3600 * 1000));
  // Estimativa pode estar a frente do que ja foi publicado; comecamos com folga
  // e descemos. Nunca abaixo da propria ancora (que sabemos existir).
  const start = Math.max(REVISTA_ANCHOR_NUMBER, REVISTA_ANCHOR_NUMBER + weeks + REVISTA_PROBE_LOOKAHEAD);
  for (let i = 0; i < REVISTA_PROBE_MAX_STEPS; i++) {
    const n = start - i;
    if (n < REVISTA_ANCHOR_NUMBER) break;
    if (await revistaExists(n)) return n;
  }
  // Ultimo recurso: a ancora conhecida (publicada em jun/2026).
  return (await revistaExists(REVISTA_ANCHOR_NUMBER)) ? REVISTA_ANCHOR_NUMBER : null;
}

// ── Partial raw-inflate (identico em espirito ao ingest-ambiental) ──────────────

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
    await writer.write(compressed.buffer as ArrayBuffer);
    await writer.close();
  } catch {
    // close() pode reclamar do stream truncado — ignoravel
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

// ── XML helpers (parse por regex, sem DOM) ──────────────────────────────────────

/** Decodifica as 5 entidades XML padrao (suficiente p/ atributos/textos da RPI). */
function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Le um atributo de uma tag (string da tag de abertura). "" se ausente. */
function attr(tag: string, name: string): string {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? decodeXmlEntities(m[1]!).trim() : "";
}

// ── Normalizacao ────────────────────────────────────────────────────────────

interface Trademark {
  id: string; // numero do processo (9 digitos)
  sourceId: string;
  processNumber: string;
  nome: string; // elemento nominativo da marca
  niceClasses: string[];
  status: string; // situacao derivada do despacho / status de classe
  titularNome: string; // primeiro titular (razao social)
  titularCnpj?: string; // 14 digitos QUANDO extraivel do nome; senao ausente
  titularUf?: string;
  apresentacao?: string; // Nominativa / Mista / Figurativa / ...
  natureza?: string;
  despachoCodigo?: string;
  despachoNome?: string;
  dataDeposito?: string;
  dataConcessao?: string;
  dataVigencia?: string;
  outrosTitulares?: string[];
  revista: number;
  collectedAt: string;
}

/**
 * Deriva um "status" legivel: prioriza o nome do despacho (a movimentacao da
 * semana, ex.: "Concessao de registro", "Deferimento do pedido"); se nao houver,
 * cai para o status da primeira classe-nice ("Deferida"/"Excluida"/...).
 */
function deriveStatus(despachoNome: string, classStatuses: string[]): string {
  if (despachoNome !== "") return despachoNome;
  const first = classStatuses.find((s) => s !== "");
  return first ?? "";
}

/**
 * Extrai os campos de um bloco <processo>...</processo>. Devolve null se o
 * numero do processo estiver ausente. Best-effort para CNPJ embutido no nome.
 */
function parseProcesso(block: string, revista: number, collectedAt: string): Trademark | null {
  const openTagMatch = /<processo\b[^>]*>/.exec(block);
  const openTag = openTagMatch ? openTagMatch[0] : "";
  const numero = attr(openTag, "numero");
  if (numero === "") return null;

  // marca / elemento nominativo
  const nomeMatch = /<nome>([\s\S]*?)<\/nome>/.exec(block);
  const nome = nomeMatch ? decodeXmlEntities(nomeMatch[1]!).trim() : "";
  const marcaTagMatch = /<marca\b[^>]*>/.exec(block);
  const marcaTag = marcaTagMatch ? marcaTagMatch[0] : "";

  // titulares (pode haver varios) — primeiro vira o principal
  const titulares: string[] = [];
  let ufPrincipal = "";
  const titRe = /<titular\b[^>]*>/g;
  for (let m = titRe.exec(block); m !== null; m = titRe.exec(block)) {
    const tag = m[0]!;
    const razao = attr(tag, "nome-razao-social");
    if (razao !== "") {
      titulares.push(razao);
      if (ufPrincipal === "") ufPrincipal = attr(tag, "uf");
    }
  }
  // fallback: alguns processos usam <requerente> em vez de <titular>
  if (titulares.length === 0) {
    const reqRe = /<requerente\b[^>]*>/g;
    for (let m = reqRe.exec(block); m !== null; m = reqRe.exec(block)) {
      const tag = m[0]!;
      const razao = attr(tag, "nome-razao-social");
      if (razao !== "") {
        titulares.push(razao);
        if (ufPrincipal === "") ufPrincipal = attr(tag, "uf");
      }
    }
  }
  const titularNome = titulares[0] ?? "";

  // CNPJ best-effort: tenta extrair 14 digitos de QUALQUER titular (caso MEI/EI).
  let titularCnpj: string | undefined;
  for (const t of titulares) {
    const cnpj = extractCnpj(t);
    if (cnpj) {
      titularCnpj = cnpj;
      break;
    }
  }

  // classes de Nice (codigos unicos, na ordem) + seus status
  const niceClasses: string[] = [];
  const classStatuses: string[] = [];
  const seenClass = new Set<string>();
  const classRe = /<classe-nice\b([^>]*)>([\s\S]*?)<\/classe-nice>/g;
  for (let m = classRe.exec(block); m !== null; m = classRe.exec(block)) {
    const codigo = attr(`<x ${m[1]!}>`, "codigo");
    if (codigo !== "" && !seenClass.has(codigo)) {
      seenClass.add(codigo);
      niceClasses.push(codigo);
    }
    const stMatch = /<status>([\s\S]*?)<\/status>/.exec(m[2]!);
    if (stMatch) classStatuses.push(decodeXmlEntities(stMatch[1]!).trim());
  }
  // forma auto-fechada: <classe-nice codigo="29"/>
  const classSelfRe = /<classe-nice\b([^>]*)\/>/g;
  for (let m = classSelfRe.exec(block); m !== null; m = classSelfRe.exec(block)) {
    const codigo = attr(`<x ${m[1]!}>`, "codigo");
    if (codigo !== "" && !seenClass.has(codigo)) {
      seenClass.add(codigo);
      niceClasses.push(codigo);
    }
  }

  // despacho (movimentacao da semana) — primeiro
  const despMatch = /<despacho\b([^>]*)\/?>/.exec(block);
  const despTag = despMatch ? `<x ${despMatch[1]!}>` : "";
  const despachoCodigo = attr(despTag, "codigo");
  const despachoNome = attr(despTag, "nome");

  const item: Trademark = {
    id: numero,
    sourceId: SOURCE_ID,
    processNumber: numero,
    nome,
    niceClasses,
    status: deriveStatus(despachoNome, classStatuses),
    titularNome,
    revista,
    collectedAt,
  };
  if (titularCnpj) item.titularCnpj = titularCnpj;
  if (ufPrincipal !== "") item.titularUf = ufPrincipal;
  const apresentacao = attr(marcaTag, "apresentacao");
  if (apresentacao !== "") item.apresentacao = apresentacao;
  const natureza = attr(marcaTag, "natureza");
  if (natureza !== "") item.natureza = natureza;
  if (despachoCodigo !== "") item.despachoCodigo = despachoCodigo;
  if (despachoNome !== "") item.despachoNome = despachoNome;
  const dep = parseDateBrt(attr(openTag, "data-deposito"));
  if (dep !== "") item.dataDeposito = dep;
  const conc = parseDateBrt(attr(openTag, "data-concessao"));
  if (conc !== "") item.dataConcessao = conc;
  const vig = parseDateBrt(attr(openTag, "data-vigencia"));
  if (vig !== "") item.dataVigencia = vig;
  if (titulares.length > 1) item.outrosTitulares = titulares.slice(1);

  return item;
}

/**
 * Quebra o XML (janela inflada, possivelmente truncada no fim) em <processo>
 * completos e normaliza. `skip` pula os N primeiros processos (retomada por
 * contagem); `uf` filtra pelo titular principal; `limit` corta o total coletado.
 *
 * `reachedEnd` indica que varremos ate o ultimo processo do arquivo (nao paramos
 * por `limit`) — usado p/ saber se ainda ha o que coletar numa proxima chamada.
 */
function parseWindow(
  xml: string,
  revista: number,
  collectedAt: string,
  uf: string,
  skip: number,
  limit: number,
): { items: Trademark[]; sawProcessos: number; reachedEnd: boolean } {
  const items: Trademark[] = [];
  const seen = new Set<string>();
  let sawProcessos = 0;
  let reachedEnd = true;

  const re = /<processo\b[\s\S]*?<\/processo>/g;
  for (let m = re.exec(xml); m !== null; m = re.exec(xml)) {
    const block = m[0]!;
    sawProcessos++;
    if (sawProcessos <= skip) continue; // retomada: pula os ja processados
    const item = parseProcesso(block, revista, collectedAt);
    if (!item) continue;
    if (uf && (item.titularUf ?? "").toUpperCase() !== uf) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (limit > 0 && items.length >= limit) {
      reachedEnd = false; // paramos por limit, pode haver mais
      break;
    }
  }
  return { items, sawProcessos, reachedEnd };
}

// ── HTTP handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // Defense-in-depth: se INGEST_CRON_SECRET estiver definido, exige Bearer.
  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (cronSecret) {
    if (!hasValidBearerSecret(req, cronSecret)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 }, req);
    }
  } else {
    console.warn("[ingest-inpi] INGEST_CRON_SECRET nao definido — funcao sem segredo de cron.");
  }

  const url = new URL(req.url);
  const ufFilter = (url.searchParams.get("uf") ?? "").trim().toUpperCase();
  const limit = Number(url.searchParams.get("limit") ?? "") || DEFAULT_LIMIT;
  const window = Number(url.searchParams.get("window") ?? "") || DEFAULT_WINDOW;
  const skip = Math.max(0, Number(url.searchParams.get("skip") ?? "") || 0);
  const revistaParam = Number(url.searchParams.get("revista") ?? "") || 0;

  try {
    const collectedAt = new Date().toISOString();

    // 1) Numero da revista: explicito ou descobre a mais recente.
    const revista = revistaParam > 0 ? revistaParam : await discoverLatestRevista();
    if (!revista) {
      return jsonResponse({
        ok: false,
        fonte: PORTAL,
        motivo: "Nenhuma revista de marcas (RM<n>.zip) disponivel no INPI no momento.",
        coletados: 0,
        ingested: 0,
      }, { status: 200 }, req);
    }
    const url0 = zipUrl(revista);

    // 2) Le o local header para achar o dataOffset real do deflate.
    const head = await fetchRange(url0, 0, 256 - 1);
    const baseOffset = dataOffsetFromHeader(head);

    // 3) Range-fetch SEMPRE do inicio do stream (DEFLATE nao permite retomar do
    // meio). A janela (default) cobre o arquivo inteiro; inflar tudo custa ~0.2s.
    const compStart = baseOffset;
    const compEnd = compStart + window - 1;
    const compressed = await fetchRange(url0, compStart, compEnd);
    const inflated = await inflatePartial(compressed);
    const xml = new TextDecoder("utf-8").decode(inflated);

    // 4) Parse + normaliza (so <processo> completos; o ultimo truncado e
    // descartado). `skip` pula os ja gravados em chamadas anteriores.
    const { items, sawProcessos, reachedEnd } = parseWindow(
      xml, revista, collectedAt, ufFilter, skip, limit,
    );

    // 5) Grava em lotes via a RPC.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_inpi", {
        p_payload: { collectedAt, revista, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    // 6) Sinaliza retomada por CONTAGEM: se paramos por `limit` antes do fim do
    // arquivo, a proxima chamada deve usar ?skip=<sawProcessos> (re-infla do
    // inicio — barato — e pula os ja processados). Senao, terminamos o arquivo.
    const nextSkip = reachedEnd ? null : sawProcessos;

    return jsonResponse({
      ok: true,
      fonte: PORTAL,
      arquivo: `RM${revista}.xml`,
      revista,
      uf: ufFilter || null,
      janelaBytes: compressed.length,
      processosVistos: sawProcessos,
      coletados: items.length,
      ingested,
      cnpjExtraidos: items.filter((i) => i.titularCnpj).length,
      skip,
      nextSkip,
      concluido: reachedEnd,
    }, {}, req);
  } catch (e) {
    // Degradacao elegante: INPI inacessivel/instavel -> 502, pipeline segue.
    return jsonResponse(
      { ok: false, fonte: PORTAL, error: String(e), coletados: 0, ingested: 0 },
      { status: 502 },
      req,
    );
  }
});
