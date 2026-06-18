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
  until?: string | undefined;
  loading: boolean;
}

const FREE: PlanInfo = { plan: "free", isPro: false, trial: false, loading: false };

export function usePlan(): PlanInfo {
  const [info, setInfo] = useState<PlanInfo>({ ...FREE, loading: true });

  useEffect(() => {
    let cancelled = false;
    if (!supabase) {
      setInfo(FREE);
      return;
    }
    // Promise.resolve adota o thenable do Supabase (PostgrestBuilder e PromiseLike,
    // nao tem .catch) -> vira Promise real com .then/.catch.
    void Promise.resolve(supabase.rpc("my_plan")).then(({ data, error }) => {
      if (cancelled) return;
      if (error || data === null || typeof data !== "object") {
        setInfo(FREE);
        return;
      }
      const d = data as { plan?: string; trial?: boolean; until?: string };
      const plan: PlanId = d.plan === "pro" || d.plan === "corporativo" ? d.plan : "free";
      setInfo({
        plan,
        isPro: plan !== "free",
        trial: Boolean(d.trial),
        until: typeof d.until === "string" ? d.until : undefined,
        loading: false,
      });
    }).catch(() => {
      // Promise rejeitada (rede/supabase offline) → degrada para free,
      // evita loading:true para sempre.
      if (!cancelled) setInfo(FREE);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
