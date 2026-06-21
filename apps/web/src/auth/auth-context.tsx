import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase-client";

/**
 * DemoUser: subconjunto seguro de User para o modo demo local.
 * Evita o cast duplo `as unknown as User` mantendo type-safety.
 */
export type DemoUser = Pick<User, "id" | "email" | "aud" | "role" | "app_metadata" | "user_metadata" | "created_at">;

export interface SignUpUserData {
  full_name: string;
  phone?: string;
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** true quando rodando sem Supabase: login/cadastro são simulados localmente. */
  demoMode: boolean;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signInWithEmail: (
    email: string,
    password: string,
    captchaToken?: string,
  ) => Promise<{ error: string | null }>;
  signUpWithEmail: (
    email: string,
    password: string,
    userData?: SignUpUserData,
    captchaToken?: string,
  ) => Promise<{ error: string | null }>;
  resetPassword: (email: string, captchaToken?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Traduz erros do Supabase Auth para mensagens claras em PT-BR.
 *
 * Princípios:
 * - NUNCA vazar detalhe interno (stack, nome de tabela, SQL, etc.) ao usuário.
 * - Mensagens acionáveis: o usuário entende o que fazer a seguir.
 * - Login com credencial errada usa mensagem genérica (não revela se o e-mail
 *   existe) para não facilitar enumeração de contas.
 *
 * `fallback` ajusta a mensagem padrão por contexto (login × cadastro × reset).
 *
 * Exportada para teste unitário (garante que nenhuma mensagem crua vaza).
 */
export function mapAuthError(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const msg = raw.toLowerCase();

  // ── Captcha (Turnstile/hCaptcha) ──
  if (msg.includes("captcha")) {
    return "A verificação anti-bot falhou ou expirou. Recarregue a página e tente novamente.";
  }

  // ── Credenciais inválidas (login) — mensagem genérica anti-enumeração ──
  if (
    msg.includes("invalid login credentials") ||
    msg.includes("invalid credentials") ||
    msg.includes("invalid email or password")
  ) {
    return "E-mail ou senha incorretos. Verifique os dados e tente novamente.";
  }

  // ── E-mail já cadastrado (signup) ──
  if (
    msg.includes("already registered") ||
    msg.includes("already been registered") ||
    msg.includes("user already exists") ||
    msg.includes("email address is already") ||
    msg.includes("already in use")
  ) {
    return "Este e-mail já está cadastrado. Tente entrar ou redefinir sua senha.";
  }

  // ── Senha fraca / curta ──
  if (
    msg.includes("password should be at least") ||
    msg.includes("password is too short") ||
    msg.includes("password should contain") ||
    msg.includes("weak password") ||
    (msg.includes("password") && msg.includes("at least"))
  ) {
    return "Senha muito fraca. Use ao menos 8 caracteres, combinando letras e números.";
  }

  // ── E-mail inválido / malformado ──
  if (msg.includes("invalid email") || msg.includes("unable to validate email")) {
    return "E-mail inválido. Confira o endereço digitado.";
  }

  // ── E-mail ainda não confirmado ──
  if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
    return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada e o spam.";
  }

  // ── Rate limit (muitas tentativas) ──
  if (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("for security purposes") ||
    (msg.includes("after") && msg.includes("seconds"))
  ) {
    return "Muitas tentativas em sequência. Aguarde alguns instantes e tente de novo.";
  }

  // ── Erro de rede / serviço indisponível ──
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("load failed") ||
    msg.includes("timeout")
  ) {
    return "Falha de conexão. Verifique sua internet e tente novamente.";
  }

  // ── Desconhecido: NÃO ecoar a mensagem crua do servidor (pode vazar interno) ──
  return fallback;
}

/**
 * Executa uma chamada de auth do Supabase capturando exceções de rede.
 * O SDK pode *lançar* (ex.: TypeError "Failed to fetch") em vez de retornar
 * `{ error }` quando o fetch falha — sem isto, a Promise rejeitaria e o botão
 * de submit ficaria travado em "carregando". Normalizamos tudo para PT-BR.
 */
async function runAuth(
  fn: () => Promise<{ error: { message: string } | null }>,
  fallback: string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await fn();
    if (error) return { error: mapAuthError(error.message, fallback) };
    return { error: null };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    return {
      error: mapAuthError(raw, "Falha de conexão. Verifique sua internet e tente novamente."),
    };
  }
}

const DEMO_STORAGE_KEY = "fonteia.demo.user";

function buildDemoUser(email: string, fullName?: string): User {
  const name = fullName ?? email.split("@")[0];
  // DemoUser cobre todos os campos que a UI acessa: id, email, user_metadata.
  // O cast para User é necessário porque o SDK Supabase adiciona campos internos
  // opcionais não acessados pela UI (ex.: phone, identities). É seguro aqui pois
  // o modo demo não usa sessão real e todos os campos lidos pela UI estão preenchidos.
  const demoUser: DemoUser = {
    id: `demo-${email}`,
    email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "demo" },
    user_metadata: { full_name: name },
    created_at: new Date().toISOString(),
  };
  return demoUser as User;
}

