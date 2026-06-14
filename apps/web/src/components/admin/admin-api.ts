// Cliente tipado da edge function `admin-api`.
//
// Todas as chamadas enviam o token da sessão (supabase.auth.getSession) no header
// Authorization. O gateway (verify_jwt=true) e a própria função revalidam que o
// chamador é admin — o front é só conveniência, a autorização é no servidor.

import { supabase } from "../../auth/supabase-client";

const FUNCTIONS_BASE = (() => {
  // Deriva a URL de functions a partir da URL do projeto Supabase.
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const base = typeof url === "string" && url.trim().length > 0
    ? url.trim()
    : "https://pwiuiihsyazghdsrpshg.supabase.co";
  return `${base.replace(/\/$/, "")}/functions/v1/admin-api`;
})();

// ─── Tipos da resposta ────────────────────────────────────────────────────────

export interface AdminEntityKind {
  kind: string;
  count: number;
}

export interface AdminSourceRow {
  id: string;
  source_id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  records_seen: number;
  records_inserted: number;
  error_message: string | null;
}

export interface AdminSource {
  id: string;
  name: string;
  status: string;
  reliability: string;
  modules: string[];
}

export interface AdminModule {
  id: string;
  label: string;
  route?: string;
  status: string;
  target_persona?: string;
}

export interface AdminOverview {
  generatedAt: string;
  users: { total: number; admins: number };
  entities: { total: number; byKind: AdminEntityKind[] };
  sources: AdminSource[];
  modules: AdminModule[];
  recentRuns: AdminSourceRow[];
  counts: Record<string, number>;
}

export interface AdminModuleAccess {
  module_id: string;
  allowed: boolean;
}

export interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "user" | "admin";
  provider: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  module_access: AdminModuleAccess[];
}

export interface AdminUsersResponse {
  users: AdminUser[];
  modules: Array<{ id: string; label: string; status: string }>;
  total: number;
}

// ─── Erro de API ──────────────────────────────────────────────────────────────

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) throw new AdminApiError("Supabase não configurado.", 0);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AdminApiError("Sessão expirada. Faça login novamente.", 401);
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${FUNCTIONS_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text };
  }
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Erro ${res.status}`) ?? `Erro ${res.status}`;
    throw new AdminApiError(message, res.status);
  }
  return body as T;
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

export function fetchOverview(): Promise<AdminOverview> {
  return request<AdminOverview>("/overview", { method: "GET" });
}

export function fetchUsers(): Promise<AdminUsersResponse> {
  return request<AdminUsersResponse>("/users", { method: "GET" });
}

export function setUserRole(userId: string, role: "user" | "admin"): Promise<{ ok: true }> {
  return request<{ ok: true }>("/set-role", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, role }),
  });
}

export function setModuleAccess(
  userId: string,
  moduleId: string,
  allowed: boolean,
): Promise<{ ok: true }> {
  return request<{ ok: true }>("/set-module-access", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, module_id: moduleId, allowed }),
  });
}
