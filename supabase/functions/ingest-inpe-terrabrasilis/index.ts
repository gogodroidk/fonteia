// Supabase Edge Function: "ingest-inpe-terrabrasilis"
// Ingestão de DESMATAMENTO — INPE TerraBrasilis (PRODES anual + DETER alertas).
//
// FONTE (pública, SEM auth, SEM chave) — WFS do GeoServer do TerraBrasilis:
//   Endpoint por workspace:  https://terrabrasilis.dpi.inpe.br/geoserver/{workspace}/wfs
//   Endpoint geral (OWS):    https://terrabrasilis.dpi.inpe.br/geoserver/ows
//   Docs WFS/paginação:      https://terrabrasilis.dpi.inpe.br/tag/wfs/
//                            https://terrabrasilis.dpi.inpe.br/wfs-getfeature-usando-paginacao-para-baixar-dados/
//
// REQUISIÇÃO WFS GetFeature (GeoJSON, paginada):
//   {wfs}?service=WFS&version=2.0.0&request=GetFeature
//        &typeName={layer}&outputFormat=application/json
//        &srsName=EPSG:4674&sortBy=gid&count={n}&startIndex={off}
//        [&CQL_FILTER=...]
//   Resposta GeoJSON: { type:"FeatureCollection", features:[ {id, properties:{...}} ],
//                       totalFeatures, numberMatched, numberReturned }
//
// POR QUE sortBy=gid: a paginação por startIndex SÓ é estável com ordenação
//   determinística. O TerraBrasilis recomenda ordenar por um atributo único (gid).
//
// DATASETS CURADOS (workspace + typeName). PRODES = polígonos anuais consolidados;
//   DETER = alertas recentes. Os nomes de layer variam por bioma e o INPE já os
//   renomeou no passado, então deixamos um catálogo explícito e permitimos
//   ?workspace=&typeName= manuais para qualquer outro layer publicado.
//     deter-amz      : alertas DETER Amazônia      (typeName padrão: deter_public)
//     deter-cerrado  : alertas DETER Cerrado       (typeName padrão: deter_cerrado)
//     prodes-amz     : PRODES Amazônia (anual)     (typeName: yearly_deforestation_biome)
//   Se um typeName mudar, a função devolve o erro WFS honesto (não 200 mentiroso).
//
// NORMALIZAÇÃO -> entity kind 'environmental_area' (EnvironmentalAreaEntity do
//   domínio), attributes.areaType='deforestation'. Geometria NÃO é persistida aqui
//   (a coluna geometry exige conversão GeoJSON->PostGIS na RPC; mantemos o bbox e
//   a área em attributes e guardamos o feature cru em raw_records). id estável =
//   "{dataset}:{gid|featureId}". cnpj sempre null; ibge_code quando o layer trouxer.
//
// GRAVAÇÃO via RPC public.ingest_terrabrasilis (escreve source_runs + raw_records
//   + entities + evidence), mesmo mecanismo das demais ingest-*. Enquanto a
//   migration 0022 não for aplicada, a RPC devolve erro honesto.
//
// IDEMPOTÊNCIA: id determinístico por feature + upsert por external_ids->>'terrabrasilisId'.
//   Reprocessar a mesma janela não duplica.
//
// ORÇAMENTO DE TEMPO: processamos uma janela LIMITADA (count) por invocação e
//   devolvemos nextStartIndex (cursor). O chamador repete com ?startIndex=...
//
// SECRETS: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY injetados pelo Supabase.
//   INGEST_CRON_SECRET (opcional). NENHUM segredo hardcoded.
//
// PARÂMETROS (query):
//   ?dataset=deter-amz|deter-cerrado|prodes-amz   (default deter-amz)
//   ?workspace=...&typeName=...   (sobrepõe o catálogo; para layers não curados)
//   ?count=500                    (features por invocação; default 500, teto 1000)
//   ?startIndex=0                 (cursor de retomada; default 0)
//   ?cql=...                      (CQL_FILTER opcional, ex.: "date>='2025-01-01'")
//   ?sortBy=gid                   (atributo único p/ paginação estável; default gid)
//
// Deploy: Verify JWT LIGADO (o cron/admin manda Authorization, igual às outras).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { digitsOnly } from "../_shared/br.ts";

const GEOSERVER = "https://terrabrasilis.dpi.inpe.br/geoserver";
const PORTAL = "https://terrabrasilis.dpi.inpe.br/";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const SOURCE_ID = "inpe-terrabrasilis";

