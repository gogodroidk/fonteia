// Supabase Edge Function: "ingest-ana-hidroweb"
// Ingestão do INVENTÁRIO DE ESTAÇÕES — ANA / HidroWeb (Rede Hidrometeorológica Nacional).
//
// ┌─ DUAS APIs, UMA ABERTA (FRÁGIL) E UMA BLOQUEADA POR CREDENCIAL ─────────────┐
// │ (A) LEGADO SOAP — ABERTO, sem chave, mas DESCONTINUADO:                      │
// │     telemetriaws1.ana.gov.br/serviceana.asmx                                 │
// │     Operação usada: HidroInventario (inventário de estações; aceita filtros  │
// │     por código/UF/bacia). Resposta = XML DiffGram (DataSet ADO.NET).         │
// │     >> ATENÇÃO: a ANA anunciou o fim deste serviço; a extensão final vai até │
// │        30/06/2026, já em base secundária (mais lenta/defasada). Tratar como  │
// │        FRÁGIL: pode sumir a qualquer momento depois disso.                   │
// │                                                                             │
// │ (B) NOVO REST — Hidro_Webservice — EXIGE CREDENCIAL QUE NÃO TEMOS:           │
// │     Acesso só mediante solicitação por e-mail a hidro@ana.gov.br             │
// │     ("Solicitação de acesso à API"), que devolve usuário/senha (token).      │
// │     Deixamos abaixo um SCAFFOLD comentado do fluxo (login -> token -> GET    │
// │     estações), pronto para quando a credencial existir no Vault              │
// │     (ANA_HIDRO_USER / ANA_HIDRO_PASSWORD ou ANA_HIDRO_TOKEN). NÃO inventamos │
// │     o endpoint exato: ele vem documentado junto com a credencial.            │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// FONTE / DOCS:
//   Portal HidroWeb:        https://www.snirh.gov.br/hidroweb/
//   Séries históricas:      https://www.snirh.gov.br/hidroweb/serieshistoricas
//   Web service legado:     https://telemetriaws1.ana.gov.br/serviceana.asmx
//
// NORMALIZAÇÃO -> entity kind 'environmental_area' (EnvironmentalAreaEntity do
//   domínio), attributes.areaType='water_risk'. Uma entity por ESTAÇÃO. id estável
//   = "ana:{codigoEstacao}". cnpj null; ibge_code = código IBGE do município quando
//   o inventário trouxer (o nome do campo varia entre versões; lemos defensivamente).
//
// GRAVAÇÃO via RPC public.ingest_ana_hidroweb (escreve source_runs + raw_records +
//   entities + evidence). Idempotente por external_ids->>'anaEstacaoId'.
//
// ORÇAMENTO DE TEMPO: o inventário completo é grande; por padrão filtramos por UF
//   (?uf=) ou por código (?codigo=) para caber em 150s. Sem filtro, baixamos o
//   inventário e aplicamos limit/offset locais com cursor nextOffset.
//
// SECRETS: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY injetados pelo Supabase.
//   (B) novo REST, quando existir: ANA_HIDRO_TOKEN ou ANA_HIDRO_USER/PASSWORD (Vault).
//   INGEST_CRON_SECRET (opcional). NENHUM segredo hardcoded.
//
// PARÂMETROS (query):
//   ?uf=SP                 (filtro por UF no inventário; recomendado)
//   ?codigo=00047000       (filtro por código de estação único)
//   ?limit=500             (estações por invocação; default 500, teto 1000)
//   ?offset=0              (cursor local de retomada; default 0)
//   ?api=legacy            (default; reservado para 'rest' quando houver credencial)
//
// Deploy: Verify JWT LIGADO (o cron/admin manda Authorization, igual às outras).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { digitsOnly } from "../_shared/br.ts";

const LEGACY_WS = "https://telemetriaws1.ana.gov.br/serviceana.asmx";
const PORTAL = "https://www.snirh.gov.br/hidroweb/";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const SOURCE_ID = "ana-hidroweb";

const RPC_NAME = "ingest_ana_hidroweb";
const RPC_BATCH = 200;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
const TIME_BUDGET_MS = 115_000;
const FETCH_TIMEOUT_MS = 25_000;

class UpstreamError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "UpstreamError";
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Parser leve de XML DiffGram do .asmx (sem libs externas) ──────────────────
// O HidroInventario devolve um DataSet ADO.NET. As linhas vêm como elementos
// <Table>...</Table> dentro do diffgram. Extraímos cada <Table> e seus filhos
// diretos como pares chave/valor (texto). É suficiente para o inventário, que é
// tabular e plano (sem aninhamento profundo por linha).

