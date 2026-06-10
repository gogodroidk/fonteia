import { describe, expect, it } from "vitest";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import {
  buildLeilaoAlerts,
  buildLeilaoCrossSellSuggestions,
  filterAlertEventsByPreferences,
  type NotificationPreferences,
} from "./rules";

const lot: ReceitaLeilaoLot = {
  id: "lot-1",
  sourceId: "receita-leiloes-sle",
  edital: "0200100/0000001/2026",
  edle: "200100/1/2026",
  lotNumber: "136",
  displayNumber: "136",
  city: "BELEM",
  agency: "Receita Federal",
  minimumBidCents: 400000,
  proposalDeadline: "2026-07-06T20:00:00-03:00",
  eligiblePersonTypes: ["pj"],
  imageUrl: "https://example.test/foto.jpg",
  sourceUrl: "https://www25.receita.fazenda.gov.br/sle-sociedade/api/portal/destaques",
  collectedAt: "2026-06-10T02:40:00-03:00",
  raw: {
    permitePF: false,
    orgao: "Receita Federal",
    cidade: "BELEM",
    edital: "0200100/0000001/2026",
    edle: "200100/1/2026",
    dtFimProposta: "2026-07-06 20:00",
    destaque: true,
    numero: 136,
    lote: 136,
    valor: 4000,
  },
};

describe("alerting rules", () => {
  it("creates leilao deadline and operational alert events", () => {
    const alerts = buildLeilaoAlerts(lot, new Date("2026-07-05T12:00:00-03:00"));

    expect(alerts.map((alert) => alert.type)).toContain("deadline");
    expect(alerts.map((alert) => alert.type)).toContain("source_update");
    expect(alerts.map((alert) => alert.type)).toContain("entity_change");
    expect(alerts.map((alert) => alert.type)).toContain("risk_increase");
    expect(alerts.some((alert) => alert.title.includes("proposta"))).toBe(true);
  });

  it("creates locked cross-sell suggestions that preserve the multi-module cascade", () => {
    const suggestions = buildLeilaoCrossSellSuggestions(lot);

    expect(suggestions.map((suggestion) => suggestion.targetModuleId)).toEqual(
      expect.arrayContaining(["empresas", "municipios", "juridico"]),
    );
    expect(suggestions.every((suggestion) => suggestion.locked)).toBe(true);
  });

  it("filters alert events by user notification preferences", () => {
    const alerts = buildLeilaoAlerts(lot, new Date("2026-07-05T12:00:00-03:00"));
    const preferences: NotificationPreferences = {
      enabled: true,
      channels: ["in_app"],
      disabledTypes: ["source_update"],
    };

    const filtered = filterAlertEventsByPreferences(alerts, preferences);

    expect(filtered.map((alert) => alert.type)).not.toContain("source_update");
    expect(filtered.length).toBeLessThan(alerts.length);
  });
});

