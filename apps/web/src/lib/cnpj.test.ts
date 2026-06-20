/**
 * cnpj.test.ts — testes para sanitizeCnpj, formatCnpj e isValidCnpj.
 *
 * Cobre tanto CNPJs numéricos (legado) quanto alfanuméricos (IN RFB 2.229/2026).
 *
 * CNPJs de referência calculados manualmente:
 *
 * Numérico "11222333000181":
 *   Base 112223330001 → DV1=8 → DV2=1
 *
 * Alfanumérico "1A2B3C4D5E6F34":
 *   Base 1A2B3C4D5E6F → valores [1,17,2,18,3,19,4,20,5,21,6,22]
 *   DV1 sum=613 → 613%11=8 → dv1=3
 *   DV2 sum=733 → 733%11=7 → dv2=4
 */

import { describe, it, expect } from "vitest";
import { sanitizeCnpj, formatCnpj, isValidCnpj } from "./cnpj";

// ---------------------------------------------------------------------------
// sanitizeCnpj
// ---------------------------------------------------------------------------

describe("sanitizeCnpj", () => {
  it("strips mask characters from a numeric CNPJ", () => {
    expect(sanitizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("strips leading/trailing whitespace as well as mask chars", () => {
    expect(sanitizeCnpj("  11.222.333/0001-81  ")).toBe("11222333000181");
  });

  it("strips mask characters from an alphanumeric CNPJ", () => {
    expect(sanitizeCnpj("1A.2B3.C4D/5E6F-34")).toBe("1A2B3C4D5E6F34");
  });

  it("uppercases letters", () => {
    expect(sanitizeCnpj("1a.2b3.c4d/5e6f-34")).toBe("1A2B3C4D5E6F34");
  });

  it('returns "" for a string that is too short after cleaning', () => {
    expect(sanitizeCnpj("too-short")).toBe("");
  });

  it('returns "" for an empty string', () => {
    expect(sanitizeCnpj("")).toBe("");
  });

  it('returns "" for a raw string with only 13 chars after cleaning', () => {
    expect(sanitizeCnpj("1122233300018")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// formatCnpj
// ---------------------------------------------------------------------------

describe("formatCnpj", () => {
  it("formats a raw numeric CNPJ", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("formats an already-masked numeric CNPJ (idempotent round-trip)", () => {
    expect(formatCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81");
  });

  it("formats a raw alphanumeric CNPJ", () => {
    expect(formatCnpj("1A2B3C4D5E6F34")).toBe("1A.2B3.C4D/5E6F-34");
  });

  it("formats an already-masked alphanumeric CNPJ (idempotent round-trip)", () => {
    expect(formatCnpj("1A.2B3.C4D/5E6F-34")).toBe("1A.2B3.C4D/5E6F-34");
  });

  it("returns original value unchanged when input is too short", () => {
    expect(formatCnpj("12345")).toBe("12345");
  });

  it("returns original value unchanged for empty string", () => {
    expect(formatCnpj("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// isValidCnpj — valid cases
// ---------------------------------------------------------------------------

describe("isValidCnpj — valid", () => {
  it("validates a known numeric CNPJ (unmasked)", () => {
    expect(isValidCnpj("11222333000181")).toBe(true);
  });

  it("validates a known numeric CNPJ (masked)", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("validates a valid alphanumeric CNPJ (unmasked)", () => {
    expect(isValidCnpj("1A2B3C4D5E6F34")).toBe(true);
  });

  it("validates a valid alphanumeric CNPJ (masked)", () => {
    expect(isValidCnpj("1A.2B3.C4D/5E6F-34")).toBe(true);
  });

  it("validates a valid alphanumeric CNPJ with lowercase input (sanitize normalises)", () => {
    expect(isValidCnpj("1a2b3c4d5e6f34")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidCnpj — invalid cases
// ---------------------------------------------------------------------------

describe("isValidCnpj — invalid", () => {
  it("rejects all-zeros (uniform sequence)", () => {
    expect(isValidCnpj("00000000000000")).toBe(false);
  });

  it("rejects all-ones (uniform sequence)", () => {
    expect(isValidCnpj("11111111111111")).toBe(false);
  });

  it("rejects a CNPJ that is too short", () => {
    expect(isValidCnpj("12345")).toBe(false);
  });

  it("rejects a numeric CNPJ with wrong second check digit", () => {
    // correct is 81; 82 is off by one
    expect(isValidCnpj("11222333000182")).toBe(false);
  });

  it("rejects a numeric CNPJ with wrong first check digit", () => {
    // correct is 81; 91 has wrong dv1
    expect(isValidCnpj("11222333000191")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidCnpj("")).toBe(false);
  });

  it("rejects an alphanumeric CNPJ with a wrong check digit", () => {
    // valid is 1A2B3C4D5E6F34; changing last char to 5
    expect(isValidCnpj("1A2B3C4D5E6F35")).toBe(false);
  });
});
