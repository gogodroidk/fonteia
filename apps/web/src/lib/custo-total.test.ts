/**
 * custo-total.test.ts — estimarCustoTotal edge cases.
 *
 * Verifica: defaults, overrides, arredondamento, zero, valores extremos.
 */

import { describe, it, expect } from "vitest";
import { estimarCustoTotal } from "./custo-total";

describe("estimarCustoTotal", () => {
  it("applies default 5% comissao and 0% tributos", () => {
    const result = estimarCustoTotal({ lanceCents: 10_000 });
    expect(result.comissaoCents).toBe(500);       // 5% of 10000
    expect(result.tributosCents).toBe(0);
    expect(result.outrosCents).toBe(0);
    expect(result.totalCents).toBe(10_500);
    expect(result.lanceCents).toBe(10_000);
    expect(result.parametros.comissaoLeiloeiroPct).toBe(5);
    expect(result.parametros.tributosPct).toBe(0);
  });

  it("applies overridden comissao and tributos", () => {
    const result = estimarCustoTotal({
      lanceCents: 100_000,
      comissaoLeiloeiroPct: 10,
      tributosPct: 12,
    });
    expect(result.comissaoCents).toBe(10_000);  // 10%
    expect(result.tributosCents).toBe(12_000);  // 12%
    expect(result.totalCents).toBe(122_000);
  });

  it("adds fixed outros to total", () => {
    const result = estimarCustoTotal({
      lanceCents: 50_000,
      outrosCents: 3_000,
    });
    expect(result.outrosCents).toBe(3_000);
    expect(result.totalCents).toBe(50_000 + 2_500 + 3_000); // lance + 5% comissao + outros
  });

  it("rounds fractional centavos correctly (Math.round)", () => {
    // 5% of 100_001 = 5000.05 → rounds to 5000
    const result = estimarCustoTotal({ lanceCents: 100_001 });
    expect(result.comissaoCents).toBe(5000);
    expect(result.totalCents).toBe(100_001 + 5000);
  });

  it("handles zero lance", () => {
    const result = estimarCustoTotal({ lanceCents: 0 });
    expect(result.comissaoCents).toBe(0);
    expect(result.tributosCents).toBe(0);
    expect(result.totalCents).toBe(0);
  });

  it("handles zero comissao override", () => {
    const result = estimarCustoTotal({
      lanceCents: 20_000,
      comissaoLeiloeiroPct: 0,
      tributosPct: 0,
    });
    expect(result.totalCents).toBe(20_000);
  });

  it("preserves parametros in the result", () => {
    const result = estimarCustoTotal({
      lanceCents: 5_000,
      comissaoLeiloeiroPct: 3,
      tributosPct: 7,
    });
    expect(result.parametros).toEqual({ comissaoLeiloeiroPct: 3, tributosPct: 7 });
  });

  it("all outros with no lance still sums correctly", () => {
    const result = estimarCustoTotal({
      lanceCents: 0,
      outrosCents: 1_500,
    });
    expect(result.totalCents).toBe(1_500);
  });
});
