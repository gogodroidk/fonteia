/**
 * format.ts — helpers de apresentação para o Raio-X 360° (sem lógica de negócio).
 */

/** Formata um valor em reais (number ou string numérica) para BRL; "" se inválido/≤0. */
export function formatBRL(value: unknown): string {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (!Number.isFinite(n) || (n as number) <= 0) return "";
  return (n as number).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata data ISO ("yyyy-mm-dd" ou completa) para dd/mm/aaaa; devolve original se não casar. */
export function formatDatePt(value: unknown): string {
  const s = typeof value === "string" ? value : "";
  if (s === "") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  return s;
}

/** Formata "collected_at" por extenso, para o rodapé de evidência ("consultado em 7 de julho de 2026"). */
export function formatCollectedAt(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

/** Extrai o primeiro campo de string não vazio dentre as chaves candidatas de um item genérico. */
export function pick(item: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = item[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

/** Soma valores monetários de uma lista de itens de seção, testando várias chaves comuns. */
export function sumMoneyField(items: Array<Record<string, unknown>>, ...keys: string[]): number {
  let total = 0;
  for (const item of items) {
    for (const key of keys) {
      const v = item[key];
      const n = typeof v === "string" ? Number(v) : (v as number);
      if (Number.isFinite(n) && (n as number) > 0) {
        total += n as number;
        break;
      }
    }
  }
  return total;
}
