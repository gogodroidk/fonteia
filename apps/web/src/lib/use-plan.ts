// usePlan — plano efetivo do usuário logado (fonte única de gating no app).
// Lê a RPC `my_plan` (assinatura paga ativa OU teste por cupom = "pro").
// Grácil: sem Supabase / deslogado / erro → free.

import { useEffect, useState } from "react";
import { supabase } from "../auth/supabase-client";

export type PlanId = "free" | "pro" | "corporativo";

export interface PlanInfo {
  plan: PlanId;
  /** true quando o usuário tem acesso premium (pago OU em teste por cupom). */
  isPro: boolean;
  /** true quando o acesso premium vem de um cupom de teste. */
  trial: boolean;
  /**
   * Estado bruto vindo da RPC `my_plan`. Valores conhecidos:
   * "admin" (dono, sempre pro), "trialing" (assinatura em teste vigente),
   * "trial" (teste por cupom), "active" (pago), "expired" (teve trial/assinatura
   * que JÁ expirou → agora é free, paywall honesto), "free" (nunca teve).
   * Mantido como string para não quebrar quando o backend introduzir novos estados.
   */
  status: string;
  until?: string | undefined;
  loading: boolean;
}

const FREE: PlanInfo = { plan: "free", isPro: false, trial: false, status: "free", loading: false };

export function usePlan(): PlanInfo {
  const [info, setInfo] = useState<PlanInfo>({ ...FREE, loading: true });

  useEffect(() => {
    let cancelled = false;
    if (!supabase) {
      setInfo(FREE);
      return;
    }
    const client = supabase;

    function fetchPlan() {
      // Promise.resolve adota o thenable do Supabase (PostgrestBuilder e PromiseLike,
      // nao tem .catch) -> vira Promise real com .then/.catch.
      void Promise.resolve(client.rpc("my_plan"))
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error || data === null || typeof data !== "object") {
            // Log explícito: um erro transitório do my_plan rebaixa para free só
            // nesta sessão — sem isto, um Pro "perde" acesso sem rastro de diagnóstico.
            if (error) console.warn("[usePlan] my_plan falhou, assumindo free:", error.message);
            setInfo(FREE);
            return;
          }
          const d = data as { plan?: string; status?: string; trial?: boolean; until?: string };
          const plan: PlanId = d.plan === "pro" || d.plan === "corporativo" ? d.plan : "free";
          setInfo({
            plan,
            isPro: plan !== "free",
            trial: Boolean(d.trial),
            status: typeof d.status === "string" ? d.status : plan === "free" ? "free" : "active",
            until: typeof d.until === "string" ? d.until : undefined,
            loading: false,
          });
        })
        .catch(() => {
          // Promise rejeitada (rede/supabase offline) → degrada para free,
          // evita loading:true para sempre.
          if (!cancelled) setInfo(FREE);
        });
    }

    fetchPlan();
    // Re-busca o plano quando a sessão muda (login, logout, refresh de token,
    // resgate de cupom). Sem isto, o plano fica congelado até um reload completo:
    // quem acabou de pagar/logar continua vendo "free" e quem saiu continua "pro".
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      if (cancelled) return;
      setInfo((prev) => ({ ...prev, loading: true }));
      fetchPlan();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return info;
}
