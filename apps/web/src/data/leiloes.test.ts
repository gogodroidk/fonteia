import { describe, expect, it } from "vitest";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { mapReceitaLotToOpportunity } from "./leiloes";

describe("leiloes presentation mapping", () => {
  it("turns an official Receita lot into a scored opportunity card", () => {
    const lot: ReceitaLeilaoLot = {
      id: "317900-2-2026-216",
      sourceId: "receita-leiloes-sle",
      edital: "0317900/0000002/2026",
      edle: "317900/2/2026",
      lotNumber: "216",
      displayNumber: "250",
      city: "FORTALEZA",
      agency: "Receita Federal",
      minimumBidCents: 118_805_00,
      proposalDeadline: "2026-06-26T21:00:00-03:00",
      eligiblePersonTypes: ["pf", "pj"],
      sourceUrl: "https://www25.receita.fazenda.gov.br/sle-sociedade/api/portal/destaques",
      collectedAt: "2026-06-10T02:40:00-03:00",
      raw: {
        permitePF: true,
        orgao: "Receita Federal",
        cidade: "FORTALEZA",
        edital: "0317900/0000002/2026",
        edle: "317900/2/2026",
        dtFimProposta: "2026-06-26 21:00",
        destaque: true,
        numero: 250,
        lote: 216,
        valor: 118805,
      },
    };

    const opportunity = mapReceitaLotToOpportunity(lot);

    expect(opportunity.title).toContain("Lote 216");
    expect(opportunity.eligibility).toBe("PF e PJ");
    expect(opportunity.entryValue.replace(/\s/u, " ")).toBe("R$ 118.805");
    expect(opportunity.evidence[0]?.sourceId).toBe("receita-leiloes-sle");
    expect(opportunity.opportunityScore).toBeGreaterThan(60);
  });
});
