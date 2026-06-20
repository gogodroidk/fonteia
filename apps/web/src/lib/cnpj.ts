/**
 * cnpj.ts — utilitários de CNPJ compartilhados.
 *
 * Suporta o novo formato alfanumérico da Receita Federal (IN RFB 2.229/2026),
 * vigente a partir de 01/07/2026. Os 12 primeiros caracteres podem conter
 * letras (A–Z) além de dígitos; apenas os 2 últimos (dígitos verificadores)
 * permanecem numéricos.
 *
 * ATENÇÃO: não use /\D/g — isso remove letras e quebra CNPJs alfanuméricos.
 */

const DV1_WEIGHTS: readonly number[] = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const DV2_WEIGHTS: readonly number[] = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Remove apenas os caracteres de máscara (`.`, `/`, `-` e espaços) e
 * converte para maiúsculas. Retorna a string limpa se tiver exatamente
 * 14 caracteres, ou "" caso contrário.
 */
export function sanitizeCnpj(raw: string): string {
  const cleaned = raw.replace(/[.\-/\s]/g, "").toUpperCase();
  return cleaned.length === 14 ? cleaned : "";
}

/**
 * Aplica a máscara posicional XX.XXX.XXX/XXXX-XX a um CNPJ alfanumérico.
 * Chama sanitizeCnpj internamente; retorna `value` inalterado se inválido.
 */
export function formatCnpj(value: string): string {
  const c = sanitizeCnpj(value);
  if (c === "") return value;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/**
 * Valida um CNPJ numérico ou alfanumérico usando o algoritmo oficial
 * (IN RFB 2.229/2026). CNPJs puramente numéricos continuam válidos
 * pois '0'..'9' têm charCode 48..57, e charCode - 48 = 0..9 — idêntico
 * ao algoritmo legado.
 */
export function isValidCnpj(value: string): boolean {
  const c = sanitizeCnpj(value);
  if (c === "" || c.length !== 14) return false;

  // Rejeita sequências uniformes ("00000000000000", "11111111111111", etc.)
  if (/^(.)\1{13}$/.test(c)) return false;

  // Os dígitos verificadores (posições 12 e 13) devem ser numéricos
  const dv1Char = c[12];
  const dv2Char = c[13];
  if (dv1Char === undefined || dv2Char === undefined) return false;
  if (!/^\d$/.test(dv1Char) || !/^\d$/.test(dv2Char)) return false;

  const charValue = (ch: string): number => ch.charCodeAt(0) - 48;

  // Calcula DV1 sobre os 12 primeiros caracteres
  let sum1 = 0;
  for (let i = 0; i < 12; i++) {
    sum1 += charValue(c[i] ?? "0") * (DV1_WEIGHTS[i] ?? 0);
  }
  const rem1 = sum1 % 11;
  const computedDv1 = rem1 < 2 ? 0 : 11 - rem1;

  if (computedDv1 !== charValue(dv1Char)) return false;

  // Calcula DV2 sobre os 13 primeiros caracteres (base + DV1)
  let sum2 = 0;
  for (let i = 0; i < 13; i++) {
    sum2 += charValue(c[i] ?? "0") * (DV2_WEIGHTS[i] ?? 0);
  }
  const rem2 = sum2 % 11;
  const computedDv2 = rem2 < 2 ? 0 : 11 - rem2;

  return computedDv2 === charValue(dv2Char);
}
