import {
  BILLING_PLANS,
  evaluateUsage,
  getBillingPlan,
  getPlanEntitlements,
  type BillingPlanId,
  type UsageSnapshot,
} from "@fonteia/billing";
import { jsonResponse, type ApiResponse, type RouteRequest } from "./types";

const planIds = new Set<BillingPlanId>(BILLING_PLANS.map((plan) => plan.id));

function parsePlanId(value: string | null): BillingPlanId {
  if (value && planIds.has(value as BillingPlanId)) {
    return value as BillingPlanId;
  }

  return "free";
}

function parseNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getBillingPlans(): ApiResponse<{ plans: typeof BILLING_PLANS }> {
  return jsonResponse({ plans: BILLING_PLANS });
}

export function getBillingEntitlements(
  request: RouteRequest,
): ApiResponse<{
  plan: ReturnType<typeof getBillingPlan>;
  modules: ReturnType<typeof getPlanEntitlements>;
  usage: ReturnType<typeof evaluateUsage>;
}> {
  const planId = parsePlanId(request.query.get("plan"));
  const usage: UsageSnapshot = {};
  const searches = parseNumber(request.query.get("searches"));
  const aiAnswers = parseNumber(request.query.get("aiAnswers"));
  const dossiers = parseNumber(request.query.get("dossiers"));
  const alerts = parseNumber(request.query.get("alerts"));
  const apiCalls = parseNumber(request.query.get("apiCalls"));
  const seats = parseNumber(request.query.get("seats"));

  if (searches !== undefined) usage.searches = searches;
  if (aiAnswers !== undefined) usage.aiAnswers = aiAnswers;
  if (dossiers !== undefined) usage.dossiers = dossiers;
  if (alerts !== undefined) usage.alerts = alerts;
  if (apiCalls !== undefined) usage.apiCalls = apiCalls;
  if (seats !== undefined) usage.seats = seats;

  return jsonResponse({
    plan: getBillingPlan(planId),
    modules: getPlanEntitlements(planId),
    usage: evaluateUsage(planId, usage),
  });
}
