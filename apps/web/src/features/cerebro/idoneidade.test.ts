/**
 * idoneidade.test.ts — computarSelo pura.
 *
 * verificarIdoneidade é I/O (chama consultarCertidao); aqui cobrimos apenas
 * o semáforo consolidado que segue a mesma lógica de prioridade que computarSemaforo.
 */

import { describe, it, expect } from "vitest";
import type { IdoneidadeCardState, IdoneidadeKindStr } from "./idoneidade";
import { computarSelo } from "./idoneidade";

// ─── helpers ─────────────────────────────────────────────────────────────────

const KIND: IdoneidadeKindStr = "transparencia-ceis";

function okCard(status: "regular" | "atencao" | "irregular"): IdoneidadeCardState {
  return {
    kind: KIND,
    label: "CEIS",
    result: {
      state: "ok",
      data: { kind: KIND, status, titulo: "", resumo: "", itens: [] },
    },
  };
}

function errorCard(): IdoneidadeCardState {
  return {
    kind: KIND,
    label: "CEIS",
    result: { state: "error", message: "Falha" },
  };
}

// ─── computarSelo ─────────────────────────────────────────────────────────────

describe("computarSelo", () => {
  it("returns 'indisponivel' for empty cards", () => {
    expect(computarSelo([])).toBe("indisponivel");
  });

  it("returns 'indisponivel' when all cards are errors (none ok)", () => {
    expect(computarSelo([errorCard(), errorCard()])).toBe("indisponivel");
  });

  it("returns 'regular' when all ok cards are regular", () => {
    expect(computarSelo([okCard("regular"), okCard("regular")])).toBe("regular");
  });

  it("returns 'atencao' when at least one ok card is atencao (no irregular)", () => {
    expect(computarSelo([okCard("regular"), okCard("atencao")])).toBe("atencao");
  });

  it("returns 'irregular' when at least one ok card is irregular", () => {
    expect(computarSelo([okCard("atencao"), okCard("irregular")])).toBe("irregular");
  });

  it("irregular beats all other statuses simultaneously", () => {
    expect(
      computarSelo([okCard("regular"), okCard("atencao"), okCard("irregular")]),
    ).toBe("irregular");
  });

  it("ignores error cards when ok cards are present", () => {
    expect(computarSelo([errorCard(), okCard("regular")])).toBe("regular");
  });
});
