import { describe, expect, it } from "vitest";
import { MODULE_IDS, PRODUCT_MODULES, SOURCE_STATUSES } from "./index";

describe("Fonte.ia domain model", () => {
  it("defines one product module for every module id", () => {
    expect(PRODUCT_MODULES.map((module) => module.id).sort()).toEqual([...MODULE_IDS].sort());
  });

  it("keeps every module ready for navigation and commercial positioning", () => {
    for (const module of PRODUCT_MODULES) {
      expect(module.label.length).toBeGreaterThan(2);
      expect(module.route).toMatch(/^\/[a-z]/);
      expect(module.icon.length).toBeGreaterThan(2);
      expect(module.targetPersona.length).toBeGreaterThan(10);
      expect(module.promise.length).toBeGreaterThan(10);
    }
  });

  it("keeps the launched data modules active and gates only the api module", () => {
    // O produto evoluiu do MVP de 1 módulo para 8 módulos com dados reais no ar.
    // Hoje só o módulo `api` (ticket alto, ainda não exposto) fica locked.
    expect(PRODUCT_MODULES.find((module) => module.id === "leiloes")?.status).toBe("active");
    expect(PRODUCT_MODULES.find((module) => module.id === "api")?.status).toBe("locked");

    for (const module of PRODUCT_MODULES.filter((item) => item.id !== "api")) {
      expect(module.status).toBe("active");
    }
  });

  it("tracks the source status taxonomy needed for public-data reliability", () => {
    expect(SOURCE_STATUSES).toContain("connected");
    expect(SOURCE_STATUSES).toContain("fragile_operational");
    expect(SOURCE_STATUSES).toContain("restricted_government");
    expect(SOURCE_STATUSES).toContain("complementary_non_government");
  });
});

