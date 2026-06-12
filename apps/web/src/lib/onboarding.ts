const KEY = "fonteia.onboarded";

export function hasOnboarded(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboarded(): void {
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
  try {
    window.localStorage.setItem("fonteia.prefs", JSON.stringify(prefs));
  } catch {
    // sem persistência
  }
}
