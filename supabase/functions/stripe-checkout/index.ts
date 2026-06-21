// Supabase Edge Function: "stripe-checkout" — cria uma Stripe Checkout Session
// AMARRADA AO USUÁRIO logado (client_reference_id + metadata), substituindo o
// Payment Link cru. É a peça que MATA o bug de correlação por e-mail: a sessão
// passa a carregar a identidade Supabase (user id + e-mail), e o webhook grava
// `subscriptions.user_id` — correlação robusta por uid, não só por e-mail.
//
// AUTENTICAÇÃO PRÓPRIA (igual à "fonteia" e à "stripe-portal", verify_jwt=false no
// config.toml): exige o header `apikey` (chave pública do projeto) + o token de
// sessão do usuário no header Authorization (Bearer <access_token>). Com o token
// descobrimos id+e-mail do usuário (Supabase Auth) e criamos a Checkout Session.
//
// Por que verify_jwt=false? O gateway do Supabase rejeita o token de sessão como
// "apikey" inválida e quebra a chamada (mesmo motivo de "fonteia"/"stripe-portal").
// A auth é feita aqui dentro: sem apikey ⇒ 401; sem token de usuário ⇒ 401; token
// forjado/expirado ⇒ 401 (verificado contra o Supabase Auth).
//
// O front mantém o Payment Link como FALLBACK: se esta função estiver indisponível
// (não deployada, 5xx), billing/page.tsx redireciona para o Payment Link cru com o
// e-mail pré-preenchido — a venda nunca trava por causa do checkout amarrado.
//
// Secrets (Supabase → Edge Functions → Secrets) — reaproveita os das funções stripe-*:
//   STRIPE_SECRET_KEY            sk_live_... (mesma usada pelo webhook e pela stripe-portal)
//   STRIPE_PRICE_PRO             price_... do plano Profissional (opcional; default = price_1ThjWB4zjAI9pGd7GOAfQwBT)
//   STRIPE_PRICE_CORPORATIVO     price_... do plano Corporativo  (opcional; default = price_1ThjhR4zjAI9pGd7UyBOlctV)
//   STRIPE_CHECKOUT_SUCCESS_URL  URL de retorno em sucesso (opcional; default = app prod). {CHECKOUT_SESSION_ID} é substituído pelo Stripe.
//   STRIPE_CHECKOUT_CANCEL_URL   URL de retorno em cancelamento (opcional; default = /app/planos)
//   STRIPE_TRIAL_DAYS            dias de teste grátis (opcional; default = 7; 0 desliga)
//   SUPABASE_URL                 injetado automaticamente
//
// IMPORTANTE (rastreabilidade/segurança):
//   • A Secret Key (sk_live_…) só vive aqui (Edge Secret). NUNCA vai ao front.
//   • client_reference_id = user id do Supabase (uuid). O webhook deve lê-lo para
//     gravar subscriptions.user_id e fechar a correlação por uid (ver PR/README).

import { getVerifiedUserId } from "../_shared/auth.ts";
import { fetchWithTimeout } from "../_shared/http.ts";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
  "access-control-max-age": "86400",
};

// Chave pública do projeto (mesma da "fonteia"/"stripe-portal"): aceita como
// `apikey` válida e diferencia do token de sessão do usuário.
const PUBLISHABLE_KEY = "sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ";

// Planos que aceitam checkout direto → price id do Stripe. O Corporativo NÃO entra
// aqui por design (CTA é "Falar com vendas"): pedir checkout dele ⇒ 400.
// Defaults espelham STRIPE_PRICE_TO_PLAN em apps/web/src/config/stripe.ts e o webhook.
const PRICE_BY_PLAN: Record<string, { envVar: string; fallback: string }> = {
  pro: { envVar: "STRIPE_PRICE_PRO", fallback: "price_1ThjWB4zjAI9pGd7GOAfQwBT" },
  corporativo: { envVar: "STRIPE_PRICE_CORPORATIVO", fallback: "price_1ThjhR4zjAI9pGd7UyBOlctV" },
};

// Para onde o Stripe devolve o usuário. Em sucesso, alinhe com o param que a
// página billing já lê (?checkout=sucesso). {CHECKOUT_SESSION_ID} é interpolado
// pelo Stripe — o front pode usá-lo para um recibo/confirmação opcional.
const SUCCESS_URL =
  (Deno.env.get("STRIPE_CHECKOUT_SUCCESS_URL") ?? "").trim() ||
  "https://fontebrasil.online/app/planos?checkout=sucesso&session_id={CHECKOUT_SESSION_ID}";

const CANCEL_URL =
  (Deno.env.get("STRIPE_CHECKOUT_CANCEL_URL") ?? "").trim() ||
  "https://fontebrasil.online/app/planos?checkout=cancelado";

