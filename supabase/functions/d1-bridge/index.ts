// Supabase Edge Function: "d1-bridge" — ponte Supabase Postgres → Cloudflare D1.
//
// PORQUÊ
// ------
// A tabela `public.entities` no Postgres tem ~169k linhas (excluindo auction_lot).
// Migrar tudo pelo cliente (ou pelo contexto de um agente) é inviável. Esta função
// faz a migração e serve as consultas 100% SERVER-SIDE: lê do Postgres em lotes
// (keyset, sem embedding/geometry), grava no D1 via REST API e expõe /query e /stats.
//
// AUTENTICAÇÃO (verify_jwt=false — gateway desligado; auth feita aqui dentro):
//   - Toda rota exige o header `apikey` = chave pública do projeto (mesmo padrão da
//     edge `fonteia`). Sem `apikey` válida ⇒ 401.
//   - /migrate é ADMIN: além da `apikey`, exige `Authorization: Bearer <segredo>`,
//     onde <segredo> = SUPABASE_SERVICE_ROLE_KEY (env do runtime) OU o Vault
//     `MIGRATE_SECRET`. Sem isso ⇒ 401. Nunca é público.
//   - /query e /stats são públicos (só `apikey`), somente leitura.
//
// SEGREDOS (lidos em RUNTIME, nunca no build):
//   Vault (via RPC get_vault_secret, cliente service-role):
//     CF_API_TOKEN    token Cloudflare com permissão D1 Edit. OBRIGATÓRIO p/ tudo
//                     que toca o D1. Se faltar ⇒ 503 honesto (não crasha).
//     CF_ACCOUNT_ID   id da conta Cloudflare. OBRIGATÓRIO (o account id não pôde ser
//                     descoberto pelos MCPs nem está no repo). Se faltar ⇒ 503 honesto.
//     MIGRATE_SECRET  (opcional) segredo alternativo p/ autorizar /migrate.
//   Env do runtime (já injetados pelo Supabase):
//     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — p/ ler o Postgres e o Vault.
//
// D1 REST API:
//   POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DB}/query
//   Header: Authorization: Bearer {CF_TOKEN}
//   Body:   {"sql":"...","params":[...]}   (statements parametrizados — sem string-building)

import { createClient } from "jsr:@supabase/supabase-js@2";

const D1_DATABASE_ID = "417caa83-86dc-463e-8682-656cf938cd24"; // fonteia-data

// Chave pública do projeto (idêntica à usada na edge `fonteia`). Pública por design.
const PUBLISHABLE_KEY = "sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
  "access-control-max-age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Cliente service-role (lê Postgres + Vault). Criado uma vez por isolate.
// ───────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function serviceClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Lê um segredo do Vault via RPC get_vault_secret (SECURITY DEFINER). Devolve a
// string ou null (segredo ausente / RPC indisponível). Nunca lança.
async function getVaultSecret(name: string): Promise<string | null> {
  const supa = serviceClient();
  if (!supa) return null;
  try {
    const { data, error } = await supa.rpc("get_vault_secret", { p_name: name });
    if (error) {
      console.error(`[d1-bridge] get_vault_secret(${name}) erro:`, error.message);
      return null;
    }
    const v = typeof data === "string" ? data.trim() : "";
    return v.length > 0 ? v : null;
  } catch (e) {
    console.error(`[d1-bridge] get_vault_secret(${name}) exceção:`, String(e));
    return null;
  }
}

// Resolve as credenciais Cloudflare (token + account id) do Vault de uma só vez.
// Retorna { token, accountId } ou { missing: [...] } listando o que falta p/ 503.
interface CfCreds {
  token: string;
  accountId: string;
}
async function resolveCfCreds(): Promise<CfCreds | { missing: string[] }> {
  const [token, accountId] = await Promise.all([
    getVaultSecret("CF_API_TOKEN"),
    getVaultSecret("CF_ACCOUNT_ID"),
  ]);
  const missing: string[] = [];
  if (!token) missing.push("CF_API_TOKEN");
  if (!accountId) missing.push("CF_ACCOUNT_ID");
  if (missing.length > 0) return { missing };
  return { token: token!, accountId: accountId! };
}

