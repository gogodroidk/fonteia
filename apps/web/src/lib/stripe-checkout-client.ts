// Cliente do Stripe Checkout — fala com a Edge Function "stripe-checkout".
//
// A function (verify_jwt=false, auth própria por apikey + token de sessão) cria uma
// Checkout Session AMARRADA AO USUÁRIO (client_reference_id = id Supabase + metadata)
// e devolve { url } para redirecionar. Amarrar a identidade é o que mata o bug de
// correlação por e-mail: o webhook passa a gravar subscriptions.user_id.
//
// Aqui só montamos a chamada autenticada e tratamos os erros de forma previsível,
// para o chamador decidir entre redirecionar OU cair no Payment Link (fallback).

import { getSupabasePublicConfig, trimTrailingSlash } from "./api-client";
import { supabase } from "../auth/supabase-client";

/** Resultado do pedido de checkout: sucesso com URL, ou um motivo de erro tipado. */
export type CheckoutResult =
  | { ok: true; url: string }
  | {
      ok: false;
      /**
       * nao_autenticado  → sem sessão (peça login).
       * plano_invalido   → plano sem checkout direto (ex.: Corporativo).
       * indisponivel     → função off/5xx/rede → o chamador deve usar o Payment Link.
       */
      reason: "nao_autenticado" | "plano_invalido" | "indisponivel";
      message?: string | undefined;
    };

/**
 * Pede ao backend uma Checkout Session do Stripe para o plano informado.
 * Não redireciona — devolve a URL (ou o motivo do erro) para o chamador decidir.
 */
export async function requestStripeCheckoutUrl(planId: string): Promise<CheckoutResult> {
  if (!supabase) {
    // Sem Supabase (modo demo): sem sessão para amarrar → fallback no Payment Link.
    return { ok: false, reason: "nao_autenticado" };
  }

  // Token de sessão do usuário (a function precisa dele para amarrar a identidade).
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return { ok: false, reason: "nao_autenticado" };
  }

  const { url, key } = getSupabasePublicConfig();
  const endpoint = `${trimTrailingSlash(url)}/functions/v1/stripe-checkout`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ planId }),
    });
  } catch {
    return { ok: false, reason: "indisponivel", message: "Falha de rede ao iniciar o checkout." };
  }

  let body: { url?: string; error?: string; message?: string } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // corpo vazio/inválido — segue com o status
  }

  if (response.ok && body.url) {
    return { ok: true, url: body.url };
  }
  if (response.status === 401) {
    return { ok: false, reason: "nao_autenticado", message: body.message };
  }
  if (response.status === 400) {
    return { ok: false, reason: "plano_invalido", message: body.message };
  }
  // 404 (função não deployada), 5xx, 503 (sem secret) → fallback no Payment Link.
  return { ok: false, reason: "indisponivel", message: body.message };
}