const RPC_NAME = "ingest_terrabrasilis";
const RPC_BATCH = 200;
const DEFAULT_COUNT = 500;
const MAX_COUNT = 1000;
const TIME_BUDGET_MS = 115_000;
const FETCH_TIMEOUT_MS = 25_000;

// Catálogo curado dataset -> { workspace, typeName }. typeName pode mudar no INPE;
// mantemos defaults conhecidos e permitimos override por query.
const DATASETS: Record<string, { workspace: string; typeName: string; label: string }> = {
  "deter-amz": { workspace: "deter-amz", typeName: "deter_public", label: "DETER Amazônia" },
  "deter-cerrado": { workspace: "deter-cerrado", typeName: "deter_cerrado", label: "DETER Cerrado" },
  "prodes-amz": {
    workspace: "prodes-amazon-nb",
    typeName: "yearly_deforestation_biome",
    label: "PRODES Amazônia (anual)",
  },
};

class UpstreamError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "UpstreamError";
  }
}

// ── GeoJSON typing (defensivo) ────────────────────────────────────────────────

interface GeoFeature {
  type?: string;
  id?: string;
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
  bbox?: number[];
}
interface FeatureCollection {
  type?: string;
  features?: GeoFeature[];
  totalFeatures?: number | string;
  numberMatched?: number | string;
  numberReturned?: number;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Procura uma propriedade por nome normalizado (lower, sem _/espaço). */
function pickProp(props: Record<string, unknown>, candidates: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const index = new Map<string, unknown>();
  for (const [k, v] of Object.entries(props)) index.set(norm(k), v);
  for (const c of candidates) {
    const v = index.get(norm(c));
    const s = str(v);
    if (s !== "") return s;
  }
  return "";
}

function buildWfsUrl(opts: {
  workspace: string;
  typeName: string;
  count: number;
  startIndex: number;
  cql: string;
  sortBy: string;
}): string {
  const wfs = `${GEOSERVER}/${opts.workspace}/wfs`;
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: opts.typeName,
    outputFormat: "application/json",
    srsName: "EPSG:4674",
    // Ordenação determinística é obrigatória p/ paginação estável por startIndex.
    // 'gid' é o atributo único recomendado pelo INPE; layers que usem outra PK
    // podem sobrepor via ?sortBy=.
    sortBy: opts.sortBy,
    count: String(opts.count),
    startIndex: String(opts.startIndex),
  });
  if (opts.cql.trim() !== "") params.set("CQL_FILTER", opts.cql.trim());
  return `${wfs}?${params.toString()}`;
}

interface NormalizedArea {
  id: string;
  name: string;
  ibgeCode: string;
  externalIds: Record<string, string>;
  attributes: Record<string, unknown>;
  sourceUrl: string;
  contentHash: string;
  raw: GeoFeature;
}

