import { describe, expect, it } from "vitest";
import { MODULE_IDS, SOURCE_STATUSES } from "@fonteia/domain";
import { SOURCE_CATALOG } from "./catalog";
import { assertSourceCatalogIsValid, getSourceById, listSourcesByModule, listSourcesByStatus } from "./registry";

describe("Fonte.ia source catalog", () => {
  it("registers the initial public source portfolio", () => {
    expect(SOURCE_CATALOG.length).toBeGreaterThanOrEqual(18);
    expect(getSourceById("receita-leiloes-sle")?.modules).toContain("leiloes");
    expect(getSourceById("portal-transparencia-api")?.modules).toContain("politica");
    expect(getSourceById("inpi-dados-abertos")?.modules).toContain("inpi");
    expect(getSourceById("ibama-dados-abertos")?.modules).toContain("ambiental");
  });

  it("requires every source to include ownership, access and product mapping", () => {
    expect(() => assertSourceCatalogIsValid()).not.toThrow();

    for (const source of SOURCE_CATALOG) {
      expect(source.owner.length).toBeGreaterThan(2);
      expect(source.sourceUrl).toMatch(/^https:\/\//);
      expect(SOURCE_STATUSES).toContain(source.status);
      expect(source.modules.length).toBeGreaterThan(0);
      for (const moduleId of source.modules) {
        expect(MODULE_IDS).toContain(moduleId);
      }
    }
  });

  it("supports filtering sources by module and status", () => {
    expect(listSourcesByModule("licitacoes").map((source) => source.id)).toContain("pncp-consulta");
    expect(listSourcesByModule("ambiental").map((source) => source.id)).toContain("inpe-terrabrasilis");
    expect(listSourcesByStatus("fragile_operational").map((source) => source.id)).toContain("receita-leiloes-sle");
  });
});

