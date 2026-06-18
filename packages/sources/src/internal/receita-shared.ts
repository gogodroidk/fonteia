// src/internal/receita-shared.ts — utilitários compartilhados entre receita-leiloes.ts
// e receita-leiloes-catalog.ts (eliminam duplicação de código — fix #4).

/** User-Agent honesto — igual em ambos os conectores da Receita. */
export const RECEITA_USER_AGENT = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

/** Headers padrão para qualquer chamada à Receita SLE. */
export const RECEITA_DEFAULT_HEADERS: Record<string, string> = {
  accept: "application/json",
  "user-agent": RECEITA_USER_AGENT,
};

/**
 * Converte "YYYY-MM-DD HH:mm" (horário local BRT sem timezone) para ISO 8601
 * com offset explícito -03:00. Sem timezone = BRT; nunca interpreta como UTC.
 *
 * Exemplos:
 *   "2026-07-06 20:00" → "2026-07-06T20:00:00-03:00"
 *   "2026-07-06"       → "2026-07-06T00:00:00-03:00"   (apenas data)
 *   ""                 → ""                              (ausente)
 */
export function parseReceitaDate(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed === "") return "";

  // Já tem timezone (Z ou ±hh:mm)? Mantém como está.
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) return trimmed;

  const [datePart, timePart = "00:00"] = trimmed.split(" ");
  const parts = datePart?.split("-") ?? [];
  const [year, month, day] = parts;

  if (!year || !month || !day) return trimmed;

  // HH:mm ou HH:mm:ss → garante HH:mm:ss
  const time = timePart.length === 5 ? `${timePart}:00` : timePart;
  return `${year}-${month}-${day}T${time}-03:00`;
}
