// Hook de gate de admin: lê o papel do usuário logado em public.profiles.
//
// A RLS de profiles garante que cada usuário só lê o próprio registro (o admin lê
// todos, mas aqui filtramos por id). Resultado: { isAdmin, loading }. Em modo demo
// (sem Supabase) ou usuário deslogado, isAdmin = false.

import { useEffect, useState } from "react";
import { useAuth } from "../../auth/auth-context";
import { supabase, isSupabaseConfigured } from "../../auth/supabase-client";

export interface IsAdminState {
  isAdmin: boolean;
  loading: boolean;
}

export function useIsAdmin(): IsAdminState {
  const { user } = useAuth();
  const [state, setState] = useState<IsAdminState>({ isAdmin: false, loading: true });

  useEffect(() => {
    let cancelled = false;

    if (!user || !isSupabaseConfigured || !supabase) {
      setState({ isAdmin: false, loading: false });
      return () => {
        cancelled = true;
      };
    }

    setState((s) => ({ ...s, loading: true }));

    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setState({ isAdmin: data?.role === "admin", loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return state;
}
