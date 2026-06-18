/**
 * cnpj.ts — utilitários de CNPJ compartilhados.
 *
 * Extraído para evitar duplicação entre features/empresas/empresas-api.ts e
 * features/inpi/inpi-api.ts. Qualquer feature que precise validar/formatar
 * CNPJ importa daqui.
 */

/** Mantém só os dígitos do CNPJ; "" se não restarem 14. */
export function sanitizeCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 14 ? digits : "";
}

/** Máscara 00.000.000/0000-00 a partir de 14 dígitos. Retorna o original se inválido. */
export function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
