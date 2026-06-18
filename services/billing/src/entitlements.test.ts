import { describe, expect, it } from "vitest";
import { BILLING_PLANS, canAccessModule, evaluateUsage, getModuleEntitlement, getPlanEntitlements } from "./index";

describe("billing entitlements", () => {
  it("defines the canonical commercial plan ladder", () => {
    expect(BILLING_PLANS.map((plan) => plan.id)).toEqual(["free", "pro", "corporativo"]);
  });

  it("keeps Leiloes accessible early and locks adjacent modules for upsell", () => {
    expect(canAccessModule("free", "leiloes")).toBe(true);
    expect(canAccessModule("free", "empresas")).toBe(false);
    expect(getModuleEntitlement("free", "empresas").recommendedPlanId).toBe("pro");
    expect(getPlanEntitlements("free").filter((item) => item.access === "upgrade").length).toBeGreaterThan(6);
  });

  it("locks corporate-only modules behind the corporativo plan", () => {
    expect(canAccessModule("pro", "juridico")).toBe(false);
    expect(getModuleEntitlement("pro", "juridico").recommendedPlanId).toBe("corporativo");
    expect(canAccessModule("corporativo", "juridico")).toBe(true);
  });

  it("flags usage limits before blocking customers", () => {
    const results = evaluateUsage("pro", { aiAnswers: 70, alerts: 20 });

    expect(results.find((item) => item.key === "aiAnswers")?.status).toBe("near_limit");
    expect(results.find((item) => item.key === "alerts")?.status).toBe("blocked");
  });
});