/** Extrai blocos <Tag>...</Tag> (não-aninhados do mesmo nome) de um XML. */
function extractBlocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  // Casa <Table ...> ... </Table> de forma não-gulosa; tolera atributos.
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1] ?? "");
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/** Converte os filhos diretos de um bloco <Table> em um objeto { campo: valor }. */
function blockToRecord(block: string): Record<string, string> {
  const rec: Record<string, string> = {};
  const re = /<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const key = m[1]!;
    const val = decodeXmlEntities((m[2] ?? "").trim());
    rec[key] = val;
  }
  return rec;
}

/** Lê um campo por nome normalizado (lower, sem _/espaço). */
function pickField(rec: Record<string, string>, candidates: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const index = new Map<string, string>();
  for (const [k, v] of Object.entries(rec)) index.set(norm(k), v);
  for (const c of candidates) {
    const v = index.get(norm(c));
    if (v !== undefined && v.trim() !== "") return v.trim();
  }
  return "";
}

// ── HidroInventario (legado SOAP via GET) ─────────────────────────────────────
// O serviceana.asmx aceita os parâmetros da operação por querystring no GET da
// própria operação (.asmx/HidroInventario?...). Parâmetros do inventário:
//   codEstDE, codEstATE (faixa de códigos), tpEst, nmEst, nmRio, codSubBacia,
//   codBacia, nmMunicipio, nmEstado, sgResp, sgOper, telemetrica.
// Para um filtro simples por UF usamos nmEstado; por código, codEstDE=codEstATE.

function buildInventarioUrl(opts: { uf: string; codigo: string }): string {
  const params = new URLSearchParams({
    codEstDE: opts.codigo || "",
    codEstATE: opts.codigo || "",
    tpEst: "",
    nmEst: "",
    nmRio: "",
    codSubBacia: "",
    codBacia: "",
    nmMunicipio: "",
    nmEstado: opts.uf || "",
    sgResp: "",
    sgOper: "",
    telemetrica: "",
  });
  return `${LEGACY_WS}/HidroInventario?${params.toString()}`;
}

interface NormalizedStation {
  id: string;
  name: string;
  ibgeCode: string;
  externalIds: Record<string, string>;
  attributes: Record<string, unknown>;
  sourceUrl: string;
  contentHash: string;
  raw: Record<string, string>;
}

async function normalizeStation(rec: Record<string, string>): Promise<NormalizedStation | null> {
  const codigo = pickField(rec, ["Codigo", "CodEstacao", "codigoestacao", "EstacaoCodigo"]);
  if (codigo === "") return null;
  const id = `ana:${codigo}`;

  const nome = pickField(rec, ["Nome", "NomeEstacao", "Estacao"]);
  const municipio = pickField(rec, ["nmMunicipio", "Municipio", "NomeMunicipio"]);
  const uf = pickField(rec, ["nmEstado", "Estado", "UF", "Uf"]);
  const rio = pickField(rec, ["nmRio", "Rio", "NomeRio"]);
  const bacia = pickField(rec, ["nmBacia", "Bacia", "NomeBacia"]);
  const tipo = pickField(rec, ["TipoEstacao", "tpEst", "Tipo"]);
  const lat = pickField(rec, ["Latitude", "lat"]);
  const lon = pickField(rec, ["Longitude", "lon", "long"]);
  const responsavel = pickField(rec, ["ResponsavelSigla", "sgResp", "Responsavel"]);
  const operadora = pickField(rec, ["OperadoraSigla", "sgOper", "Operadora"]);

  const ibgeRaw = pickField(rec, ["CodMunicipio", "MunicipioCodigo", "codMunicipioIbge", "nmMunicipioIbge"]);
  const ibge = digitsOnly(ibgeRaw);
  const ibgeCode = ibge.length === 7 ? ibge : "";

  const nameParts = [nome || `Estação ${codigo}`];
  if (municipio) nameParts.push(municipio);
  if (uf) nameParts.push(`(${uf})`);
  const name = nameParts.join(" ").trim();

  const attributes: Record<string, unknown> = {
    areaType: "water_risk",
    codigoEstacao: codigo,
    nome: nome || null,
    municipio: municipio || null,
    uf: uf || null,
    rio: rio || null,
    bacia: bacia || null,
    tipoEstacao: tipo || null,
    latitude: lat ? Number(lat.replace(",", ".")) : null,
    longitude: lon ? Number(lon.replace(",", ".")) : null,
    responsavel: responsavel || null,
    operadora: operadora || null,
  };

  const hashHex = await sha256Hex(JSON.stringify(rec));
  return {
    id,
    name: name.slice(0, 300),
    ibgeCode,
    externalIds: { anaEstacaoId: id, codigoEstacao: codigo },
    attributes,
    sourceUrl: PORTAL,
    contentHash: `sha256:${hashHex}`,
    raw: rec,
  };
}

