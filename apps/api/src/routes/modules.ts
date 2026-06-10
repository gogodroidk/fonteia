import { BILLING_PLANS, getModuleEntitlement, type BillingPlanId } from "@fonteia/billing";
import { PRODUCT_MODULES } from "@fonteia/domain";
import { jsonResponse, type ApiResponse, type RouteRequest } from "./types";

const planIds = new Set<BillingPlanId>(BILLING_PLANS.map((plan) => plan.id));

function parsePlanId(value: string | null): BillingPlanId | undefined {
  if (value && planIds.has(value as BillingPlanId)) {
    return value as BillingPlanId;
  }

  return undefined;
}

export function getModules(request?: RouteRequest): ApiResponse<typeof PRODUCT_MODULES | { modules: unknown[] }> {
  const planId = request ? parsePlanId(request.query.get("plan")) : undefined;

  if (planId) {
    return jsonResponse({
      modules: PRODUCT_MODULES.map((module) => ({
        ...module,
        entitlement: getModuleEntitlement(planId, module.id),
      })),
    });
  }

  return jsonResponse(PRODUCT_MODULES);
}
