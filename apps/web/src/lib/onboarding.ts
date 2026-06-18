const KEY = "fonteia.onboarded";

/** Guard SSR/prerender — mesmo padrão de watchlist.ts. */
function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function hasOnboarded(): boolean {
  if (!hasStorage()) return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboarded(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Ambiente sem localStorage: ignora, o onboarding só reaparece.
  }
}

export interface OnboardingPrefs {
  goal: string;
  channel: string;
}

export function saveOnboardingPrefs(prefs: OnboardingPrefs): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem("fonteia.prefs", JSON.stringify(prefs));
  } catch {
    // sem persistência
  }
}
