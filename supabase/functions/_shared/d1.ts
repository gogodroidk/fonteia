// Cliente compartilhado para o Cloudflare D1 (runtime Deno das Edge Functions).
//
// PORQUÊ
// ------
// O `d1-bridge` é o dono da MIGRAÇÃO Postgres → D1 e das consultas (/query,/stats).
// As funções de ingestão ON-DEMAND (ex.: ingest-brasilapi) precisam ESCREVER no
// mesmo D1 sem (a) duplicar a lógica REST do d1-bridge e (b) sem alterar o próprio
// d1-bridge (que está sob outro PR). Este módulo extrai só o necessário para
// gravar/ler entidades no D1: resolução de credenciais do Vault, executor
// parametrizado, garantia de schema e upsert em lote.
//
// SEGREDOS (lidos em RUNTIME, nunca no build), via RPC get_vault_secret (service-role):
//   CF_API_TOKEN   token Cloudflare com permissão D1 Edit. OBRIGATÓRIO.
//   CF_ACCOUNT_ID  id da conta Cloudflare. OBRIGATÓRIO.
// Se faltar qualquer um, resolveCfCreds devolve { missing: [...] } — o chamador
// degrada com honestidade (nunca crasha, nunca hardcoda).
//
// D1 REST API:
//   POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DB}/query
//   Header: Authorization: Bearer {CF_TOKEN}
//   Body:   {"sql":"...","params":[...]}   (sempre parametrizado — sem string-building)
//
// LIMITE DE BIND VARS: o D1 aceita no máximo 100 variáveis por statement. A tabela
// entities tem 11 colunas ⇒ no máximo 9 linhas por INSERT (9×11 = 99 < 100). Usamos
// ROWS_PER_INSERT = 8 (margem), exatamente como o d1-bridge.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// fonteia-data — mesmo banco usado pelo d1-bridge.
export const D1_DATABASE_ID = "417caa83-86dc-463e-8682-656cf938cd24";

// ≤ 8 tuplas/statement → 8×11 = 88 bind vars < 100 (limite do D1).
export const ROWS_PER_INSERT = 8;

// ───────────────────────────────────────────────────────────────────────────
// Vault / credenciais
// ───────────────────────────────────────────────────────────────────────────

function serviceClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Lê um segredo do Vault via RPC get_vault_secret (SECURITY DEFINER). Nunca lança. */
async function getVaultSecret(name: string): Promise<string | null> {
  const supa = serviceClient();
  if (!supa) return null;
  try {
    const { data, error } = await supa.rpc("get_vault_secret", { p_name: name });
    if (error) {
      console.error(`[d1] get_vault_secret(${name}) erro:`, error.message);
      return null;
    }
    const v = typeof data === "string" ? data.trim() : "";
    return v.length > 0 ? v : null;
  } catch (e) {
    console.error(`[d1] get_vault_secret(${name}) exceção:`, String(e));
    return null;
  }
}

export interface CfCreds {
  token: string;
  accountId: string;
}

/** Resolve token + account id do Vault. Retorna { missing:[...] } listando o que falta. */
export async function resolveCfCreds(): Promise<CfCreds | { missing: string[] }> {
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

// ───────────────────────────────────────────────────────────────────────────
// Executor REST
// ───────────────────────────────────────────────────────────────────────────

export class D1Error extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "D1Error";
  }
}

interface D1QueryResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}
interface D1ApiResponse<T = Record<string, unknown>> {
  result?: Array<D1QueryResult<T>>;
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
}

/** Executa UM statement parametrizado no D1 via REST. Lança D1Error em falha. */
export async function d1Query<T = Record<string, unknown>>(
  creds: CfCreds,
  sql: string,
  params: Array<string | number | null> = [],
): Promise<D1QueryResult<T>> {
  const url =
    `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/d1/database/${D1_DATABASE_ID}/query`;
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
    const detail = (body.errors ?? [])
      .map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim())
      .join("; ");
    const status = res.status === 401 || res.status === 403 ? res.status : 502;
    throw new D1Error(`D1 respondeu HTTP ${res.status}: ${detail || "erro desconhecido"}`, status);
  }

  const first = body.result?.[0];
  if (!first) throw new D1Error("D1 retornou resultado vazio (sem result[0]).", 502);
  return first;
}

// ───────────────────────────────────────────────────────────────────────────
// Schema (idempotente) — espelha EXATAMENTE o schema garantido pelo d1-bridge.
// ───────────────────────────────────────────────────────────────────────────
export async function ensureD1EntitiesSchema(creds: CfCreds): Promise<void> {
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
  await d1Query(creds, `CREATE INDEX IF NOT EXISTS idx_entities_kind ON entities(kind)`);
  await d1Query(creds, `CREATE INDEX IF NOT EXISTS idx_entities_cnpj ON entities(cnpj)`);
}

// ───────────────────────────────────────────────────────────────────────────
// Upsert de entidades em lote (INSERT OR REPLACE).
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

