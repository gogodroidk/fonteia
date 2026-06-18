import {
  BILLING_PLANS,
  evaluateUsage,
  getBillingPlan,
  getPlanEntitlements,
  type BillingPlanId,
  type UsageSnapshot,
} from "@fonteia/billing";
import { badRequest, jsonResponse, type ApiResponse, type RouteRequest } from "./types";

const planIds = new Set<BillingPlanId>(BILLING_PLANS.map((plan) => plan.id));

function isBillingPlanId(value: string): value is BillingPlanId {
  return planIds.has(value as BillingPlanId);
}

/**
 * Parse a self-reported plan id. Returns `null` for an explicitly invalid value
 * (so callers can reject with 400) and the default `"free"` only when absent.
 */
function parsePlanId(value: string | null): BillingPlanId | "invalid" | null {
  if (value === null || value === "") {
    return null;
  }

  return isBillingPlanId(value) ? value : "invalid";
}

/**
 * Parse a client-reported usage counter. Anything non-finite or negative is
 * dropped; finite values are clamped to a sane ceiling so a client cannot push
 * the evaluator into nonsensical territory. NOTE: these values are NOT
 * authoritative — they are echoed back as "reported by client".
 */
const MAX_REPORTED_USAGE = 1_000_000;

function parseReportedUsage(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return Math.min(Math.floor(parsed), MAX_REPORTED_USAGE);
}

export function getBillingPlans(): ApiResponse<{ plans: typeof BILLING_PLANS }> {
  return jsonResponse({ plans: BILLING_PLANS });
}

export function getBillingEntitlements(
  request: RouteRequest,
): ApiResponse<
  | {
      plan: ReturnType<typeof getBillingPlan>;
      planSource: "client_reported" | "default";
      modules: ReturnType<typeof getPlanEntitlements>;
      usage: {
        authoritative: false;
        source: "client_reported";
        note: string;
        snapshot: UsageSnapshot;
        evaluation: ReturnType<typeof evaluateUsage>;
      };
    }
  | { error: string }
> {
  const parsedPlan = parsePlanId(request.query.get("plan"));

  if (parsedPlan === "invalid") {
    return badRequest("Invalid plan id", { allowed: [...planIds] });
  }

  // The plan is client-reported here; until it is resolved from an
  // authenticated subscription record it MUST NOT be treated as authoritative.
  // We still default unauthenticated/absent callers to the most restrictive plan.
  const planId: BillingPlanId = parsedPlan ?? "free";
  const planSource = parsedPlan ? "client_reported" : "default";

  // Usage is informed by the client and clamped. It is never authoritative.
  const usage: UsageSnapshot = {};
  const searches = parseReportedUsage(request.query.get("searches"));
  const aiAnswers = parseReportedUsage(request.query.get("aiAnswers"));
  const dossiers = parseReportedUsage(request.query.get("dossiers"));
  const alerts = parseReportedUsage(request.query.get("alerts"));
  const apiCalls = parseReportedUsage(request.query.get("apiCalls"));
  const seats = parseReportedUsage(request.query.get("seats"));

  if (searches !== undefined) usage.searches = searches;
  if (aiAnswers !== undefined) usage.aiAnswers = aiAnswers;
  if (dossiers !== undefined) usage.dossiers = dossiers;
  if (alerts !== undefined) usage.alerts = alerts;
  if (apiCalls !== undefined) usage.apiCalls = apiCalls;
  if (seats !== undefined) usage.seats = seats;

  return jsonResponse({
    plan: getBillingPlan(planId),
    planSource,
    modules: getPlanEntitlements(planId),
    usage: {
      authoritative: false,
      source: "client_reported",
      note: "Usage figures are reported by the client and are not authoritative. Server-side metering overrides this.",
      snapshot: usage,
      evaluation: evaluateUsage(planId, usage),
    },
  });
}
