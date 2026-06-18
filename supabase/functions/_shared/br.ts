// Utilitários BR compartilhados para as Edge Functions (runtime Deno).
// Centraliza helpers que apareciam duplicados em múltiplas funções de ingestão.

/**
 * Mantém apenas dígitos de uma string.
 * "123.456/0001-90" -> "12345600019"  (use extractCnpj para validar 14 dígitos)
 */
export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Extrai CNPJ (14 dígitos) da string; retorna null se não tiver exatamente 14.
 * Aceita formatos mascarados ou IDs como "CNPJ - PESSOA JURÍDICA - 00000000000000".
 */
export function extractCnpj(value: string | null | undefined): string | null {
  // Tenta extrair 14 dígitos consecutivos (captura ID do TCE-SP etc.)
  const m = /(\d{14})/.exec(String(value ?? ""));
  if (m) return m[1]!;
  const d = digitsOnly(value);
  return d.length === 14 ? d : null;
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
