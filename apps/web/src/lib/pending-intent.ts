/**
 * Intenção pendente entre a landing (visitante anônimo) e o pós-login.
 *
 * Quando alguém clica "Assinar Profissional" na landing, a intenção de assinar
 * fica guardada aqui; depois de autenticar, o App lê essa intenção e leva o
 * usuário direto ao checkout do plano em vez de largar no painel genérico.
 *
 * Usa sessionStorage (não localStorage): a intenção é de UMA sessão de compra e
 * não deve "vazar" para visitas futuras. Guardado atrás de guards de SSR/prerender,
 * no mesmo padrão de `onboarding.ts`.
 */

const KEY = "fonteia.intent";

/** Intenção suportada hoje: assinar um plano específico. */
export type PendingIntent = { kind: "plano"; plano: string };

function hasSession(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/** Guarda a intenção de assinar um plano (ex.: "pro"). */
export function setPlanoIntent(plano: string): void {
  if (!hasSession()) return;
  try {
    const intent: PendingIntent = { kind: "plano", plano };
    window.sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    // sem persistência — o fluxo apenas cai no comportamento padrão (painel).
  }
}

/**
 * Lê e LIMPA a intenção pendente (consumo único). Retorna o destino a navegar,
 * ou null se não houver intenção válida.
 */
export function takePendingDestination(): string | null {
  if (!hasSession()) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw === null) return null;
    window.sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as Partial<PendingIntent>;
    if (parsed.kind === "plano" && typeof parsed.plano === "string" && parsed.plano.length > 0) {
      return `/app/planos?plano=${encodeURIComponent(parsed.plano)}`;
    }
    return null;
  } catch {
    return null;
  }
}
