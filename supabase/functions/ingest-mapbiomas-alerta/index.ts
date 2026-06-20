// Supabase Edge Function: "ingest-mapbiomas-alerta"
// Ingestão de ALERTAS DE DESMATAMENTO — MapBiomas Alerta (API GraphQL).
//
// ┌─ ESTADO: PRONTO, PORÉM BLOQUEADO POR CREDENCIAL ───────────────────────────┐
// │ A consulta de alertas na API do MapBiomas Alerta EXIGE login (não é         │
// │ anônima). O fluxo é: mutation signIn(email,password) -> token JWT, depois    │
// │ Authorization: Bearer <token> nas queries. NÃO temos credencial MapBiomas    │
// │ no Vault hoje. Esta função já implementa o fluxo completo; sem a credencial  │
// │ ela retorna { ok:false, blocked:true } HONESTO e NÃO grava run de sucesso.   │
// │                                                                             │
// │ O QUE FALTA PARA DEPLOY ÚTIL: provisionar no Supabase Vault                  │
// │   • MAPBIOMAS_EMAIL + MAPBIOMAS_PASSWORD  (preferido: a função faz signIn)   │
// │   • OU MAPBIOMAS_TOKEN                      (se já houver um token de longa   │
// │                                             duração emitido pela equipe)     │
// │ Credencial obtida em: https://plataforma.alerta.mapbiomas.org/ (cadastro).  │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// FONTE:
//   GraphQL endpoint: https://plataforma.alerta.mapbiomas.org/api/v2/graphql
//   Docs:             https://plataforma.alerta.mapbiomas.org/api
//   Atualização semanal. Resultado paginado (alerts.collection + pagination).
//
// QUERY (forma esperada; campos podem variar com a versão do schema — por isso a
//   query é uma constante editável e tratamos a resposta defensivamente):
//   query Alerts($p:Int,$pp:Int,$start:String,$end:String){
//     alerts(page:$p, perPage:$pp,
//            filters:{ detectedAfter:$start, detectedBefore:$end }){
//       collection {
//         id alertCode source detectedAt publishedAt areaHa
//         state municipality { name geocode } biome
//       }
//       metadata { totalCount totalPages currentPage }
//     }
//   }
//
// NORMALIZAÇÃO -> entity kind 'environmental_alert' (mesmo kind dos focos do INPE,
//   pois é um ALERTA pontual datado). attributes.areaType='deforestation'.
//   id estável = "mapbiomas:{alertId}". cnpj null; ibge_code = geocode do município.
//
// GRAVAÇÃO via RPC public.ingest_mapbiomas_alerta (escreve source_runs + raw_records
//   + entities + evidence). Idempotente por external_ids->>'mapbiomasAlertId'.
//
// ORÇAMENTO DE TEMPO: pagina por `page` até TIME_BUDGET_MS; devolve nextPage.
//
// SECRETS (lidos do Vault via RPC get_vault_secret; NUNCA hardcoded):
//   MAPBIOMAS_EMAIL / MAPBIOMAS_PASSWORD  ou  MAPBIOMAS_TOKEN.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY injetados pelo Supabase.
//   INGEST_CRON_SECRET (opcional).
//
// PARÂMETROS (query):
//   ?dataInicio=YYYY-MM-DD  (default: 14 dias atrás — alertas são semanais)
//   ?dataFim=YYYY-MM-DD     (default: hoje)
//   ?page=1                 (cursor; default 1)
//   ?perPage=100            (itens por página; default 100, teto 200)
//   ?maxPaginas=N           (teto de páginas por invocação; default 5)
//
// Deploy: Verify JWT LIGADO (o cron/admin manda Authorization, igual às outras).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { digitsOnly } from "../_shared/br.ts";

const GRAPHQL_URL = "https://plataforma.alerta.mapbiomas.org/api/v2/graphql";
const PORTAL = "https://plataforma.alerta.mapbiomas.org/";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const SOURCE_ID = "mapbiomas-alerta";

const RPC_NAME = "ingest_mapbiomas_alerta";
const RPC_BATCH = 200;
const DEFAULT_PER_PAGE = 100;
const MAX_PER_PAGE = 200;
const TIME_BUDGET_MS = 115_000;
const FETCH_TIMEOUT_MS = 25_000;

