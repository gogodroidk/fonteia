import { supabase } from "../../auth/supabase-client";

export interface RedeemResult {
  ok: boolean;
  already?: boolean | undefined;
  error?: string | undefined;
  message: string;
  trialDays?: number | undefined;
  grantedUntil?: string | null | undefined;
}

/**
 * Resgata um cupom para o usuário logado via RPC `redeem_coupon` (SECURITY DEFINER).
 * O backend valida código, validade, limite e uso único — aqui só normalizamos o retorno.
 */
export async function redeemCoupon(code: string): Promise<RedeemResult> {
  if (!supabase) {
    return { ok: false, message: "Entre na sua conta para usar um cupom." };
  }
  const { data, error } = await supabase.rpc("redeem_coupon", { p_code: code });
  if (error) {
    return { ok: false, message: error.message || "Não foi possível validar o cupom agora." };
  }
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    ok: Boolean(d.ok),
    already: Boolean(d.already),
    error: typeof d.error === "string" ? d.error : undefined,
    message:
      typeof d.message === "string" ? d.message : d.ok ? "Cupom ativado!" : "Cupom inválido.",
    trialDays: typeof d.trial_days === "number" ? d.trial_days : undefined,
    grantedUntil: typeof d.granted_until === "string" ? d.granted_until : null,
  };
}

/** Devolve até quando o usuário tem teste ativo (ISO), ou null. */
export async function getMyTrial(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_trial");
  if (error) return null;
  return typeof data === "string" ? data : null;
}
