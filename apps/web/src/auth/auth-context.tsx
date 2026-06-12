import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase-client";

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** true quando rodando sem Supabase: login/cadastro são simulados localmente. */
  demoMode: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_STORAGE_KEY = "fonteia.demo.user";

function buildDemoUser(email: string, fullName?: string): User {
  const name = fullName ?? email.split("@")[0] ?? "Visitante";
  // O tipo User do Supabase é amplo; preenchemos o essencial para a UI.
  return {
    id: `demo-${email}`,
    email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "demo" },
    user_metadata: { full_name: name },
    created_at: new Date().toISOString(),
  } as unknown as User;
}

function loadDemoUser(): User | null {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
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

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

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

  async function signInWithGoogle() {
    if (!isSupabaseConfigured || !supabase) {
      const demo = buildDemoUser("visitante@fonteia.app", "Visitante Demo");
      saveDemoUser(demo);
      setUser(demo);
      return;
    }
    const redirectTo = `${window.location.origin}/`;
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  }

  async function signInWithEmail(email: string, password: string) {
    if (!isSupabaseConfigured || !supabase) {
      if (password.length < 8) {
        return { error: "A senha precisa ter ao menos 8 caracteres." };
      }
      const demo = buildDemoUser(email);
      saveDemoUser(demo);
      setUser(demo);
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUpWithEmail(email: string, password: string) {
    if (!isSupabaseConfigured || !supabase) {
      if (password.length < 8) {
        return { error: "A senha precisa ter ao menos 8 caracteres." };
      }
      const demo = buildDemoUser(email);
      saveDemoUser(demo);
      setUser(demo);
      return { error: null };
    }
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
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
