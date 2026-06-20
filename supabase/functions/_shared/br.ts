// Utilitários BR compartilhados para as Edge Functions (runtime Deno).
// Centraliza helpers que apareciam duplicados em múltiplas funções de ingestão.

/**
 * Mantém apenas dígitos de uma string.
 * "123.456/0001-90" -> "12345600019"  (use extractCnpj para validar 14 dígitos)
 * NÃO usar para CNPJ alfanumérico — use sanitizeCnpj/normalizeCnpj.
 */
export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Sanitiza CNPJ alfanumérico: remove só máscara (. / - espaços), faz UPPERCASE.
 * NÃO remove letras. Limita a 14 chars [0-9A-Z].
 * Compatível com a IN RFB 2.229/2026 (CNPJ alfanumérico a partir de 01/07/2026).
 */
export function sanitizeCnpj(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[.\-/ ]/g, "").toUpperCase().slice(0, 14);
}

/**
 * Valida CNPJ alfanumérico segundo algoritmo oficial IN RFB 2.229/2026.
 * Valor do char = charCodeAt(0) - 48 ('0'=0..'9'=9, 'A'=17..'Z'=42).
 * Compatível retroativamente com CNPJs numéricos.
 */
export function isValidCnpj(value: string | null | undefined): boolean {
  const s = sanitizeCnpj(value);
  if (s.length !== 14) return false;
  if (!/^[0-9A-Z]{14}$/.test(s)) return false;
  if (/^(.)\1{13}$/.test(s)) return false; // todos iguais
  const charVal = (c: string) => c.charCodeAt(0) - 48;
  const calc = (digits: string, weights: number[]) => {
    const sum = digits.split("").reduce((acc, c, i) => acc + charVal(c) * weights[i]!, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(s.slice(0, 12), w1);
  const d2 = calc(s.slice(0, 13), w2);
  return s[12] === String(d1) && s[13] === String(d2);
}

/**
 * Normaliza CNPJ para ingestão: remove máscara, UPPERCASE, valida formato 14 chars [0-9A-Z].
 * Retorna string sanitizada (14 chars) ou "" se inválido.
 * Substitui funções locais normalizeCnpj() que usavam replace(/\D/g,"") — compatível
 * com a IN RFB 2.229/2026 (aceita letras nos 12 primeiros chars).
 * Leniente com DV: valida formato, não calcula dígitos verificadores.
 */
export function normalizeCnpj(raw: string | null | undefined): string {
  const s = sanitizeCnpj(raw);
  if (s.length !== 14) return "";
  if (!/^[0-9A-Z]{14}$/.test(s)) return "";
  return s;
}

/**
 * Extrai CNPJ alfanumérico (14 chars [0-9A-Z]) da string; retorna null se não encontrar.
 * Aceita formatos mascarados ou IDs como "CNPJ - PESSOA JURÍDICA - 00000000000000".
 * Compatível com a IN RFB 2.229/2026 — reconhece CNPJs com letras nos primeiros 12 chars.
 */
export function extractCnpj(value: string | null | undefined): string | null {
  // Tenta extrair 14 chars alfanuméricos consecutivos (captura ID do TCE-SP etc.)
  const m = /([0-9A-Z]{14})/.exec(String(value ?? "").toUpperCase());
  if (m) return m[1]!;
  const s = sanitizeCnpj(value);
  return s.length === 14 ? s : null;
}

/**
 * Converte valor monetário em formato BR para número decimal.
 * "1.234,56" -> 1234.56 ; "100,00" -> 100 ; null/vazio -> null.
 */
export function brMoneyToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/[^\d.,-]/g, "").trim();
  if (s === "") return null;
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normaliza datas brasileiras / ISO para ISO 8601 com offset BRT (-03:00).
 *
 * Reconhece:
 *   "DD/MM/YYYY"          -> "YYYY-MM-DDT00:00:00-03:00"
 *   "YYYY-MM-DD"          -> "YYYY-MM-DDT00:00:00-03:00"
 *   "YYYY-MM-DDTHH:MM"    -> "YYYY-MM-DDTHH:MM-03:00"  (sem offset)
 *   strings já com Z ou offset -> inalterada
 *   vazio / inválido      -> ""
 */
export function parseDateBrt(value: string | null | undefined): string {
  if (!value) return "";
  const t = String(value).trim();
  if (t === "") return "";
  // Já tem offset ou Z
  if (/[zZ]$/.test(t) || /[+-]\d{2}:\d{2}$/.test(t)) return t;
  // ISO datetime sem offset
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) return `${t}-03:00`;
  // ISO date puro
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T00:00:00-03:00`;
  // DD/MM/YYYY
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T00:00:00-03:00`;
  return t;
}
