import { PRODUCT_MODULES, type ModuleId } from "@fonteia/domain";
import { BILLING_PLANS, getBillingPlan, type BillingPlanId, type PlanQuotas } from "./plans";

export type ModuleAccess = "included" | "upgrade" | "custom";

export interface ModuleEntitlement {
  moduleId: ModuleId;
  moduleLabel: string;
  access: ModuleAccess;
  currentPlanId: BillingPlanId;
  recommendedPlanId?: BillingPlanId;
  reason: string;
}

export interface UsageSnapshot {
  searches?: number;
  aiAnswers?: number;
  dossiers?: number;
  alerts?: number;
  apiCalls?: number;
  seats?: number;
}

export interface UsageLimitResult {
  key: keyof UsageSnapshot;
  used: number;
  limit: number | "custom";
  status: "ok" | "near_limit" | "blocked" | "custom";
}

function isIncluded(planId: BillingPlanId, moduleId: ModuleId): boolean {
  return getBillingPlan(planId).includedModules.includes(moduleId);
}

function findRecommendedPlan(moduleId: ModuleId): BillingPlanId | undefined {
  return BILLING_PLANS.find((plan) => plan.id !== "free" && plan.includedModules.includes(moduleId))?.id;
}

export function getModuleEntitlement(planId: BillingPlanId, moduleId: ModuleId): ModuleEntitlement {
  const module = PRODUCT_MODULES.find((candidate) => candidate.id === moduleId);

  if (!module) {
    throw new Error(`Unknown module: ${moduleId}`);
  }

  if (isIncluded(planId, moduleId)) {
    return {
      moduleId,
      moduleLabel: module.label,
      access: "included",
      currentPlanId: planId,
      reason: "Modulo incluido no plano atual.",
    };
  }

  const recommendedPlanId = findRecommendedPlan(moduleId) ?? "corporativo";

  return {
    moduleId,
    moduleLabel: module.label,
    access: "upgrade",
    currentPlanId: planId,
    recommendedPlanId,
    reason: `Disponivel a partir do plano ${getBillingPlan(recommendedPlanId).name}.`,
  };
}

export function getPlanEntitlements(planId: BillingPlanId): ModuleEntitlement[] {
  return PRODUCT_MODULES.map((module) => getModuleEntitlement(planId, module.id));
}

export function canAccessModule(planId: BillingPlanId, moduleId: ModuleId): boolean {
  return getModuleEntitlement(planId, moduleId).access !== "upgrade";
}

function evaluateLimit(key: keyof UsageSnapshot, used: number, limit: number | "custom"): UsageLimitResult {
  if (limit === "custom") {
    return { key, used, limit, status: "custom" };
  }

  if (limit === 0 && used > 0) {
    return { key, used, limit, status: "blocked" };
  }

  if (limit > 0 && used >= limit) {
    return { key, used, limit, status: "blocked" };
  }

  if (limit > 0 && used / limit >= 0.7) {
    return { key, used, limit, status: "near_limit" };
  }

  return { key, used, limit, status: "ok" };
}

export function evaluateUsage(planId: BillingPlanId, usage: UsageSnapshot): UsageLimitResult[] {
  const quotas: PlanQuotas = getBillingPlan(planId).quotas;

  return [
    evaluateLimit("searches", usage.searches ?? 0, quotas.searchesPerMonth),
    evaluateLimit("aiAnswers", usage.aiAnswers ?? 0, quotas.aiAnswersPerMonth),
    evaluateLimit("dossiers", usage.dossiers ?? 0, quotas.dossiersPerMonth),
    evaluateLimit("alerts", usage.alerts ?? 0, quotas.alerts),
    evaluateLimit("apiCalls", usage.apiCalls ?? 0, quotas.apiCallsPerMonth),
    evaluateLimit("seats", usage.seats ?? 1, quotas.seats),
  ];
}