/** Linha de entidade no formato do D1 (todas as colunas JSON já serializadas em TEXT). */
export interface D1EntityInput {
  id: string;
  kind: string;
  name: string | null;
  normalized_name: string | null;
  cnpj: string | null;
  ibge_code: string | null;
  /** Objeto/array — será serializado para TEXT. */
  external_ids: unknown;
  /** Objeto/array — será serializado para TEXT. */
  attributes: unknown;
  /** Array de strings — será serializado para TEXT. */
  source_ids: unknown;
  /** ISO-8601. Se ausente, usa agora. */
  created_at?: string | null;
  /** ISO-8601. Se ausente, usa agora. */
  updated_at?: string | null;
}

function jsonText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function rowToParams(row: D1EntityInput, nowIso: string): Array<string | null> {
  return [
    row.id,
    row.kind,
    row.name ?? null,
    row.normalized_name ?? null,
    row.cnpj ?? null,
    row.ibge_code ?? null,
    jsonText(row.external_ids),
    jsonText(row.attributes),
    jsonText(row.source_ids),
    row.created_at ?? nowIso,
    row.updated_at ?? nowIso,
  ];
}

function buildInsert(
  rows: D1EntityInput[],
  nowIso: string,
): { sql: string; params: Array<string | null> } {
  const colList = COLUMNS.join(", ");
  const placeholderRow = `(${COLUMNS.map(() => "?").join(", ")})`;
  const valuesClause = rows.map(() => placeholderRow).join(", ");
  const sql = `INSERT OR REPLACE INTO entities (${colList}) VALUES ${valuesClause}`;
  const params: Array<string | null> = [];
  for (const r of rows) params.push(...rowToParams(r, nowIso));
  return { sql, params };
}

/**
 * Upsert idempotente de N entidades no D1, em sub-lotes de ROWS_PER_INSERT
 * (respeita o limite de 100 bind vars). Idempotente por `id` (INSERT OR REPLACE).
 * Garante o schema antes. Devolve quantas linhas foram enviadas.
 */
export async function upsertD1Entities(
  creds: CfCreds,
  rows: D1EntityInput[],
): Promise<number> {
  if (rows.length === 0) return 0;
  await ensureD1EntitiesSchema(creds);
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  let written = 0;
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + ROWS_PER_INSERT);
    const { sql, params } = buildInsert(chunk, nowIso);
    await d1Query(creds, sql, params);
    written += chunk.length;
  }
  return written;
}

/**
 * Retorna o subconjunto de CNPJs que JÁ existem como `company` no D1 (cache-first).
 * Usa um SELECT com IN parametrizado, em lotes de até 90 (limite de bind vars).
 * Nunca lança por lote: em erro, considera o lote como "não-cacheado" e segue.
 */
export async function existingCompanyCnpjs(
  creds: CfCreds,
  cnpjs: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  const uniq = [...new Set(cnpjs)];
  const BATCH = 90; // 1 placeholder por cnpj + kind fixo; bem abaixo de 100.
  for (let i = 0; i < uniq.length; i += BATCH) {
    const slice = uniq.slice(i, i + BATCH);
    const placeholders = slice.map(() => "?").join(", ");
    const sql =
      `SELECT cnpj FROM entities WHERE kind = 'company' AND cnpj IN (${placeholders})`;
    try {
      const res = await d1Query<{ cnpj: string | null }>(creds, sql, slice);
      for (const r of res.results ?? []) {
        if (r.cnpj) found.add(r.cnpj);
      }
    } catch (e) {
      // Tabela ainda não existe (primeira execução) ou erro transitório: trata o
      // lote como vazio (nada cacheado) — o pior caso é rebuscar, nunca perder dado.
      console.warn(`[d1] existingCompanyCnpjs lote falhou (assumindo vazio):`, String(e));
    }
  }
  return found;
}

/**
 * Top CNPJs por número de contratos no D1 (kind='public_contract'), excluindo o
 * placeholder de 14 zeros e CNPJs malformados. Usado pelo backfill de demonstração.
 * Devolve [] em qualquer falha (degrada com honestidade).
 */
export async function topContractCnpjs(creds: CfCreds, limit: number): Promise<string[]> {
  const lim = Math.min(Math.max(Math.floor(limit), 1), 200);
  const sql =
    `SELECT cnpj, count(*) AS n FROM entities ` +
    `WHERE kind = 'public_contract' AND cnpj IS NOT NULL ` +
    `AND length(cnpj) = 14 AND cnpj <> '00000000000000' ` +
    `GROUP BY cnpj ORDER BY n DESC LIMIT ?`;
  try {
    const res = await d1Query<{ cnpj: string | null; n: number }>(creds, sql, [lim]);
    return (res.results ?? [])
      .map((r) => (r.cnpj ?? "").trim())
      .filter((c) => c.length === 14);
  } catch (e) {
    console.error("[d1] topContractCnpjs falhou:", String(e));
    return [];
  }
}