async function normalizeFeature(
  feat: GeoFeature,
  ctx: { dataset: string; label: string; sourceUrl: string },
  pos: number,
): Promise<NormalizedArea | null> {
  const props = feat.properties ?? {};
  // gid é o identificador único recomendado pelo INPE para paginação.
  const gid = pickProp(props, ["gid", "fid", "id", "objectid"]) || str(feat.id) || String(pos);
  const id = `${ctx.dataset}:${gid}`;

  const municipio = pickProp(props, ["municipio", "nm_mun", "county", "name_muni"]);
  const uf = pickProp(props, ["uf", "estado", "state", "sigla_uf"]);
  const classe = pickProp(props, ["class_name", "classname", "classe", "main_class"]);
  const area = pickProp(props, ["area_km", "areamunkm", "area_ha", "areatotalk", "area"]);
  const data = pickProp(props, ["date", "view_date", "data", "ano", "year", "image_date"]);

  const ibgeRaw = pickProp(props, ["geocodigo", "cd_mun", "codigo_ibge", "cod_ibge", "geocod"]);
  const ibge = digitsOnly(ibgeRaw);
  const ibgeCode = ibge.length === 7 ? ibge : "";

  const nameParts = [ctx.label];
  if (municipio) nameParts.push(municipio);
  if (uf) nameParts.push(`(${uf})`);
  if (data) nameParts.push(`— ${data}`);
  const name = nameParts.join(" ").trim();

  const attributes: Record<string, unknown> = {
    areaType: "deforestation",
    dataset: ctx.dataset,
    fonte: ctx.label,
    municipio: municipio || null,
    uf: uf || null,
    classe: classe || null,
    areaKm: area || null,
    data: data || null,
    bbox: Array.isArray(feat.bbox) ? feat.bbox : null,
    geometryType: feat.geometry?.type ?? null,
    properties: props,
  };

  const hashHex = await sha256Hex(JSON.stringify(feat));

  return {
    id,
    name: name.slice(0, 300),
    ibgeCode,
    externalIds: { terrabrasilisId: id, dataset: ctx.dataset, gid },
    attributes,
    sourceUrl: ctx.sourceUrl,
    contentHash: `sha256:${hashHex}`,
    raw: feat,
  };
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
    console.warn("[ingest-inpe-terrabrasilis] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const url = new URL(req.url);
  const datasetKey = (url.searchParams.get("dataset") ?? "deter-amz").trim().toLowerCase();
  const known = DATASETS[datasetKey];

  const workspace = (url.searchParams.get("workspace") ?? known?.workspace ?? "").trim();
  const typeName = (url.searchParams.get("typeName") ?? known?.typeName ?? "").trim();
  const label = known?.label ?? typeName ?? datasetKey;

  if (!workspace || !typeName) {
    return jsonResponse(
      {
        ok: false,
        source: SOURCE_ID,
        error:
          `dataset "${datasetKey}" desconhecido. Use ?dataset=deter-amz|deter-cerrado|prodes-amz ` +
          `ou informe ?workspace=...&typeName=... explicitamente.`,
      },
      { status: 400 },
      req,
    );
  }

  const countRaw = Number(url.searchParams.get("count") ?? "");
  const count = Number.isFinite(countRaw) && countRaw > 0 ? Math.min(Math.floor(countRaw), MAX_COUNT) : DEFAULT_COUNT;
  const startRaw = Number(url.searchParams.get("startIndex") ?? "");
  const startIndex = Number.isFinite(startRaw) && startRaw > 0 ? Math.floor(startRaw) : 0;
  const cql = url.searchParams.get("cql") ?? "";
  const sortBy = (url.searchParams.get("sortBy") ?? "gid").trim() || "gid";

  const startedAt = Date.now();
  const wfsUrl = buildWfsUrl({ workspace, typeName, count, startIndex, cql, sortBy });
  // Link humano por dataset (página do TerraBrasilis); evidência aponta o portal.
  const sourceUrl = PORTAL;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const res = await fetchWithRetry(wfsUrl, {
      timeoutMs: FETCH_TIMEOUT_MS,
      retries: 3,
      backoffMs: 1000,
      init: { headers: { accept: "application/json", "user-agent": UA } },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new UpstreamError(`WFS respondeu ${res.status}: ${body.slice(0, 200)}`, res.status);
    }
    const fc = (await res.json()) as FeatureCollection;
    const features = Array.isArray(fc.features) ? fc.features : [];
    const totalMatched = Number(fc.numberMatched ?? fc.totalFeatures ?? NaN);

    const items: NormalizedArea[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < features.length; i++) {
      const norm = await normalizeFeature(features[i]!, { dataset: datasetKey, label, sourceUrl }, startIndex + i);
      if (!norm) continue;
      if (seen.has(norm.id)) continue;
      seen.add(norm.id);
      items.push(norm);
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    }

    // Cursor: se devolveu uma página cheia, há provavelmente mais.
    const consumed = startIndex + features.length;
    let nextStartIndex: number | null = null;
    if (features.length >= count) {
      if (!Number.isFinite(totalMatched) || consumed < totalMatched) nextStartIndex = consumed;
    }

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
        p_payload: { collectedAt: new Date().toISOString(), dataset: datasetKey, items: batch },
      });
      if (error) {
        rpcErrors.push({ batch: Math.floor(i / RPC_BATCH), error: error.message });
        break; // falha honesta (ex.: migration 0022 ausente); não duplica
      }
      ingested += typeof data === "number" ? data : batch.length;
    }

    const ok = rpcErrors.length === 0;
    return jsonResponse(
      {
        ok,
        source: SOURCE_ID,
        dataset: datasetKey,
        workspace,
        typeName,
        coletados: features.length,
        normalizados: items.length,
        ingested,
        totalMatched: Number.isFinite(totalMatched) ? totalMatched : null,
        startIndex,
        nextStartIndex,
        errors: rpcErrors,
        elapsedMs: Date.now() - startedAt,
      },
      { status: ok ? 200 : 502 },
      req,
    );
  } catch (e) {
    const status = e instanceof UpstreamError ? 502 : 500;
    return jsonResponse(
      { ok: false, source: SOURCE_ID, dataset: datasetKey, error: String(e), elapsedMs: Date.now() - startedAt },
      { status },
      req,
    );
  }
});
