// Supabase Edge Function: "stripe-portal" — abre o Stripe Customer Portal do usuário.
//
// AUTENTICAÇÃO PRÓPRIA (verify_jwt=false, igual à "fonteia"): exige o header `apikey`
// (chave pública do projeto) + o token de sessão do usuário no header Authorization
// (Bearer <access_token>). Com o token descobrimos o e-mail do usuário (Supabase Auth),
// achamos o stripe_customer_id na tabela `subscriptions` (service_role) e pedimos ao
// Stripe uma sessão do Customer Portal (gerenciar/cancelar assinatura, trocar cartão).
//
// Por que verify_jwt=false? O gateway do Supabase rejeitava o token de sessão como
// "apikey" inválida e quebrava a chamada — o mesmo motivo da função "fonteia". A auth
// é feita aqui dentro: sem apikey ⇒ 401; sem token de usuário ⇒ 401.
//
// Secrets (Supabase → Edge Functions → Secrets) — já existentes p/ as funções stripe-*:
//   STRIPE_SECRET_KEY          sk_live_... (mesma usada pelo stripe-worker)
//   SUPABASE_URL               injetado automaticamente
//   SUPABASE_SERVICE_ROLE_KEY  injetado automaticamente

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
  "access-control-max-age": "86400",
};

// Chave pública do projeto (mesma da "fonteia"): aceita como `apikey` válida quando o
// front chama com a publishable key, e diferencia do token de sessão do usuário.
const PUBLISHABLE_KEY = "sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ";

// Para onde o Stripe devolve o usuário ao sair do portal. Sobrescreva via secret
// STRIPE_PORTAL_RETURN_URL se o domínio mudar; default = app em produção.
const RETURN_URL =
  (Deno.env.get("STRIPE_PORTAL_RETURN_URL") ?? "").trim() ||
  "https://fontebrasil.online/app/conta";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

// Resolve o e-mail do usuário a partir do token de sessão (GoTrue /auth/v1/user).
async function resolveUserEmail(token: string): Promise<string | null> {
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) return null;
  try {
    const res = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string | null };
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    return email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

// Acha o stripe_customer_id mais recente do usuário (por e-mail) via service_role.
// Aceita qualquer status (active/trialing/past_due/canceled): o portal serve para
// gerenciar/reativar/baixar faturas mesmo após cancelamento.
async function findStripeCustomerId(email: string): Promise<string | null> {
  const base = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !serviceKey) return null;
  try {
    const url = new URL(`${base}/rest/v1/subscriptions`);
    url.searchParams.set("select", "stripe_customer_id,updated_at");
    url.searchParams.set("email", `eq.${email}`);
    url.searchParams.set("stripe_customer_id", "not.is.null");
    url.searchParams.set("order", "updated_at.desc");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString(), {
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ stripe_customer_id?: string | null }>;
    const id = rows[0]?.stripe_customer_id;
    return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
  } catch {
    return null;
  }
}

// Cria a sessão do Customer Portal no Stripe (REST, form-encoded, sem SDK).
async function createPortalSession(
  customerId: string,
  secretKey: string,
): Promise<{ url: string } | { error: string; status: number }> {
  const body = new URLSearchParams();
  body.set("customer", customerId);
  body.set("return_url", RETURN_URL);
  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const data = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !data.url) {
    // Erro típico aqui: portal ainda não ativado no dashboard do Stripe.
    return {
      error: data.error?.message ?? `Stripe respondeu ${res.status}`,
      status: 502,
    };
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
    return json({ error: "nao_autenticado", message: "Faça login para gerenciar a assinatura." }, 401);
  }

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    return json(
      { error: "stripe_nao_configurado", message: "STRIPE_SECRET_KEY ausente nas Edge Functions." },
      503,
    );
  }

  const email = await resolveUserEmail(token);
  if (!email) {
    return json({ error: "nao_autenticado", message: "Sessão inválida ou expirada." }, 401);
  }

  const customerId = await findStripeCustomerId(email);
  if (!customerId) {
    // Degrade elegante: sem assinatura/cliente no Stripe ⇒ 404 (front cai no contato).
    return json(
      {
        error: "sem_assinatura",
        message: "Nenhuma assinatura encontrada para este e-mail. Fale com contato@olli.com.br.",
      },
      404,
    );
  }

  const result = await createPortalSession(customerId, secretKey);
  if ("error" in result) {
    return json({ error: "portal_indisponivel", message: result.error }, result.status);
  }
  return json({ url: result.url });
});
