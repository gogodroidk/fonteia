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

const PREFS_KEY = "fonteia.prefs";

export function saveOnboardingPrefs(prefs: OnboardingPrefs): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // sem persistência
  }
}

/** Leitor simétrico de saveOnboardingPrefs. Retorna null se não houver preferência válida. */
export function getOnboardingPrefs(): OnboardingPrefs | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const goal = (parsed as Record<string, unknown>).goal;
    const channel = (parsed as Record<string, unknown>).channel;
    if (typeof goal !== "string" || typeof channel !== "string") return null;
    return { goal, channel };
  } catch {
    return null;
  }
}

/**
 * Mapeia o objetivo escolhido no onboarding para a rota (relativa à app) que
 * mais entrega valor a esse perfil. Espelha os hintRoute de onboarding/page.tsx.
 * Retorna null para objetivo desconhecido ou vazio (usuário que pulou o onboarding).
 */
export function goalToAppRoute(goal: string): string | null {
  switch (goal) {
    case "comprar":
    case "revender":
      return "/lotes";
    case "consultar":
      return "/empresas";
    default:
      return null;
  }
}