function loadDemoUser(): User | null {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    // Validar shape mínimo antes de confiar — evita ClassCastException silenciosa
    // se o localStorage contiver dados corrompidos ou de versão antiga.
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "id" in parsed &&
      typeof (parsed as Record<string, unknown>)["id"] === "string" &&
      "email" in parsed &&
      typeof (parsed as Record<string, unknown>)["email"] === "string"
    ) {
      return parsed as User;
    }
    return null;
  } catch {
    return null;
  }
}

function saveDemoUser(user: User | null): void {
  try {
    if (user) {
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(DEMO_STORAGE_KEY);
    }
  } catch {
    // Ambiente sem localStorage: segue só em memória.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Modo demonstração: sem Supabase configurado, restauramos o usuário local.
    if (!isSupabaseConfigured || !supabase) {
      setUser(loadDemoUser());
      setLoading(false);
      return;
    }

    // No Supabase JS v2, `onAuthStateChange` emite `INITIAL_SESSION` logo na
    // montagem — equivalente a getSession(). Usar apenas este listener evita a
    // race condition em que getSession() e INITIAL_SESSION chegam em ordens
    // distintas e fazem dois set-states concorrentes (o último "ganha", podendo
    // sobrescrever uma sessão válida com null em telas lentas).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function signInWithGoogle(): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured || !supabase) {
      const demo = buildDemoUser("visitante@fonteia.app", "Visitante Demo");
      saveDemoUser(demo);
      setUser(demo);
      return { error: null };
    }
    const redirectTo = `${window.location.origin}/`;
    const sb = supabase;
    // OAuth redireciona o navegador; em caso de falha de rede antes do redirect,
    // devolvemos um erro traduzido em vez de deixar a Promise rejeitar.
    return runAuth(
      () => sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } }),
      "Não foi possível conectar com o Google. Tente novamente.",
    );
  }

  async function signInWithEmail(email: string, password: string, captchaToken?: string) {
    if (!isSupabaseConfigured || !supabase) {
      if (password.length < 8) {
        return { error: "A senha precisa ter ao menos 8 caracteres." };
      }
      const demo = buildDemoUser(email);
      saveDemoUser(demo);
      setUser(demo);
      return { error: null };
    }

    const sb = supabase;
    // captchaToken vai em options apenas quando presente (exactOptionalPropertyTypes).
    type SignInArgs = Parameters<typeof sb.auth.signInWithPassword>[0];
    const args: SignInArgs = {
      email,
      password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    };
    return runAuth(
      () => sb.auth.signInWithPassword(args),
      "Não foi possível entrar. Tente novamente em instantes.",
    );
  }

  async function signUpWithEmail(
    email: string,
    password: string,
    userData?: SignUpUserData,
    captchaToken?: string,
  ) {
    if (!isSupabaseConfigured || !supabase) {
      if (password.length < 8) {
        return { error: "A senha precisa ter ao menos 8 caracteres." };
      }
      const demo = buildDemoUser(email, userData?.full_name);
      saveDemoUser(demo);
      setUser(demo);
      return { error: null };
    }

    // Build options: merge user data and captchaToken avoiding undefined values
    // (exactOptionalPropertyTypes: never pass a key set to `undefined`).
    type SignUpOptions = NonNullable<Parameters<typeof supabase.auth.signUp>[0]["options"]>;
    const options: SignUpOptions = {};
    if (userData) {
      options.data = {
        full_name: userData.full_name,
        ...(userData.phone ? { phone: userData.phone } : {}),
      };
    }
    if (captchaToken) {
      options.captchaToken = captchaToken;
    }

    const sb = supabase;
    const signUpArgs: Parameters<typeof sb.auth.signUp>[0] = {
      email,
      password,
      ...(Object.keys(options).length > 0 ? { options } : {}),
    };

    return runAuth(
      () => sb.auth.signUp(signUpArgs),
      "Não foi possível criar sua conta. Tente novamente em instantes.",
    );
  }

  async function resetPassword(email: string, captchaToken?: string): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured || !supabase) {
      // Modo demo: não há backend de e-mail; respondemos como sucesso silencioso.
      return { error: null };
    }
    const redirectTo = `${window.location.origin}/entrar`;
    const sb = supabase;
    // captchaToken só entra quando presente (exactOptionalPropertyTypes).
    type ResetOptions = NonNullable<Parameters<typeof sb.auth.resetPasswordForEmail>[1]>;
    const options: ResetOptions = {
      redirectTo,
      ...(captchaToken ? { captchaToken } : {}),
    };
    return runAuth(
      () => sb.auth.resetPasswordForEmail(email, options),
      "Não foi possível enviar o e-mail de redefinição. Tente novamente.",
    );
  }

  async function signOut() {
    if (!isSupabaseConfigured || !supabase) {
      saveDemoUser(null);
      setUser(null);
      return;
    }
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        demoMode: !isSupabaseConfigured,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resetPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