// Dias de teste grátis. 7 por padrão (promessa do produto: "7 dias grátis").
// STRIPE_TRIAL_DAYS=0 desliga o trial sem mexer no código.
function trialDays(): number {
  const raw = (Deno.env.get("STRIPE_TRIAL_DAYS") ?? "").trim();
  if (raw === "") return 7;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 7;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

/** Resolve o e-mail do usuário a partir do token de sessão (GoTrue /auth/v1/user). */
async function resolveUserEmail(token: string): Promise<string | null> {
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) return null;
  try {
    const res = await fetchWithTimeout(
      `${base}/auth/v1/user`,
      { headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${token}` } },
      8000,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string | null };
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    return email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

/** Resolve o price id do plano (env var quando definida, senão o fallback documentado). */
function resolvePriceId(planId: string): string | null {
  const entry = PRICE_BY_PLAN[planId];
  if (!entry) return null;
  const fromEnv = (Deno.env.get(entry.envVar) ?? "").trim();
  return fromEnv.length > 0 ? fromEnv : entry.fallback;
}

interface CreateCheckoutArgs {
  priceId: string;
  planId: string;
  userId: string;
  email: string;
  secretKey: string;
}

// Cria a Checkout Session no Stripe (REST, form-encoded, sem SDK — runtime Deno).
// Pontos-chave da correlação:
//   • client_reference_id = userId (uuid Supabase) → o webhook grava subscriptions.user_id.
//   • metadata[supabase_user_id] / metadata[plan_id] → redundância p/ rastreabilidade.
//   • subscription_data[metadata] → carrega a identidade até o objeto subscription,
//     então eventos customer.subscription.* também conseguem amarrar no usuário.
//   • customer_email pré-preenche e ajuda o Stripe a reusar/casar o Customer.
async function createCheckoutSession(
  args: CreateCheckoutArgs,
): Promise<{ url: string } | { error: string; status: number }> {
  const { priceId, planId, userId, email, secretKey } = args;
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("line_items[0][price]", priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("success_url", SUCCESS_URL);
  body.set("cancel_url", CANCEL_URL);
  // A IDENTIDADE que fecha a correlação no webhook:
  body.set("client_reference_id", userId);
  body.set("customer_email", email);
  body.set("metadata[supabase_user_id]", userId);
  body.set("metadata[email]", email);
  body.set("metadata[plan_id]", planId);
  // Propaga a identidade para o objeto subscription (eventos subscription.*).
  body.set("subscription_data[metadata][supabase_user_id]", userId);
  body.set("subscription_data[metadata][email]", email);
  body.set("subscription_data[metadata][plan_id]", planId);
  // 7 dias grátis (promessa do produto). 0 ⇒ sem trial.
  const days = trialDays();
  if (days > 0) {
    body.set("subscription_data[trial_period_days]", String(days));
  }
  // Permite cupom no checkout hospedado do Stripe (não conflita com cupom interno).
  body.set("allow_promotion_codes", "true");

  let res: Response;
  try {
    res = await fetchWithTimeout(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${secretKey}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
      15000,
    );
  } catch {
    return { error: "Falha de rede ao falar com o Stripe.", status: 502 };
  }

  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.url) {
    // Erro típico: price id inválido/arquivado, ou conta Stripe em modo errado.
    return { error: data.error?.message ?? `Stripe respondeu ${res.status}`, status: 502 };
  }
  return { url: data.url };
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json({ error: "Método não permitido. Use POST." }, 405);
  }

  // Auth própria: exige a chave pública do projeto no header `apikey`.
  const apikey = request.headers.get("apikey") ?? "";
  if (apikey.trim() === "") {
    return json({ error: "apikey ausente" }, 401);
  }

  // Token de sessão do usuário (Bearer). A publishable key NÃO conta como usuário.
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token === PUBLISHABLE_KEY) {
    return json(
      { error: "nao_autenticado", message: "Faça login para assinar." },
      401,
    );
  }

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    return json(
      { error: "stripe_nao_configurado", message: "STRIPE_SECRET_KEY ausente nas Edge Functions." },
      503,
    );
  }

  // Plano pedido pelo front. Valida cedo: só planos com checkout direto.
  let planId = "";
  try {
    const parsed = (await request.json()) as { plan?: unknown; planId?: unknown };
    const raw = parsed.planId ?? parsed.plan;
    planId = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  } catch {
    return json({ error: "payload_invalido", message: "Corpo JSON inválido." }, 400);
  }
  const priceId = resolvePriceId(planId);
  if (!priceId) {
    // Corporativo ("Falar com vendas") ou plano desconhecido: sem checkout direto.
    return json(
      { error: "plano_invalido", message: "Plano sem checkout direto. Fale com vendas." },
      400,
    );
  }

  // Verifica o token contra o Supabase Auth (defesa em profundidade: token forjado
  // ou expirado é rejeitado aqui). O user id retornado é o client_reference_id.
  const userId = await getVerifiedUserId(request, Deno.env.get("SUPABASE_URL") ?? "", PUBLISHABLE_KEY);
  if (!userId) {
    return json({ error: "nao_autenticado", message: "Sessão inválida ou expirada." }, 401);
  }

  const email = await resolveUserEmail(token);
  if (!email) {
    return json({ error: "nao_autenticado", message: "Sessão inválida ou expirada." }, 401);
  }

  const result = await createCheckoutSession({ priceId, planId, userId, email, secretKey });
  if ("error" in result) {
    return json({ error: "checkout_indisponivel", message: result.error }, result.status);
  }
  return json({ url: result.url });
});
