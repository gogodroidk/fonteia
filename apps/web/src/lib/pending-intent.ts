/**
 * Intenção pendente entre a landing (visitante anônimo) e o pós-login.
 *
 * Quando alguém clica "Assinar Profissional" na landing, a intenção de assinar
 * fica guardada aqui; depois de autenticar, o App lê essa intenção e leva o
 * usuário direto ao checkout do plano em vez de largar no painel genérico.
 *
 * Mesmo padrão vale para quem digita um CNPJ no Raio-X da landing antes de ter
 * conta: a intenção guarda o CNPJ e, pós-login/onboarding, o usuário cai direto
 * no relatório daquele CNPJ em vez do painel genérico.
 *
 * Usa sessionStorage (não localStorage): a intenção é de UMA sessão de compra e
 * não deve "vazar" para visitas futuras. Guardado atrás de guards de SSR/prerender,
 * no mesmo padrão de `onboarding.ts`.
 */

const KEY = "fonteia.intent";

/** Intenções suportadas hoje: assinar um plano específico, ou abrir o Raio-X de um CNPJ. */
export type PendingIntent =
  | { kind: "plano"; plano: string }
  | { kind: "raiox"; cnpj: string };

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

/** Guarda a intenção de abrir o Raio-X de um CNPJ específico (dígitos, 14 chars). */
export function setRaioXIntent(cnpj: string): void {
  if (!hasSession()) return;
  try {
    const intent: PendingIntent = { kind: "raiox", cnpj };
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
    if (parsed.kind === "raiox" && typeof parsed.cnpj === "string" && parsed.cnpj.length > 0) {
      return `/app/raiox/${encodeURIComponent(parsed.cnpj)}`;
    }
    return null;
  } catch {
    return null;
  }
}
