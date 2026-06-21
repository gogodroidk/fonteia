/**
 * certidoes-helper.test.ts — computarSemaforo pura.
 *
 * consultarTodasCertidoes é testado via integração; aqui cobrimos apenas a
 * lógica de derivação do semáforo a partir de um array de CertidaoCardState.
 */

import { describe, it, expect } from "vitest";
import type { CertidaoKind } from "../infosimples/infosimples-client";
import type { CertidaoCardState } from "./certidoes-helper";
import { computarSemaforo } from "./certidoes-helper";

// ─── helpers ─────────────────────────────────────────────────────────────────

// A fixed valid CertidaoKind used throughout the helpers.
const FIXED_KIND: CertidaoKind = "transparencia-ceis";

function card(_kind: string, status: "regular" | "atencao" | "irregular"): CertidaoCardState {
  return {
    kind: FIXED_KIND,
    label: FIXED_KIND,
    result: {
      state: "ok",
      data: { kind: FIXED_KIND, status, titulo: "", resumo: "", itens: [] },
    },
  };
}

function errorCard(kind: string): CertidaoCardState {
  return {
    kind,
    label: kind,
    result: { state: "error", message: "timeout" },
  };
}

function dormantCard(kind: string): CertidaoCardState {
  return {
    kind,
    label: kind,
    result: { state: "dormant" },
  };
}

// ─── computarSemaforo ─────────────────────────────────────────────────────────

describe("computarSemaforo", () => {
  it("returns 'indisponivel' for empty cards array", () => {
    expect(computarSemaforo([])).toBe("indisponivel");
  });

  it("returns 'indisponivel' when all cards are errors", () => {
    const cards = [errorCard("ceis"), errorCard("cnep"), errorCard("tcu")];
    expect(computarSemaforo(cards)).toBe("indisponivel");
  });

  it("returns 'indisponivel' when all cards are dormant (proxy not configured)", () => {
    const cards = [dormantCard("ceis"), dormantCard("cnep")];
    expect(computarSemaforo(cards)).toBe("indisponivel");
  });

  it("returns 'regular' when all ok cards are regular", () => {
    const cards = [
      card("ceis", "regular"),
      card("cnep", "regular"),
      errorCard("tcu"),   // error cards are ignored in semaforo
    ];
    expect(computarSemaforo(cards)).toBe("regular");
  });

  it("returns 'atencao' when at least one ok card is atencao (no irregular)", () => {
    const cards = [
      card("ceis", "regular"),
      card("cnep", "atencao"),
      card("tcu", "regular"),
    ];
    expect(computarSemaforo(cards)).toBe("atencao");
  });

  it("returns 'irregular' when at least one ok card is irregular (trumps atencao)", () => {
    const cards = [
      card("ceis", "atencao"),
      card("cnep", "irregular"),
      card("tcu", "regular"),
    ];
    expect(computarSemaforo(cards)).toBe("irregular");
  });

  it("irregular wins over atencao and regular simultaneously", () => {
    const cards = [
      card("a", "regular"),
      card("b", "atencao"),
      card("c", "irregular"),
    ];
    expect(computarSemaforo(cards)).toBe("irregular");
  });

  it("ignores error cards when ok cards are present", () => {
    const cards = [
      errorCard("ceis"),
      card("cnep", "regular"),
    ];
    expect(computarSemaforo(cards)).toBe("regular");
  });

  it("ignores dormant cards when ok cards are present", () => {
    const cards = [
      dormantCard("tcu"),
      card("pgfn", "atencao"),
    ];
    expect(computarSemaforo(cards)).toBe("atencao");
  });

  it("handles single irregular card", () => {
    expect(computarSemaforo([card("ceis", "irregular")])).toBe("irregular");
  });
});
