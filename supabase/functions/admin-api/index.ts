// Supabase Edge Function: "admin-api" — Painel do dono (RBAC).
//
// EXCLUSIVA DO ADMIN. verify_jwt=true no gateway garante um token de sessão válido;
// aqui dentro decodificamos o uid do JWT e confirmamos via is_admin() que o chamador
// é admin. Se não for, 403. Sendo admin, usamos a SERVICE_ROLE (injetada pelo
// Supabase) para ler/gerir tudo — sem nunca vazar segredo para o cliente.
//
// Rotas (todas POST/GET sob /admin-api):
//   GET  /admin-api/overview                  -> stats da plataforma
//   GET  /admin-api/users                     -> usuários + papel + acessos a módulos
//   POST /admin-api/set-role        { user_id, role }            -> troca papel
//   POST /admin-api/set-module-access { user_id, module_id, allowed } -> libera/bloqueia módulo
//
// Secrets/vars: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados pelo
// Supabase automaticamente — nada a configurar.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS + helper JSON (mesmo estilo das outras funções)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Auth: extrai o uid do JWT de sessão e confirma admin via is_admin()
// ---------------------------------------------------------------------------

function bearerToken(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

/**
 * Resolve o usuário a partir do token de sessão usando a service role (getUser
 * valida a assinatura do JWT no servidor de auth). Retorna o uid ou null.
 */
async function resolveUserId(admin: SupabaseClient, token: string): Promise<string | null> {
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

interface AuthUserRow {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

const VALID_ROLES = new Set(["user", "admin"]);

// ---------------------------------------------------------------------------
// Handlers de cada rota (já autenticadas como admin)
// ---------------------------------------------------------------------------

async function buildOverview(admin: SupabaseClient): Promise<Response> {
  // Contagem de entities por kind (1 query agregada).
  const entitiesByKind: Array<{ kind: string; count: number }> = [];
  {
    const { data, error } = await admin.rpc("admin_entities_by_kind");
    if (!error && Array.isArray(data)) {
      for (const row of data as Array<{ kind: string; count: number }>) {
        entitiesByKind.push({ kind: row.kind, count: Number(row.count) });
      }
    } else {
      // Fallback sem RPC: agrega no cliente lendo só a coluna kind.
      const { data: rows } = await admin.from("entities").select("kind");
      const tally = new Map<string, number>();
      for (const r of (rows ?? []) as Array<{ kind: string }>) {
        tally.set(r.kind, (tally.get(r.kind) ?? 0) + 1);
      }
      for (const [kind, count] of tally) entitiesByKind.push({ kind, count });
      entitiesByKind.sort((a, b) => b.count - a.count);
    }
  }

  const totalEntities = entitiesByKind.reduce((sum, r) => sum + r.count, 0);

  // Últimas coletas (source_runs).
  const { data: recentRuns } = await admin
    .from("source_runs")
    .select("id, source_id, status, started_at, finished_at, records_seen, records_inserted, error_message")
    .order("started_at", { ascending: false })
    .limit(12);

  // Fontes (status).
  const { data: sources } = await admin
    .from("sources")
    .select("id, name, status, reliability, modules")
    .order("id", { ascending: true });

  // Módulos (status).
  const { data: modules } = await admin
    .from("modules")
    .select("id, label, route, status, target_persona")
    .order("id", { ascending: true });

  // Totais de usuários (via Admin API, paginado).
  const { totalUsers, admins } = await countUsers(admin);

  // Contagens auxiliares baratas (head:true não traz linhas).
  const counts: Record<string, number> = {};
  for (const table of ["raw_records", "source_runs", "documents", "subscriptions", "user_alerts"]) {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true });
    counts[table] = count ?? 0;
  }

  return json({
    generatedAt: new Date().toISOString(),
    users: { total: totalUsers, admins },
    entities: { total: totalEntities, byKind: entitiesByKind },
    sources: sources ?? [],
    modules: modules ?? [],
    recentRuns: recentRuns ?? [],
    counts,
  });
}

async function countUsers(admin: SupabaseClient): Promise<{ totalUsers: number; admins: number }> {
  // Conta admins direto em profiles (rápido).
  const { count: admins } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin");
  // Total de usuários = total de profiles (1 por usuário, via trigger/backfill).
  const { count: totalUsers } = await admin.from("profiles").select("*", { count: "exact", head: true });
  return { totalUsers: totalUsers ?? 0, admins: admins ?? 0 };
}

async function listUsers(admin: SupabaseClient): Promise<Response> {
  // Lista auth.users via Admin API (paginado), enriquece com profile.role + acessos.
  const users: AuthUserRow[] = [];
  let page = 1;
  const perPage = 200;
  // Limite de segurança: até 10 páginas (2.000 usuários) por chamada.
  for (; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return json({ error: "Falha ao listar usuários.", detail: error.message }, 502);
    const batch = (data.users ?? []) as unknown as AuthUserRow[];
    users.push(...batch);
    if (batch.length < perPage) break;
  }

  const ids = users.map((u) => u.id);

  // Papéis (profiles).
  const roleById = new Map<string, string>();
  const fullNameById = new Map<string, string>();
  {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, role, full_name")
      .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
    for (const p of (profiles ?? []) as Array<{ id: string; role: string; full_name: string | null }>) {
      roleById.set(p.id, p.role);
      if (p.full_name) fullNameById.set(p.id, p.full_name);
    }
  }

  // Acessos a módulos (user_module_access).
  const accessByUser = new Map<string, Array<{ module_id: string; allowed: boolean }>>();
  {
    const { data: access } = await admin
      .from("user_module_access")
      .select("user_id, module_id, allowed")
      .in("user_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
    for (const a of (access ?? []) as Array<{ user_id: string; module_id: string; allowed: boolean }>) {
      const list = accessByUser.get(a.user_id) ?? [];
      list.push({ module_id: a.module_id, allowed: a.allowed });
      accessByUser.set(a.user_id, list);
    }
  }

  const result = users.map((u) => ({
    id: u.id,
    email: u.email ?? null,
    full_name:
      fullNameById.get(u.id) ??
      (typeof u.user_metadata?.["full_name"] === "string" ? (u.user_metadata["full_name"] as string) : null) ??
      (typeof u.user_metadata?.["name"] === "string" ? (u.user_metadata["name"] as string) : null),
    role: roleById.get(u.id) ?? "user",
    provider: (u.app_metadata?.["provider"] as string | undefined) ?? null,
    created_at: u.created_at ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    module_access: accessByUser.get(u.id) ?? [],
  }));

  // Lista de módulos para a UI montar os toggles.
  const { data: modules } = await admin
    .from("modules")
    .select("id, label, status")
    .order("id", { ascending: true });

  return json({ users: result, modules: modules ?? [], total: result.length });
}

async function setRole(
  admin: SupabaseClient,
  callerId: string,
  body: { user_id?: string; role?: string },
): Promise<Response> {
  const userId = (body.user_id ?? "").trim();
  const role = (body.role ?? "").trim();
  if (!userId || !VALID_ROLES.has(role)) {
    return json({ error: "Parâmetros inválidos: envie { user_id, role: 'user'|'admin' }." }, 400);
  }
  // Trava de segurança: o admin não pode rebaixar a si mesmo (evita ficar sem dono).
  if (userId === callerId && role !== "admin") {
    return json({ error: "Você não pode remover seu próprio acesso de administrador." }, 400);
  }

  const { data, error } = await admin
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id, email, role")
    .maybeSingle();

  if (error) return json({ error: "Falha ao atualizar o papel.", detail: error.message }, 502);
  if (!data) return json({ error: "Usuário não encontrado em profiles." }, 404);
  return json({ ok: true, profile: data });
}

async function setModuleAccess(
  admin: SupabaseClient,
  body: { user_id?: string; module_id?: string; allowed?: boolean },
): Promise<Response> {
  const userId = (body.user_id ?? "").trim();
  const moduleId = (body.module_id ?? "").trim();
  const allowed = body.allowed === true;
  if (!userId || !moduleId) {
    return json({ error: "Parâmetros inválidos: envie { user_id, module_id, allowed }." }, 400);
  }

  const { data, error } = await admin
    .from("user_module_access")
    .upsert(
      { user_id: userId, module_id: moduleId, allowed, updated_at: new Date().toISOString() },
      { onConflict: "user_id,module_id" },
    )
    .select("user_id, module_id, allowed")
    .maybeSingle();

  if (error) return json({ error: "Falha ao salvar o acesso ao módulo.", detail: error.message }, 502);
  return json({ ok: true, access: data });
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Função mal configurada (sem SUPABASE_URL/SERVICE_ROLE_KEY)." }, 500);
  }

  // Cliente com SERVICE ROLE (bypassa RLS) — usado SÓ após confirmar admin.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Identifica o chamador pelo token de sessão.
  const token = bearerToken(req);
  const callerId = await resolveUserId(admin, token);
  if (!callerId) {
    return json({ error: "Não autenticado." }, 401);
  }

  // 2) Confirma que é admin (is_admin executa como definer, ignora grants).
  const { data: isAdmin, error: adminErr } = await admin.rpc("is_admin", { uid: callerId });
  if (adminErr) {
    return json({ error: "Falha ao verificar permissão." }, 502);
  }
  if (isAdmin !== true) {
    return json({ error: "Acesso restrito ao administrador." }, 403);
  }

  // 3) Roteamento (sufixo da rota; tolera prefixo /admin-api).
  const { pathname } = new URL(req.url);
  const route = pathname.replace(/^\/admin-api/, "").replace(/\/+$/, "") || "/";

  try {
    if (req.method === "GET" && (route === "/overview" || route === "/")) {
      return await buildOverview(admin);
    }
    if (req.method === "GET" && route === "/users") {
      return await listUsers(admin);
    }
    if (req.method === "POST" && route === "/set-role") {
      const body = (await req.json().catch(() => ({}))) as { user_id?: string; role?: string };
      return await setRole(admin, callerId, body);
    }
    if (req.method === "POST" && route === "/set-module-access") {
      const body = (await req.json().catch(() => ({}))) as {
        user_id?: string;
        module_id?: string;
        allowed?: boolean;
      };
      return await setModuleAccess(admin, body);
    }
    return json({ error: "Rota não encontrada", path: route }, 404);
  } catch (error) {
    console.error("[admin-api] erro:", error);
    return json({ error: "Erro interno.", detail: String(error) }, 500);
  }
});
