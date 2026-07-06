// Cliente tipado das RPCs de métricas do Painel do Dono.
//
// Estas RPCs (infra/migrations/0033_admin_metrics.sql) são SECURITY DEFINER e
// revalidam is_admin(auth.uid()) NO BANCO — o front é só conveniência, a
// autorização é server-side. Chamamos via o cliente Supabase autenticado
// (PostgREST /rpc), o MESMO padrão de source_health() em /sources.
//
// Resiliência: enquanto a migration 0033 não estiver aplicada, as RPCs não
// existem (PostgREST 404 / PGRST202). Em vez de quebrar o painel, traduzimos
// isso para um estado "pendente" — a UI mostra um aviso honesto ("backend
// pendente"), nunca um número inventado.

import { supabase } from "../../auth/supabase-client";

// ─── Sentinela de "RPC ainda não existe no banco" ───────────────────────────

/** Lançado quando a RPC não existe (migration 0033 não aplicada). */
export class AdminRpcMissingError extends Error {
  constructor(public rpc: string) {
    super(`RPC ${rpc} indisponível (migration 0033 pendente).`);
    this.name = "AdminRpcMissingError";
  }
}

/** Erro de permissão (não-admin chamou) — server respondeu 403/42501. */
export class AdminRpcForbiddenError extends Error {
  constructor() {
    super("Acesso restrito ao administrador.");
    this.name = "AdminRpcForbiddenError";
  }
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/** Heurística: a função não está definida no banco? (PostgREST PGRST202 / 404). */
function isMissingFunction(err: PostgrestLikeError | null): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "404" ||
    code === "42883" || // undefined_function
    msg.includes("could not find the function") ||
    msg.includes("does not exist")
  );
}

/** Heurística: gate is_admin recusou (errcode 42501 / forbidden). */
function isForbidden(err: PostgrestLikeError | null): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return code === "42501" || code === "403" || msg.includes("forbidden") || msg.includes("acesso restrito");
}

async function callRpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new AdminRpcMissingError(name);
  const { data, error } = await supabase.rpc(name, args ?? {});
  if (error) {
    if (isForbidden(error)) throw new AdminRpcForbiddenError();
    if (isMissingFunction(error)) throw new AdminRpcMissingError(name);
    throw new Error(error.message || `Falha ao chamar ${name}.`);
  }
  return data as T;
}

// ─── Planos/trial por usuário (RPC admin_list_plans; gate is_admin server-side) ──
export interface UserPlanRow {
  email: string;
  plan: string;
  status: string;
  trial: boolean;
  until: string | null;
}
/** Plano/trial efetivo de cada e-mail (janela vigente já resolvida no servidor). */
export function fetchUserPlans(): Promise<UserPlanRow[]> {
  return callRpc<UserPlanRow[]>("admin_list_plans");
}

// ─── Tipos de retorno ───────────────────────────────────────────────────────

export interface PlatformMetrics {
  generated_at: string;
  users: { total: number; admins: number; new_7d: number };
  subscriptions: { paying: number; past_due: number; trials: number; mrr_cents: number };
  usage: { lookups_30d: number; ai_hits_24h: number };
}

export interface SubscriptionSummaryRow {
  plan_id: string;
  status: string;
  total: number;
  next_renewal: string | null;
}

export interface RecentSubscription {
  id: string;
  email_masked: string;
  plan_id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  updated_at: string | null;
}

export interface UsageTypeRow {
  event_type: string;
  total: number;
}
export interface UsageModuleRow {
  module_id: string;
  total: number;
}
export interface UsageSummary {
  days: number;
  total_events: number;
  active_users: number;
  by_type: UsageTypeRow[];
  by_module: UsageModuleRow[];
}

export interface CouponOverviewRow {
  code: string;
  kind: string;
  trial_days: number;
  max_redemptions: number | null;
  redeemed_count: number;
  active_redemptions: number;
  active: boolean;
  expires_at: string | null;
  created_at: string | null;
}

export interface GrantTrialResult {
  ok: boolean;
  granted_until?: string;
  days?: number;
  message?: string;
  error?: string;
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

export function fetchPlatformMetrics(): Promise<PlatformMetrics> {
  return callRpc<PlatformMetrics>("admin_platform_metrics");
}

export function fetchSubscriptionsSummary(): Promise<SubscriptionSummaryRow[]> {
  return callRpc<SubscriptionSummaryRow[]>("admin_subscriptions_summary").then((rows) =>
    (rows ?? []).map((r) => ({ ...r, total: Number(r.total) })),
  );
}

export function fetchRecentSubscriptions(limit = 20): Promise<RecentSubscription[]> {
  return callRpc<RecentSubscription[]>("admin_recent_subscriptions", { p_limit: limit }).then(
    (rows) => rows ?? [],
  );
}

export function fetchUsageSummary(days = 30): Promise<UsageSummary> {
  return callRpc<UsageSummary>("admin_usage_summary", { p_days: days }).then((u) => ({
    days: Number(u.days),
    total_events: Number(u.total_events),
    active_users: Number(u.active_users),
    by_type: (u.by_type ?? []).map((r) => ({ ...r, total: Number(r.total) })),
    by_module: (u.by_module ?? []).map((r) => ({ ...r, total: Number(r.total) })),
  }));
}

export function fetchCouponsOverview(): Promise<CouponOverviewRow[]> {
  return callRpc<CouponOverviewRow[]>("admin_coupons_overview").then((rows) =>
    (rows ?? []).map((r) => ({
      ...r,
      redeemed_count: Number(r.redeemed_count),
      active_redemptions: Number(r.active_redemptions),
    })),
  );
}

export function grantTrial(userId: string, days = 7): Promise<GrantTrialResult> {
  return callRpc<GrantTrialResult>("admin_grant_trial", { p_user_id: userId, p_days: days });
}
