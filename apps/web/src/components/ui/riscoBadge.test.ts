/**
 * riscoBadge.test.ts — riscoBadge mapping.
 *
 * Garante que cada nível retorna a classe CSS e label corretos do design system.
 */

import { describe, it, expect } from "vitest";
import { riscoBadge } from "./riscoBadge";

describe("riscoBadge", () => {
  it("baixo → badge--ok with 'Risco baixo'", () => {
    const result = riscoBadge("baixo");
    expect(result.className).toBe("badge--ok");
    expect(result.label).toBe("Risco baixo");
  });

  it("medio → badge--warn with 'Risco médio'", () => {
    const result = riscoBadge("medio");
    expect(result.className).toBe("badge--warn");
    expect(result.label).toBe("Risco médio");
  });

  it("alto → badge--danger with 'Risco alto'", () => {
    const result = riscoBadge("alto");
    expect(result.className).toBe("badge--danger");
    expect(result.label).toBe("Risco alto");
  });

  it("never returns empty className or label", () => {
    for (const risco of ["baixo", "medio", "alto"] as const) {
      const { className, label } = riscoBadge(risco);
      expect(className.length).toBeGreaterThan(0);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
