export interface Consent {
  necessarios: true;
  funcionais: boolean;
  analiticos: boolean;
  publicidade: boolean;
  ts: string;
}

const KEY = "fonteia.consent";

export function getConsent(): Consent | null {
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
  const full: Consent = { necessarios: true, ts: new Date().toISOString(), ...c };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(full));
  } catch {
    // sem persistência
  }
}

/** Evento usado pela página de Conta para reabrir o painel de cookies. */
export function openCookieSettings(): void {
  window.dispatchEvent(new CustomEvent("fonteia:cookies"));
}
