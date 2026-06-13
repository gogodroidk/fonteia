import { describe, expect, it } from "vitest";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { lotEconomia, scoreReceitaLeilaoLot } from "./leiloes";

function lot(overrides: Partial<ReceitaLeilaoLot> = {}): ReceitaLeilaoLot {
  return {
    id: "200100-1-2026-1",
    sourceId: "receita-leiloes-sle",
    edital: "0200100/000001/2026",
    edle: "200100/1/2026",
    lotNumber: "1",
    displayNumber: "1",
    city: "SANTOS",
    agency: "Receita Federal do Brasil",
    minimumBidCents: 50_000_00, // R$ 50.000
    proposalDeadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    eligiblePersonTypes: ["pf", "pj"],
    sourceUrl: "https://example.test",
    collectedAt: new Date().toISOString(),
    raw: {} as ReceitaLeilaoLot["raw"],
    ...overrides,
  };
}

describe("lotEconomia (economia real, grátis)", () => {
  it("retorna null quando não há avaliação", () => {
    expect(lotEconomia(lot())).toBeNull();
  });

  it("retorna null quando a avaliação é <= o lance mínimo", () => {
    expect(lotEconomia(lot({ valorAvaliacaoCents: 40_000_00 }))).toBeNull();
  });

  it("calcula economia e desconto% a partir de avaliação − mínimo", () => {
    const eco = lotEconomia(lot({ minimumBidCents: 50_000_00, valorAvaliacaoCents: 100_000_00 }));
    expect(eco).not.toBeNull();
    expect(eco?.economiaCents).toBe(50_000_00);
    expect(eco?.descontoPct).toBe(50);
  });

  it("um desconto alto aumenta o score de oportunidade", () => {
    const base = scoreReceitaLeilaoLot(lot()); // sem avaliação
    const comDesconto = scoreReceitaLeilaoLot(lot({ valorAvaliacaoCents: 100_000_00 })); // 50% de desconto
    expect(comDesconto.score).toBeGreaterThan(base.score);
    expect(comDesconto.factors.some((f) => f.id === "desconto-alto")).toBe(true);
  });
});