function cfUnavailable(missing: string[]): Response {
  return json(
    {
      error: "d1_nao_configurado",
      message:
        "A ponte para o Cloudflare D1 ainda não foi ativada. Falta(m) o(s) segredo(s) no " +
        "Vault do Supabase. Cole-o(s) e tente de novo.",
      missing,
      hint: "Vault → New secret: " + missing.join(", "),
    },
    503,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// D1 REST client
// ───────────────────────────────────────────────────────────────────────────
interface D1QueryResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}
interface D1ApiResponse<T = Record<string, unknown>> {
  result?: Array<D1QueryResult<T>>;
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: unknown[];
}

class D1Error extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "D1Error";
  }
}

// Executa UM statement parametrizado no D1 via REST. Lança D1Error em falha.
// `params` são sempre strings (D1 REST aceita string/number/null); usamos string|null.
async function d1Query<T = Record<string, unknown>>(
  creds: CfCreds,
  sql: string,
  params: Array<string | number | null> = [],
): Promise<D1QueryResult<T>> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/d1/database/${D1_DATABASE_ID}/query`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${creds.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    });
  } catch (e) {
    throw new D1Error(`Falha de rede ao chamar o D1: ${String(e)}`, 502);
  }

  let body: D1ApiResponse<T>;
  try {
    body = (await res.json()) as D1ApiResponse<T>;
  } catch {
    throw new D1Error(`Resposta não-JSON do D1 (HTTP ${res.status}).`, 502);
  }

  if (!res.ok || !body.success) {
    const detail = (body.errors ?? []).map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim()).join("; ");
    // 401/403 do CF → credencial inválida; trate como 503 (config) p/ o /migrate; 502 nas leituras.
    const status = res.status === 401 || res.status === 403 ? res.status : 502;
    throw new D1Error(`D1 respondeu HTTP ${res.status}: ${detail || "erro desconhecido"}`, status);
  }

  const first = body.result?.[0];
  if (!first) {
    throw new D1Error("D1 retornou resultado vazio (sem result[0]).", 502);
  }
  return first;
}

// Garante o schema `entities` no D1 (idempotente). Espelha exatamente o schema alvo.
async function ensureD1Schema(creds: CfCreds): Promise<void> {
  await d1Query(
    creds,
    `CREATE TABLE IF NOT EXISTS entities (
       id TEXT PRIMARY KEY,
       kind TEXT,
       name TEXT,
       normalized_name TEXT,
       cnpj TEXT,
       ibge_code TEXT,
       external_ids TEXT,
       attributes TEXT,
       source_ids TEXT,
       created_at TEXT,
       updated_at TEXT
     )`,
  );
  // Índices p/ as consultas de /query (kind, cnpj exatos). Idempotentes.
  await d1Query(creds, `CREATE INDEX IF NOT EXISTS idx_entities_kind ON entities(kind)`);
  await d1Query(creds, `CREATE INDEX IF NOT EXISTS idx_entities_cnpj ON entities(cnpj)`);
}

// ───────────────────────────────────────────────────────────────────────────
// Transformação Postgres → D1 (espelha scripts/migrate-entities-to-d1.mjs)
//   external_ids / attributes (jsonb) → JSON.stringify → TEXT
//   source_ids (text[])               → JSON array string → TEXT
//   created_at / updated_at (tstz)    → ISO-8601 UTC 'Z' (sem ms)
//   id (uuid)                          → string
// ───────────────────────────────────────────────────────────────────────────
const COLUMNS = [
  "id",
  "kind",
  "name",
  "normalized_name",
  "cnpj",
  "ibge_code",
  "external_ids",
  "attributes",
  "source_ids",
  "created_at",
  "updated_at",
] as const;

interface EntityRow {
  id: string;
  kind: string | null;
  name: string | null;
  normalized_name: string | null;
  cnpj: string | null;
  ibge_code: string | null;
  external_ids: unknown;
  attributes: unknown;
  source_ids: unknown;
  created_at: string | null;
  updated_at: string | null;
}

function jsonOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value; // supabase-js já entrega jsonb como objeto; string ⇒ assume JSON válido
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function arrayAsJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "string") {
    // supabase-js pode entregar text[] como string "{a,b}". Converte p/ array JSON.
    const inner = value.replace(/^\{|\}$/g, "");
    if (inner.trim() === "") return JSON.stringify([]);
    const parts = inner.split(",").map((s) => s.replace(/^"|"$/g, ""));
    return JSON.stringify(parts);
  }
  return JSON.stringify([value]);
}

function tsUtcOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Converte uma linha do Postgres na tupla de params (ordem de COLUMNS) p/ o D1.
function rowToParams(row: EntityRow): Array<string | null> {
  return [
    row.id != null ? String(row.id) : null,
    row.kind ?? null,
    row.name ?? null,
    row.normalized_name ?? null,
    row.cnpj ?? null,
    row.ibge_code ?? null,
    jsonOrNull(row.external_ids),
    jsonOrNull(row.attributes),
    arrayAsJson(row.source_ids),
    tsUtcOrNull(row.created_at),
    tsUtcOrNull(row.updated_at),
  ];
}

// Monta um INSERT OR REPLACE parametrizado p/ N linhas (≤ ROWS_PER_INSERT).
function buildInsert(rows: EntityRow[]): { sql: string; params: Array<string | null> } {
  const colList = COLUMNS.join(", ");
  const placeholderRow = `(${COLUMNS.map(() => "?").join(", ")})`;
  const valuesClause = rows.map(() => placeholderRow).join(", ");
  const sql = `INSERT OR REPLACE INTO entities (${colList}) VALUES ${valuesClause}`;
  const params: Array<string | null> = [];
  for (const r of rows) params.push(...rowToParams(r));
  return { sql, params };
}

// ───────────────────────────────────────────────────────────────────────────
// Constantes de migração
// ───────────────────────────────────────────────────────────────────────────
const PG_PAGE_SIZE = 500; // linhas lidas por página do Postgres (keyset)
const ROWS_PER_INSERT = 8; // ≤ 8 tuplas/statement → 8×12=96 params < 100 (limite D1 bind vars)
const TIME_BUDGET_MS = 115_000; // para de iniciar novas páginas após isto (margem do limite ~150s)

// Autoriza /migrate: exige Bearer == SERVICE_ROLE_KEY (env) OU == Vault MIGRATE_SECRET.
async function isMigrateAuthorized(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;
  if (SERVICE_ROLE_KEY && token === SERVICE_ROLE_KEY) return true;
  const migrateSecret = await getVaultSecret("MIGRATE_SECRET");
  if (migrateSecret && token === migrateSecret) return true;
  return false;
}

// ───────────────────────────────────────────────────────────────────────────
// Rota /migrate (ADMIN). Lê do Postgres em lotes (keyset) e grava no D1.
// Query: ?after=<id>&maxBatches=<n>. Idempotente (INSERT OR REPLACE).
// ───────────────────────────────────────────────────────────────────────────
async function handleMigrate(request: Request, url: URL): Promise<Response> {
  if (!(await isMigrateAuthorized(request))) {
    return json(
      {
        error: "nao_autorizado",
        message:
          "Rota /migrate é restrita. Envie Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY> " +
          "(ou o segredo MIGRATE_SECRET do Vault).",
      },
      401,
    );
  }

  const supa = serviceClient();
  if (!supa) {
    return json(
      { error: "supabase_indisponivel", message: "SUPABASE_URL/SERVICE_ROLE_KEY ausentes no runtime." },
      503,
    );
  }

  const creds = await resolveCfCreds();
  if ("missing" in creds) return cfUnavailable(creds.missing);

  // Garante o schema no D1 antes de inserir (idempotente, barato).
  try {
    await ensureD1Schema(creds);
  } catch (e) {
    const status = e instanceof D1Error ? e.status : 502;
    return json({ error: "d1_schema_falhou", detail: String(e) }, status === 401 || status === 403 ? 503 : 502);
  }

  // Parâmetros de controle.
  const afterParam = url.searchParams.get("after");
  let lastId: string | null = afterParam && afterParam.trim() !== "" ? afterParam.trim() : null;
  const maxBatchesRaw = Number(url.searchParams.get("maxBatches"));
  const maxBatches = Number.isFinite(maxBatchesRaw) && maxBatchesRaw > 0 ? Math.floor(maxBatchesRaw) : Infinity;

  const startedAt = Date.now();
  let migrated = 0;
  let batches = 0;
  let done = false;

  const SELECT_COLS = COLUMNS.join(", ");

  try {
    while (batches < maxBatches) {
      // Margem de tempo: não inicia nova página se o orçamento estourou.
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;

      // Keyset: kind <> auction_lot AND id > lastId ORDER BY id LIMIT page.
      let q = supa
        .schema("public")
        .from("entities")
        .select(SELECT_COLS)
        .neq("kind", "auction_lot")
        .order("id", { ascending: true })
        .limit(PG_PAGE_SIZE);
      if (lastId) q = q.gt("id", lastId);

      const { data, error } = await q;
      if (error) {
        return json(
          { error: "leitura_postgres_falhou", detail: error.message, migrated, lastId, batches },
          502,
        );
      }
      const rows = (data ?? []) as unknown as EntityRow[];
      if (rows.length === 0) {
        done = true;
        break;
      }

      // Grava em sub-lotes de ROWS_PER_INSERT (≤8 tuplas/statement → ≤96 params) no D1.
      for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
        const chunk = rows.slice(i, i + ROWS_PER_INSERT);
        const { sql, params } = buildInsert(chunk);
        await d1Query(creds, sql, params);
      }

      migrated += rows.length;
      batches += 1;
      lastId = String(rows[rows.length - 1]!.id);

      // Página menor que o limite ⇒ acabou a tabela.
      if (rows.length < PG_PAGE_SIZE) {
        done = true;
        break;
      }
    }
  } catch (e) {
    const status = e instanceof D1Error ? e.status : 502;
    // Devolve o progresso parcial — o chamador retoma com ?after=lastId (idempotente).
    return json(
      {
        error: "migracao_interrompida",
        detail: String(e),
        migrated,
        lastId,
        batches,
        done: false,
        retryWith: lastId ? `?after=${lastId}` : "?",
      },
      status === 401 || status === 403 ? 503 : 502,
    );
  }

  // Estimativa do que ainda falta (contagem barata no Postgres a partir de lastId).
  let totalRemainingHint: number | null = null;
  try {
    let countQ = supa
      .schema("public")
      .from("entities")
      .select("id", { count: "exact", head: true })
      .neq("kind", "auction_lot");
    if (lastId) countQ = countQ.gt("id", lastId);
    const { count } = await countQ;
    totalRemainingHint = typeof count === "number" ? count : null;
    if (totalRemainingHint === 0) done = true;
  } catch {
    totalRemainingHint = null;
  }

  return json({
    migrated,
    lastId,
    done,
    batches,
    totalRemainingHint,
    elapsedMs: Date.now() - startedAt,
    nextCall: done ? null : `POST /d1-bridge/migrate?after=${lastId ?? ""}`,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Rota /query (público, só leitura). SELECT parametrizado no D1.
//   ?kind= (exato)  ?cnpj= (exato)  ?q= (name LIKE)  ?limit=1..100  ?offset=
// ───────────────────────────────────────────────────────────────────────────
const REPARSE_JSON_COLS = new Set(["external_ids", "attributes", "source_ids"]);

function reparseEntity(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const col of REPARSE_JSON_COLS) {
    const v = out[col];
    if (typeof v === "string" && v.length > 0) {
      try {
        out[col] = JSON.parse(v);
      } catch {
        // mantém a string crua se não for JSON válido
      }
    }
  }
  return out;
}

async function handleQuery(url: URL): Promise<Response> {
  const creds = await resolveCfCreds();
  if ("missing" in creds) return cfUnavailable(creds.missing);

  const kind = (url.searchParams.get("kind") ?? "").trim();
  const cnpj = (url.searchParams.get("cnpj") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();

  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 25;
  const offsetRaw = Number(url.searchParams.get("offset"));
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  const where: string[] = [];
  const params: Array<string | number | null> = [];
  if (kind !== "") {
    where.push("kind = ?");
    params.push(kind);
  }
  if (cnpj !== "") {
    where.push("cnpj = ?");
    params.push(cnpj);
  }
  if (q !== "") {
    // LIKE com escape de %/_ e wildcard nas pontas (busca por substring no name).
    const safe = q.replace(/[\\%_]/g, (m) => `\\${m}`);
    where.push("name LIKE ? ESCAPE '\\'");
    params.push(`%${safe}%`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const sql =
    `SELECT id, kind, name, normalized_name, cnpj, ibge_code, ` +
    `external_ids, attributes, source_ids, created_at, updated_at ` +
    `FROM entities ${whereClause} ORDER BY name LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  try {
    const result = await d1Query(creds, sql, params);
    const entities = (result.results ?? []).map(reparseEntity);
    return json({ count: entities.length, limit, offset, entities });
  } catch (e) {
    const status = e instanceof D1Error ? e.status : 502;
    if (status === 401 || status === 403) return cfUnavailable(["CF_API_TOKEN (inválido?)"]);
    console.error("[d1-bridge] query falhou:", String(e));
    return json({ error: "consulta_d1_falhou", message: "Falha ao consultar os dados." }, 502);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Rota /stats (público). Contagem por kind no D1.
// ───────────────────────────────────────────────────────────────────────────
async function handleStats(): Promise<Response> {
  const creds = await resolveCfCreds();
  if ("missing" in creds) return cfUnavailable(creds.missing);

  try {
    const result = await d1Query<{ kind: string | null; count: number }>(
      creds,
      `SELECT kind, count(*) AS count FROM entities GROUP BY kind ORDER BY count DESC`,
    );
    const byKind = result.results ?? [];
    const total = byKind.reduce((n, r) => n + (Number(r.count) || 0), 0);
    return json({ total, kinds: byKind });
  } catch (e) {
    const status = e instanceof D1Error ? e.status : 502;
    if (status === 401 || status === 403) return cfUnavailable(["CF_API_TOKEN (inválido?)"]);
    console.error("[d1-bridge] stats falhou:", String(e));
    return json({ error: "stats_d1_falhou", message: "Falha ao consultar as estatísticas." }, 502);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Roteador
// ───────────────────────────────────────────────────────────────────────────
Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Auth própria: exige a chave pública do projeto no header `apikey` (igual à edge fonteia).
  const apikey = (request.headers.get("apikey") ?? "").trim();
  if (apikey === "") {
    return json({ error: "apikey ausente" }, 401);
  }
  if (apikey !== PUBLISHABLE_KEY) {
    return json({ error: "apikey invalida" }, 401);
  }

  const url = new URL(request.url);
  const { pathname } = url;

  // /migrate — ADMIN, POST.
  if (pathname.endsWith("/migrate")) {
    if (request.method !== "POST") return json({ error: "use POST" }, 405);
    return await handleMigrate(request, url);
  }

  // /query — público, GET.
  if (pathname.endsWith("/query")) {
    if (request.method !== "GET") return json({ error: "use GET" }, 405);
    return await handleQuery(url);
  }

  // /stats — público, GET.
  if (pathname.endsWith("/stats")) {
    if (request.method !== "GET") return json({ error: "use GET" }, 405);
    return await handleStats();
  }

  // Health / raiz.
  if (pathname.endsWith("/health") || pathname.endsWith("/d1-bridge") || pathname === "/") {
    return json({
      service: "d1-bridge",
      status: "ok",
      d1Database: "fonteia-data",
      time: new Date().toISOString(),
      routes: ["POST /migrate (admin)", "GET /query", "GET /stats"],
    });
  }

  return json({ error: "Rota nao encontrada", path: pathname }, 404);
});
