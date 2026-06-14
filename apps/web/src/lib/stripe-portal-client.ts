// Cliente do Stripe Customer Portal — fala com a Edge Function "stripe-portal".
//
// A function (verify_jwt=false, auth própria por apikey + token de sessão) descobre o
// stripe_customer_id do usuário e devolve { url } de uma sessão do Customer Portal.
// Aqui só montamos a chamada autenticada e tratamos os estados de erro de forma
// previsível, para a tela degradar com elegância (sem assinatura, portal off, etc.).

import { getSupabasePublicConfig, trimTrailingSlash } from "./api-client";
import { supabase } from "../auth/supabase-client";

/** Resultado do pedido de portal: sucesso com URL, ou um motivo de erro tipado. */
export type PortalResult =
  | { ok: true; url: string }
  | {
      ok: false;
      reason: "nao_autenticado" | "sem_assinatura" | "indisponivel";
      message?: string | undefined;
    };

/**
 * Pede ao backend uma sessão do Customer Portal do Stripe para o usuário logado.
 * Não redireciona — devolve a URL (ou o motivo do erro) para o chamador decidir.
 */
export async function requestStripePortalUrl(): Promise<PortalResult> {
  if (!supabase) {
    return { ok: false, reason: "nao_autenticado" };
  }

  // Token de sessão do usuário (a function precisa dele para achar o cliente Stripe).
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return { ok: false, reason: "nao_autenticado" };
  }

  const { url, key } = getSupabasePublicConfig();
  const endpoint = `${trimTrailingSlash(url)}/functions/v1/stripe-portal`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${accessToken}`,
      },
      body: "{}",
    });
  } catch {
    return { ok: false, reason: "indisponivel", message: "Falha de rede ao abrir o portal." };
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
  if (response.status === 404) {
    return { ok: false, reason: "sem_assinatura", message: body.message };
  }
  return { ok: false, reason: "indisponivel", message: body.message };
}
