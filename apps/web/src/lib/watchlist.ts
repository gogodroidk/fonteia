// watchlist.ts — Helper for the local "Acompanhando" watchlist.
//
// Single source of truth for the localStorage key shared with the dashboard
// (KPI "Acompanhando") and the Alertas page. Reads/writes a JSON array of lot
// ids under `fonteia_watchlist`. All operations are defensive: storage may be
// unavailable (private mode, SSR) and the stored value may be corrupt — every
// failure degrades silently to an empty list instead of throwing.

/** The localStorage key every surface agrees on. Do not rename. */
export const WATCHLIST_STORAGE_KEY = "fonteia_watchlist";

/**
 * Custom DOM event dispatched after any write so views in the same tab can
 * react immediately (the native `storage` event only fires across tabs).
 */
export const WATCHLIST_EVENT = "fonteia:watchlist";

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Read the watchlist ids. Always returns a clean, de-duplicated string array. */
export function readWatchlist(): string[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids = parsed.filter((item): item is string => typeof item === "string");
    return Array.from(new Set(ids));
  } catch {
    return [];
  }
}

function writeWatchlist(ids: string[]): void {
  if (!hasStorage()) return;
  const unique = Array.from(new Set(ids));
  try {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(unique));
  } catch {
    return; // storage full / unavailable — non-blocking
  }
  // Notify same-tab listeners (dashboard / alertas) that the set changed.
  try {
    window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT, { detail: unique }));
  } catch {
    // CustomEvent unsupported — ignore, cross-tab `storage` still fires.
  }
}

/** True when the given lot id is currently in the watchlist. */
export function isWatched(id: string): boolean {
  return readWatchlist().includes(id);
}

/**
 * Toggle a lot id in the watchlist and return the resulting set.
 * Adds the id when absent, removes it when present.
 */
export function toggleWatchlist(id: string): string[] {
  const current = readWatchlist();
  const next = current.includes(id)
    ? current.filter((existing) => existing !== id)
    : [...current, id];
  writeWatchlist(next);
  return next;
}

/**
 * Subscribe to watchlist changes from any source (same-tab writes and
 * cross-tab `storage` events). Invokes `onChange` with the fresh id list.
 * Returns an unsubscribe function.
 */
export function subscribeWatchlist(onChange: (ids: string[]) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleCustom = (): void => onChange(readWatchlist());
  const handleStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === WATCHLIST_STORAGE_KEY) {
      onChange(readWatchlist());
    }
  };

  window.addEventListener(WATCHLIST_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(WATCHLIST_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}
