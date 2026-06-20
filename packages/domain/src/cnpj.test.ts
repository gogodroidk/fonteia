import { describe, expect, it } from "vitest";
import { isValidCnpj, normalizeCnpj, sanitizeCnpj } from "./cnpj";

// ---------------------------------------------------------------------------
// Helpers de teste — espelham o algoritmo da IN RFB 2.229/2026 para gerar
// CNPJs alfanuméricos com DVs corretos, sem depender de números inventados.
// ---------------------------------------------------------------------------

function charVal(c: string): number {
  return c.charCodeAt(0) - 48;
}

/**
 * Dado os 12 primeiros caracteres alfanuméricos ([0-9A-Z]), calcula e anexa
 * os dois DVs numéricos, devolvendo o CNPJ completo de 14 chars.
 */
function calcDv(digits12: string): string {
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
  const s1 = digits12
    .split("")
    .reduce((acc, c, i) => acc + charVal(c) * w1[i]!, 0);
  const r1 = s1 % 11;
  const d1 = r1 < 2 ? 0 : 11 - r1;

  const digits13 = digits12 + String(d1);
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
  const s2 = digits13
    .split("")
    .reduce((acc, c, i) => acc + charVal(c) * w2[i]!, 0);
  const r2 = s2 % 11;
  const d2 = r2 < 2 ? 0 : 11 - r2;

  return digits12 + String(d1) + String(d2);
}

// CNPJ alfanumérico gerado com DVs corretos pelo helper acima.
const ALPHA_BASE = "12ABC3450001"; // 12 chars alfanuméricos
const VALID_ALPHA_CNPJ = calcDv(ALPHA_BASE); // 14 chars, DVs corretos

// ---------------------------------------------------------------------------

describe("sanitizeCnpj", () => {
  it("remove pontos, barras, hífens e espaços", () => {
    expect(sanitizeCnpj("12.ABC.456/0001-80")).toBe("12ABC456000180");
  });

  it("faz uppercase das letras", () => {
    expect(sanitizeCnpj("12.abc.456/0001-80")).toBe("12ABC456000180");
  });

  it("mantém letras maiúsculas intactas (não remove com /\\D/g)", () => {
    const result = sanitizeCnpj("AB.CDE.FGH/IJKL-MN");
    expect(result).toBe("ABCDEFGHIJKLMN");
  });

  it("limita a 14 caracteres", () => {
    expect(sanitizeCnpj("123456789012345678")).toBe("12345678901234");
  });

  it("lida com null", () => {
    expect(sanitizeCnpj(null)).toBe("");
  });

  it("lida com undefined", () => {
    expect(sanitizeCnpj(undefined)).toBe("");
  });

  it("lida com string vazia", () => {
    expect(sanitizeCnpj("")).toBe("");
  });
});

describe("isValidCnpj", () => {
  it("aceita CNPJ numérico válido sem máscara", () => {
    // CNPJ real: 11.222.333/0001-81
    expect(isValidCnpj("11222333000181")).toBe(true);
  });

  it("aceita CNPJ numérico com máscara após sanitize", () => {
    const clean = sanitizeCnpj("11.222.333/0001-81");
    expect(isValidCnpj(clean)).toBe(true);
  });

  it("aceita CNPJ alfanumérico com DVs corretos gerados pelo helper", () => {
    // calcDv garante que os DVs são consistentes com o algoritmo implementado.
    expect(VALID_ALPHA_CNPJ).toHaveLength(14);
    expect(isValidCnpj(VALID_ALPHA_CNPJ)).toBe(true);
  });

  it("rejeita CNPJ alfanumérico com DV2 errado", () => {
    const wrongDv2 = VALID_ALPHA_CNPJ.slice(0, 13) + String((Number(VALID_ALPHA_CNPJ[13]!) + 1) % 10);
    expect(isValidCnpj(wrongDv2)).toBe(false);
  });

  it("rejeita CNPJ alfanumérico com DV1 errado", () => {
    const wrongDv1 = VALID_ALPHA_CNPJ.slice(0, 12) + String((Number(VALID_ALPHA_CNPJ[12]!) + 1) % 10) + VALID_ALPHA_CNPJ[13]!;
    expect(isValidCnpj(wrongDv1)).toBe(false);
  });

  it("rejeita CNPJ com todos os caracteres iguais", () => {
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });

  it("rejeita CNPJ com menos de 14 chars", () => {
    expect(isValidCnpj("1122233300018")).toBe(false);
  });

  it("rejeita CNPJ com mais de 14 chars", () => {
    expect(isValidCnpj("112223330001810")).toBe(false);
  });

  it("rejeita null", () => {
    expect(isValidCnpj(null)).toBe(false);
  });

  it("rejeita undefined", () => {
    expect(isValidCnpj(undefined)).toBe(false);
  });

  it("rejeita string vazia", () => {
    expect(isValidCnpj("")).toBe(false);
  });

  it("rejeita CNPJ com letras minúsculas (não normalizado)", () => {
    // isValidCnpj espera entrada já sanitizada — letras minúsculas são inválidas.
    const lower = VALID_ALPHA_CNPJ.toLowerCase();
    expect(isValidCnpj(lower)).toBe(false);
  });

  it("rejeita CNPJ com DVs não-numéricos nos últimos 2 chars", () => {
    // Substitui os dois DVs por letras — deve falhar na checagem de DVs numéricos.
    const alphaDv = VALID_ALPHA_CNPJ.slice(0, 12) + "AB";
    expect(isValidCnpj(alphaDv)).toBe(false);
  });
});

describe("normalizeCnpj", () => {
  it("retorna CNPJ limpo para entrada válida com máscara numérica", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("retorna CNPJ limpo para entrada alfanumérica válida", () => {
    const masked = `${ALPHA_BASE.slice(0, 2)}.${ALPHA_BASE.slice(2, 5)}.${ALPHA_BASE.slice(5, 8)}/${ALPHA_BASE.slice(8, 12)}-${VALID_ALPHA_CNPJ.slice(12)}`;
    expect(normalizeCnpj(masked)).toBe(VALID_ALPHA_CNPJ);
  });

  it("retorna '' para CNPJ com DV errado", () => {
    expect(normalizeCnpj("11.222.333/0001-99")).toBe("");
  });

  it("retorna '' para null", () => {
    expect(normalizeCnpj(null)).toBe("");
  });

  it("retorna '' para undefined", () => {
    expect(normalizeCnpj(undefined)).toBe("");
  });

  it("retorna '' para string vazia", () => {
    expect(normalizeCnpj("")).toBe("");
  });

  it("retorna '' para CNPJ com todos iguais", () => {
    expect(normalizeCnpj("11.111.111/1111-11")).toBe("");
  });
});
