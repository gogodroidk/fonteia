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

  it("keeps leiloes active, the API module locked, and every status valid", () => {
    expect(PRODUCT_MODULES.find((module) => module.id === "leiloes")?.status).toBe("active");
    // O módulo de API ainda não foi liberado (roadmap) — os demais já estão ativos.
    expect(PRODUCT_MODULES.find((module) => module.id === "api")?.status).toBe("locked");

    for (const module of PRODUCT_MODULES) {
      expect(["active", "locked", "coming_soon"]).toContain(module.status);
    }
  });

  it("tracks the source status taxonomy needed for public-data reliability", () => {
    expect(SOURCE_STATUSES).toContain("connected");
    expect(SOURCE_STATUSES).toContain("fragile_operational");
    expect(SOURCE_STATUSES).toContain("restricted_government");
    expect(SOURCE_STATUSES).toContain("complementary_non_government");
  });
});

