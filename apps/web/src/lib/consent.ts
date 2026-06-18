export interface Consent {
  necessarios: true;
  funcionais: boolean;
  analiticos: boolean;
  publicidade: boolean;
  ts: string;
}

const KEY = "fonteia.consent";

/** Guard SSR/prerender — mesmo padrão de watchlist.ts. */
function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getConsent(): Consent | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Consent) : null;
  } catch {
    return null;
  }
}

export function hasConsent(): boolean {
  return getConsent() !== null;
}

export function saveConsent(c: Omit<Consent, "necessarios" | "ts">): void {
  if (!hasStorage()) return;
  const full: Consent = { necessarios: true, ts: new Date().toISOString(), ...c };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(full));
  } catch {
    // sem persistência
  }
}

/** Evento usado pela página de Conta para reabrir o painel de cookies. */
export function openCookieSettings(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("fonteia:cookies"));
}
