import { describe, expect, it } from "vitest";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { scoreReceitaLeilaoLot } from "./leiloes";

const baseLot: ReceitaLeilaoLot = {
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
  eligiblePersonTypes: ["pf", "pj"],
  imageUrl: "https://example.test/foto.jpg",
  sourceUrl: "https://www25.receita.fazenda.gov.br/sle-sociedade/api/portal/destaques",
  collectedAt: "2026-06-10T02:40:00-03:00",
  raw: {
    permitePF: true,
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

describe("leilao opportunity score", () => {
  it("scores accessible low-ticket lots higher", () => {
    const result = scoreReceitaLeilaoLot(baseLot, new Date("2026-06-10T12:00:00-03:00"));

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.label).toBe("alto");
    expect(result.maxSuggestedBidCents).toBeGreaterThan(baseLot.minimumBidCents);
  });

  it("penalizes PJ-only lots with expired deadlines", () => {
    const result = scoreReceitaLeilaoLot(
      {
        ...baseLot,
        eligiblePersonTypes: ["pj"],
        proposalDeadline: "2026-06-01T20:00:00-03:00",
        minimumBidCents: 150_000_000,
      },
      new Date("2026-06-10T12:00:00-03:00"),
    );

    expect(result.score).toBeLessThan(45);
    expect(result.label).toBe("baixo");
    expect(result.factors.map((factor) => factor.id)).toContain("pj-only");
  });
});

