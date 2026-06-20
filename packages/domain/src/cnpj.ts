/**
 * Utilitários de CNPJ alfanumérico — IN RFB 2.229/2026.
 *
 * A partir de 01/07/2026 a Receita Federal emite CNPJs com os 12 primeiros
 * caracteres alfanuméricos ([0-9A-Z]) e os 2 últimos (dígitos verificadores)
 * sempre numéricos. CNPJs numéricos legados continuam válidos.
 *
 * Algoritmo oficial de cálculo dos DVs:
 *   charValue(c) = c.charCodeAt(0) - 48
 *   → '0'..'9' → 0..9 ; 'A' → 17 ; 'Z' → 42
 *   DV1: pesos [5,4,3,2,9,8,7,6,5,4,3,2] sobre os 12 primeiros chars.
 *   DV2: pesos [6,5,4,3,2,9,8,7,6,5,4,3,2] sobre os 12 chars + DV1.
 *   resto = soma % 11 ; dv = resto < 2 ? 0 : 11 - resto
 */

/** Pesos oficiais do DV1 (12 primeiros caracteres). */
const DV1_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/** Pesos oficiais do DV2 (12 primeiros + DV1 = 13 caracteres). */
const DV2_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/** Valor numérico de um caractere alfanumérico no algoritmo da IN RFB 2.229/2026. */
function charValue(c: string): number {
  return c.charCodeAt(0) - 48;
}

/**
 * sanitizeCnpj — remove apenas máscara (. / - e espaços), faz UPPERCASE e
 * limita a 14 caracteres alfanuméricos. NÃO usa `replace(/\D/g, "")` para
 * não descartar letras válidas (A-Z).
 *
 * Exemplos:
 *   "12.ABC.456/0001-80" → "12ABC456000180"
 *   "12.abc.456/0001-80" → "12ABC456000180"  (uppercase)
 *   "11.222.333/0001-81" → "11222333000181"
 */
export function sanitizeCnpj(raw: string | null | undefined): string {
  return (raw ?? "")
    .toUpperCase()
    .replace(/[\s.\-/]/g, "")
    .slice(0, 14);
}

/**
 * isValidCnpj — valida CNPJ alfanumérico conforme IN RFB 2.229/2026.
 *
 * Regras:
 *   - Exatamente 14 caracteres em [0-9A-Z]
 *   - Não pode ser composto de 14 caracteres idênticos (ex.: "00000000000000")
 *   - Os DVs nas posições 12 e 13 devem ser numéricos ('0'..'9')
 *   - Os DVs calculados pelo algoritmo oficial devem coincidir
 */
export function isValidCnpj(value: string | null | undefined): boolean {
  if (!value) return false;

  // Deve ter exatamente 14 chars alfanuméricos maiúsculos.
  if (!/^[0-9A-Z]{14}$/.test(value)) return false;

  // Rejeita sequências homogêneas (ex.: "00000000000000", "AAAAAAAAAAAAAA").
  if (/^(.)\1{13}$/.test(value)) return false;

  // DVs (posições 12 e 13) devem ser dígitos numéricos.
  const dv1Char = value[12]!;
  const dv2Char = value[13]!;
  if (!/^\d$/.test(dv1Char) || !/^\d$/.test(dv2Char)) return false;

  // Calcula DV1 sobre os 12 primeiros caracteres.
  let sum1 = 0;
  for (let i = 0; i < 12; i++) {
    sum1 += charValue(value[i]!) * DV1_WEIGHTS[i]!;
  }
  const rem1 = sum1 % 11;
  const calcDv1 = rem1 < 2 ? 0 : 11 - rem1;
  if (calcDv1 !== Number(dv1Char)) return false;

  // Calcula DV2 sobre os 12 primeiros caracteres + DV1.
  let sum2 = 0;
  for (let i = 0; i < 13; i++) {
    sum2 += charValue(value[i]!) * DV2_WEIGHTS[i]!;
  }
  const rem2 = sum2 % 11;
  const calcDv2 = rem2 < 2 ? 0 : 11 - rem2;
  return calcDv2 === Number(dv2Char);
}

/**
 * normalizeCnpj — sanitiza e valida; retorna a string limpa (14 chars) se
 * válida, ou "" caso contrário. Substitui o padrão legado de
 * `replace(/\D/g, "") + length === 14` que perdia letras alfanuméricas.
 *
 * Exemplos:
 *   "11.222.333/0001-81" → "11222333000181"  (CNPJ numérico válido)
 *   "11.222.333/0001-99" → ""                (DV errado)
 *   "12.abc.456/0001-xx" → ""                (inválido após sanitize)
 */
export function normalizeCnpj(raw: string | null | undefined): string {
  const clean = sanitizeCnpj(raw);
  return isValidCnpj(clean) ? clean : "";
}
