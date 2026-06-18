import { BILLING_PLANS, getModuleEntitlement, type BillingPlanId } from "@fonteia/billing";
import { PRODUCT_MODULES } from "@fonteia/domain";
import { badRequest, jsonResponse, type ApiResponse, type RouteRequest } from "./types";

const planIds = new Set<BillingPlanId>(BILLING_PLANS.map((plan) => plan.id));

function isBillingPlanId(value: string): value is BillingPlanId {
  return planIds.has(value as BillingPlanId);
}

export function getModules(
  request?: RouteRequest,
): ApiResponse<typeof PRODUCT_MODULES | { modules: unknown[] } | { error: string }> {
  const rawPlan = request?.query.get("plan") ?? null;

  if (rawPlan !== null && rawPlan !== "") {
    if (!isBillingPlanId(rawPlan)) {
      return badRequest("Invalid plan id", { allowed: [...planIds] });
    }

    const planId = rawPlan;
    return jsonResponse({
      modules: PRODUCT_MODULES.map((module) => ({
        ...module,
        entitlement: getModuleEntitlement(planId, module.id),
      })),
    });
  }

  return jsonResponse(PRODUCT_MODULES);
}