async function fetchInventarioLegacy(uf: string, codigo: string): Promise<Record<string, string>[]> {
  const wfsUrl = buildInventarioUrl({ uf, codigo });
  const res = await fetchWithRetry(wfsUrl, {
    timeoutMs: FETCH_TIMEOUT_MS,
    retries: 3,
    backoffMs: 1000,
    init: { headers: { accept: "text/xml, application/xml", "user-agent": UA } },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new UpstreamError(`ANA serviceana respondeu ${res.status}: ${body.slice(0, 200)}`, res.status);
  }
  const xml = await res.text();
  const blocks = extractBlocks(xml, "Table");
  return blocks.map(blockToRecord).filter((r) => Object.keys(r).length > 0);
}

// =============================================================================
// SCAFFOLD — NOVO REST (Hidro_Webservice). NÃO IMPLEMENTADO: requer credencial.
// Quando ANA_HIDRO_TOKEN (ou ANA_HIDRO_USER/PASSWORD) existir no Vault e o
// endpoint vier documentado junto com a credencial, implementar aqui:
//   1. POST {base}/EstacaoTelemetrica/OAUth  com Authorization Basic user:pass
//      -> { items: { tokenautenticacao } }  (formato exato vem na doc da ANA)
//   2. GET  {base}/...estacoes...  com Authorization: Bearer <token>, paginado.
//   3. Normalizar para o MESMO shape de NormalizedStation e chamar a MESMA RPC.
// Mantido como função separada para deixar explícito o que falta. NÃO inventar.
// =============================================================================
function restNotImplemented(): never {
  throw new UpstreamError(
    "API REST nova da ANA (Hidro_Webservice) não implementada: requer credencial " +
      "(solicitar a hidro@ana.gov.br) e o endpoint documentado. Use ?api=legacy por ora.",
    501,
  );
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (cronSecret) {
    if (!hasValidBearerSecret(req, cronSecret)) {
      return jsonResponse({ ok: false, source: SOURCE_ID, error: "Unauthorized" }, { status: 401 }, req);
    }
  } else {
    console.warn("[ingest-ana-hidroweb] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const url = new URL(req.url);
  const api = (url.searchParams.get("api") ?? "legacy").trim().toLowerCase();
  const uf = (url.searchParams.get("uf") ?? "").trim().toUpperCase();
  const codigo = digitsOnly(url.searchParams.get("codigo") ?? "");
  const limitRaw = Number(url.searchParams.get("limit") ?? "");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_LIMIT) : DEFAULT_LIMIT;
  const offsetRaw = Number(url.searchParams.get("offset") ?? "");
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  const startedAt = Date.now();

  try {
    if (api === "rest") restNotImplemented(); // bloqueado por credencial (501 honesto)

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Coleta o inventário (legado). Recomenda-se filtrar por UF ou código.
    const all = await fetchInventarioLegacy(uf, codigo);
    const windowRecs = all.slice(offset, offset + limit);

    const items: NormalizedStation[] = [];
    const seen = new Set<string>();
    for (const rec of windowRecs) {
      const norm = await normalizeStation(rec);
      if (!norm || seen.has(norm.id)) continue;
      seen.add(norm.id);
      items.push(norm);
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    }

    const consumed = offset + items.length;
    const nextOffset = consumed < all.length ? consumed : null;

    let ingested = 0;
    const rpcErrors: Array<{ batch: number; error: string }> = [];
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH).map((it) => ({
        id: it.id,
        name: it.name,
        ibgeCode: it.ibgeCode,
        externalIds: it.externalIds,
        attributes: it.attributes,
        sourceUrl: it.sourceUrl,
        contentHash: it.contentHash,
        raw: it.raw,
      }));
      const { data, error } = await supabase.rpc(RPC_NAME, {
        p_payload: { collectedAt: new Date().toISOString(), uf: uf || null, items: batch },
      });
      if (error) {
        rpcErrors.push({ batch: Math.floor(i / RPC_BATCH), error: error.message });
        break;
      }
      ingested += typeof data === "number" ? data : batch.length;
    }

    const ok = rpcErrors.length === 0;
    return jsonResponse(
      {
        ok,
        source: SOURCE_ID,
        api: "legacy",
        aviso: "Web service legado SOAP da ANA descontinuado; extensão final até 30/06/2026.",
        uf: uf || null,
        codigo: codigo || null,
        totalInventario: all.length,
        coletados: windowRecs.length,
        normalizados: items.length,
        ingested,
        offset,
        nextOffset,
        errors: rpcErrors,
        elapsedMs: Date.now() - startedAt,
      },
      { status: ok ? 200 : 502 },
      req,
    );
  } catch (e) {
    const status = e instanceof UpstreamError ? e.status >= 500 ? 502 : e.status : 500;
    return jsonResponse(
      { ok: false, source: SOURCE_ID, error: String(e), elapsedMs: Date.now() - startedAt },
      { status },
      req,
    );
  }
});