// Query de alertas. Mantida como constante para facilitar ajuste quando o schema
// do MapBiomas mudar (campos exatos podem variar entre versões).
const ALERTS_QUERY = `
query Alerts($page:Int,$perPage:Int,$start:String,$end:String){
  alerts(page:$page, perPage:$perPage, filters:{ detectedAfter:$start, detectedBefore:$end }){
    collection {
      id
      alertCode
      source
      detectedAt
      publishedAt
      areaHa
      biome
      state
      municipality { name geocode }
    }
    metadata { totalCount totalPages currentPage }
  }
}`.trim();

const SIGNIN_MUTATION = `
mutation SignIn($email:String!,$password:String!){
  signIn(email:$email, password:$password){ token }
}`.trim();

class UpstreamError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "UpstreamError";
  }
}
class BlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedError";
  }
}

async function getSecret(supabase: SupabaseClient, name: string): Promise<string | null> {
  try {
    const { data } = await supabase.rpc("get_vault_secret", { p_name: name });
    return typeof data === "string" && data.trim() !== "" ? data.trim() : null;
  } catch {
    return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── GraphQL helper ────────────────────────────────────────────────────────────

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

async function gql<T>(query: string, variables: Record<string, unknown>, token: string | null): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    "user-agent": UA,
  };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await fetchWithRetry(GRAPHQL_URL, {
    timeoutMs: FETCH_TIMEOUT_MS,
    retries: 2,
    backoffMs: 1000,
    init: { method: "POST", headers, body: JSON.stringify({ query, variables }) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new UpstreamError(`MapBiomas GraphQL respondeu ${res.status}: ${body.slice(0, 200)}`, res.status);
  }
  const json = (await res.json()) as GqlResponse<T>;
  if (json.errors && json.errors.length > 0) {
    throw new UpstreamError(`MapBiomas GraphQL erro: ${json.errors.map((e) => e.message).join("; ").slice(0, 300)}`, 502);
  }
  if (json.data === undefined) throw new UpstreamError("MapBiomas GraphQL sem data", 502);
  return json.data;
}

/** Obtém um token: usa MAPBIOMAS_TOKEN se houver; senão faz signIn com email/senha. */
async function obtainToken(supabase: SupabaseClient): Promise<string> {
  const direct = await getSecret(supabase, "MAPBIOMAS_TOKEN");
  if (direct) return direct;

  const email = await getSecret(supabase, "MAPBIOMAS_EMAIL");
  const password = await getSecret(supabase, "MAPBIOMAS_PASSWORD");
  if (!email || !password) {
    throw new BlockedError(
      "Credencial MapBiomas ausente no Vault. Provisione MAPBIOMAS_TOKEN, ou " +
        "MAPBIOMAS_EMAIL + MAPBIOMAS_PASSWORD. Cadastro: https://plataforma.alerta.mapbiomas.org/",
    );
  }
  const data = await gql<{ signIn?: { token?: string } }>(SIGNIN_MUTATION, { email, password }, null);
  const token = data.signIn?.token;
  if (!token) throw new UpstreamError("signIn não retornou token (credencial inválida?)", 401);
  return token;
}

// ── Tipos da resposta de alertas ─────────────────────────────────────────────

interface RawAlert {
  id?: number | string;
  alertCode?: string;
  source?: string;
  detectedAt?: string;
  publishedAt?: string;
  areaHa?: number;
  biome?: string;
  state?: string;
  municipality?: { name?: string; geocode?: string | number } | null;
}
interface AlertsResult {
  alerts?: {
    collection?: RawAlert[];
    metadata?: { totalCount?: number; totalPages?: number; currentPage?: number };
  };
}

interface NormalizedAlert {
  id: string;
  name: string;
  ibgeCode: string;
  externalIds: Record<string, string>;
  attributes: Record<string, unknown>;
  sourceUrl: string;
  contentHash: string;
  raw: RawAlert;
}

async function normalizeAlert(a: RawAlert): Promise<NormalizedAlert | null> {
  const alertId = String(a.id ?? a.alertCode ?? "").trim();
  if (alertId === "") return null;
  const id = `mapbiomas:${alertId}`;

  const muni = a.municipality?.name ?? "";
  const uf = a.state ?? "";
  const geocode = digitsOnly(String(a.municipality?.geocode ?? ""));
  const ibgeCode = geocode.length === 7 ? geocode : "";

  const detected = a.detectedAt ?? "";
  const nameParts = ["Alerta de desmatamento"];
  if (muni) nameParts.push(muni);
  if (uf) nameParts.push(`(${uf})`);
  if (detected) nameParts.push(`— ${detected.slice(0, 10)}`);
  const name = nameParts.join(" ").trim();

  const attributes: Record<string, unknown> = {
    areaType: "deforestation",
    alertCode: a.alertCode ?? alertId,
    fonteAlerta: a.source ?? null,
    detectedAt: a.detectedAt ?? null,
    publishedAt: a.publishedAt ?? null,
    areaHa: typeof a.areaHa === "number" ? a.areaHa : null,
    bioma: a.biome ?? null,
    municipio: muni || null,
    uf: uf || null,
    geocode: geocode || null,
  };

  const hashHex = await sha256Hex(JSON.stringify(a));
  return {
    id,
    name: name.slice(0, 300),
    ibgeCode,
    externalIds: { mapbiomasAlertId: id, alertCode: String(a.alertCode ?? alertId) },
    attributes,
    sourceUrl: PORTAL,
    contentHash: `sha256:${hashHex}`,
    raw: a,
  };
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    console.warn("[ingest-mapbiomas-alerta] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const url = new URL(req.url);
  const now = new Date();
  const dataInicio = url.searchParams.get("dataInicio") ?? ymd(new Date(now.getTime() - 14 * 86_400_000));
  const dataFim = url.searchParams.get("dataFim") ?? ymd(now);
  let page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const perPageRaw = Number(url.searchParams.get("perPage") ?? "");
  const perPage = Number.isFinite(perPageRaw) && perPageRaw > 0 ? Math.min(Math.floor(perPageRaw), MAX_PER_PAGE) : DEFAULT_PER_PAGE;
  const maxPaginas = Math.max(1, Number(url.searchParams.get("maxPaginas") ?? "5") || 5);

  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Credencial é obrigatória — sem ela, bloqueio HONESTO (não forja dado).
    const token = await obtainToken(supabase);

    const collectedAt = new Date().toISOString();
    let coletados = 0;
    let ingested = 0;
    let totalPages: number | null = null;
    let nextPage: number | null = null;
    let paginasFeitas = 0;
    const errors: Array<{ page: number; error: string }> = [];

    while (paginasFeitas < maxPaginas) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        nextPage = page;
        break;
      }

      let result: AlertsResult;
      try {
        result = await gql<AlertsResult>(
          ALERTS_QUERY,
          { page, perPage, start: dataInicio, end: dataFim },
          token,
        );
      } catch (e) {
        errors.push({ page, error: String(e) });
        break; // degradação elegante
      }

      const collection = result.alerts?.collection ?? [];
      const meta = result.alerts?.metadata ?? {};
      totalPages = typeof meta.totalPages === "number" ? meta.totalPages : totalPages;

      const items: NormalizedAlert[] = [];
      const seen = new Set<string>();
      for (const a of collection) {
        const norm = await normalizeAlert(a);
        if (!norm || seen.has(norm.id)) continue;
        seen.add(norm.id);
        items.push(norm);
      }
      coletados += items.length;

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
          p_payload: { collectedAt, page, items: batch },
        });
        if (error) {
          return jsonResponse(
            { ok: false, source: SOURCE_ID, error: `RPC ${RPC_NAME}: ${error.message}`, ingested, nextPage: page },
            { status: 502 },
            req,
          );
        }
        ingested += typeof data === "number" ? data : batch.length;
      }

      paginasFeitas += 1;
      // Para se a página veio vazia ou se já cobrimos todas as páginas conhecidas.
      if (collection.length === 0 || (totalPages !== null && page >= totalPages)) {
        nextPage = null;
        break;
      }
      page += 1;
      nextPage = page;
      await sleep(300);
    }

    return jsonResponse(
      {
        ok: errors.length === 0,
        source: SOURCE_ID,
        janela: { dataInicio, dataFim },
        coletados,
        ingested,
        totalPages,
        nextPage,
        errors,
        elapsedMs: Date.now() - startedAt,
      },
      {},
      req,
    );
  } catch (e) {
    // Bloqueio por credencial é um 200 com blocked:true (não é falha de pipeline,
    // é estado conhecido) — porém ok:false e SEM run de sucesso (a RPC nem rodou).
    if (e instanceof BlockedError) {
      return jsonResponse(
        {
          ok: false,
          blocked: true,
          source: SOURCE_ID,
          error: String(e),
          missingSecrets: ["MAPBIOMAS_TOKEN", "MAPBIOMAS_EMAIL", "MAPBIOMAS_PASSWORD"],
        },
        { status: 200 },
        req,
      );
    }
    const status = e instanceof UpstreamError ? 502 : 500;
    return jsonResponse(
      { ok: false, source: SOURCE_ID, error: String(e), elapsedMs: Date.now() - startedAt },
      { status },
      req,
    );
  }
});
