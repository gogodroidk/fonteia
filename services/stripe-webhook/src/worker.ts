/**
 * fonteia-stripe-webhook
 *
 * Worker isolado que libera o plano automaticamente apos pagamento no Stripe (modo LIVE).
 * Recebe eventos via webhook, valida a assinatura manualmente com Web Crypto (sem SDK)
 * e faz UPSERT na tabela `subscriptions` do Supabase via PostgREST com a service_role key.
 *
 * Secrets (configurar com `wrangler secret put` — NUNCA versionar):
 *   STRIPE_WEBHOOK_SECRET      whsec_...
 *   SUPABASE_URL               https://pwiuiihsyazghdsrpshg.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service_role JWT
 */

// ---------------------------------------------------------------------------
// Tipos do ambiente e do handler (sem @cloudflare/workers-types — so Web APIs)
// ---------------------------------------------------------------------------

export interface Env {
  STRIPE_WEBHOOK_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ExportedHandler<E> {
  fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response>;
}

// ---------------------------------------------------------------------------
// Mapeamento price -> plano (dados publicos, podem ficar no codigo)
// ---------------------------------------------------------------------------

type PlanId = "free" | "pro" | "corporativo";

const PRICE_TO_PLAN: Readonly<Record<string, PlanId>> = {
  price_1ThjWB4zjAI9pGd7GOAfQwBT: "pro",
  price_1ThjhR4zjAI9pGd7UyBOlctV: "corporativo",
};

/** Resolve o plano a partir do price id do Stripe. Desconhecido -> 'free'. */
function getPlanByStripePrice(priceId: string | null | undefined): PlanId {
  if (priceId && Object.prototype.hasOwnProperty.call(PRICE_TO_PLAN, priceId)) {
    return PRICE_TO_PLAN[priceId] ?? "free";
  }
  return "free";
}

// ---------------------------------------------------------------------------
// Tolerancia de replay para a assinatura (segundos)
// ---------------------------------------------------------------------------

const SIGNATURE_TOLERANCE_SECONDS = 300;

// ---------------------------------------------------------------------------
// Interfaces minimas dos objetos Stripe usados (apenas campos necessarios).
// O Stripe envia muito mais campos; ignoramos o restante de forma segura.
// ---------------------------------------------------------------------------

interface StripeEvent {
  id?: string;
  type?: string;
  data?: {
    object?: unknown;
  };
}

interface StripeSubscriptionItem {
  price?: {
    id?: string;
    product?: string;
  } | null;
  // A partir da API Basil (2025-03-31) os periodos vivem no item, nao no topo da subscription.
  current_period_start?: number;
  current_period_end?: number;
}

interface StripeSubscriptionObject {
  id?: string;
  customer?: string;
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  items?: {
    data?: StripeSubscriptionItem[];
  };
}

interface StripeCheckoutSessionObject {
  customer?: string;
  subscription?: string;
  customer_details?: {
    email?: string | null;
  } | null;
  customer_email?: string | null;
}

interface StripeInvoiceLineObject {
  price?: {
    id?: string;
    product?: string;
  } | null;
  period?: {
    start?: number;
    end?: number;
  } | null;
}

interface StripeInvoiceObject {
  customer?: string;
  subscription?: string;
  customer_email?: string | null;
  lines?: {
    data?: StripeInvoiceLineObject[];
  };
}

/** Linha que vai para a tabela `subscriptions` (apenas campos escritos pelo Worker). */
interface SubscriptionUpsert {
  stripe_customer_id?: string;
  stripe_subscription_id: string;
  stripe_price_id?: string;
  stripe_product_id?: string;
  plan_id: PlanId;
  status: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  email?: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Verificacao de assinatura (Stripe-Signature) com Web Crypto — HMAC-SHA256
// ---------------------------------------------------------------------------

/** Converte ArrayBuffer em string hex minuscula. */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** HMAC-SHA256(secret, message) -> hex. */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bufferToHex(signature);
}

/** Comparacao de strings hex em tempo constante (anti timing-attack). */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Faz o parse do header Stripe-Signature no formato `t=<ts>,v1=<sig>,v1=<sig>...`. */
function parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const scheme = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (scheme === "t") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        timestamp = parsed;
      }
    } else if (scheme === "v1") {
      signatures.push(value);
    }
  }

  if (timestamp === null || signatures.length === 0) {
    return null;
  }
  return { timestamp, signatures };
}

/**
 * Verifica a assinatura do webhook Stripe.
 * signedPayload = `${t}.${rawBody}`; compara HMAC-SHA256 hex em tempo constante com cada `v1`.
 * Rejeita se a assinatura nao bater ou se |now - t| > tolerancia.
 */
async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): Promise<boolean> {
  if (!signatureHeader || !secret) {
    return false;
  }

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    return false;
  }

  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expected = await hmacSha256Hex(secret, signedPayload);

  for (const candidate of parsed.signatures) {
    if (timingSafeEqualHex(expected, candidate)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helpers de extracao dos objetos Stripe
// ---------------------------------------------------------------------------

/** Converte epoch (segundos) em ISO 8601, ou undefined se ausente/invalido. */
function epochToIso(seconds: number | null | undefined): string | undefined {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return new Date(seconds * 1000).toISOString();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Adiciona um campo a um objeto somente quando o valor esta definido (respeita exactOptionalPropertyTypes). */
function setIfDefined<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

/** Primeiro item de assinatura (price/product) quando presente. */
function firstSubscriptionItem(sub: StripeSubscriptionObject): StripeSubscriptionItem | undefined {
  const items = sub.items?.data;
  if (items && items.length > 0) {
    return items[0];
  }
  return undefined;
}

/** Constroi a linha de UPSERT a partir de um objeto subscription do Stripe. */
function buildUpsertFromSubscription(
  sub: StripeSubscriptionObject,
  options: { forceStatus?: string; forcePlan?: PlanId; email?: string } = {},
): SubscriptionUpsert | null {
  const subscriptionId = sub.id;
  if (!subscriptionId) {
    return null;
  }

  const item = firstSubscriptionItem(sub);
  const priceId = item?.price?.id;
  const productId = item?.price?.product;

  const status = options.forceStatus ?? sub.status ?? "free";
  const planId = options.forcePlan ?? getPlanByStripePrice(priceId);

  // Periodos: API Basil (2025+) traz no item; APIs antigas, no topo da subscription. Aceitamos os dois.
  const periodStart = item?.current_period_start ?? sub.current_period_start;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;

  const row: SubscriptionUpsert = {
    stripe_subscription_id: subscriptionId,
    plan_id: planId,
    status,
    updated_at: new Date().toISOString(),
  };

  setIfDefined(row, "stripe_customer_id", sub.customer);
  setIfDefined(row, "stripe_price_id", priceId);
  setIfDefined(row, "stripe_product_id", productId);
  setIfDefined(row, "current_period_start", epochToIso(periodStart));
  setIfDefined(row, "current_period_end", epochToIso(periodEnd));
  setIfDefined(
    row,
    "cancel_at_period_end",
    typeof sub.cancel_at_period_end === "boolean" ? sub.cancel_at_period_end : undefined,
  );
  setIfDefined(row, "email", options.email);

  return row;
}

// ---------------------------------------------------------------------------
// Persistencia no Supabase via PostgREST (UPSERT on stripe_subscription_id)
// ---------------------------------------------------------------------------

async function upsertSubscription(env: Env, row: SubscriptionUpsert): Promise<void> {
  const url = `${env.SUPABASE_URL}/rest/v1/subscriptions?on_conflict=stripe_subscription_id`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    const detail = await response.text();
    // Nao vaza secrets — apenas status e corpo de erro do PostgREST.
    throw new Error(`Supabase upsert failed [${response.status}]: ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Tratamento dos eventos
// ---------------------------------------------------------------------------

async function handleEvent(env: Env, event: StripeEvent): Promise<void> {
  const type = event.type;
  const object = event.data?.object;

  if (!type || !isObject(object)) {
    console.log(`[stripe-webhook] evento ignorado (sem type ou object): ${type ?? "<sem type>"}`);
    return;
  }

  switch (type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = object as StripeSubscriptionObject;
      const row = buildUpsertFromSubscription(sub);
      if (row) {
        await upsertSubscription(env, row);
        console.log(
          `[stripe-webhook] ${type}: sub=${row.stripe_subscription_id} status=${row.status} plan=${row.plan_id}`,
        );
      }
      return;
    }

    case "customer.subscription.deleted": {
      const sub = object as StripeSubscriptionObject;
      // Cancelada -> volta para free.
      const row = buildUpsertFromSubscription(sub, { forceStatus: "canceled", forcePlan: "free" });
      if (row) {
        await upsertSubscription(env, row);
        console.log(`[stripe-webhook] subscription.deleted: sub=${row.stripe_subscription_id} -> canceled/free`);
      }
      return;
    }

    case "checkout.session.completed": {
      const session = object as StripeCheckoutSessionObject;
      const subscriptionId = session.subscription;
      // Sem subscription (ex.: pagamento avulso) — nada a liberar como assinatura.
      if (!subscriptionId) {
        console.log("[stripe-webhook] checkout.session.completed sem subscription — ignorado");
        return;
      }
      const email = session.customer_details?.email ?? session.customer_email ?? undefined;
      // O objeto da sessao nao traz price/period; criamos a linha base.
      // Os eventos subscription.created/updated chegam em seguida e completam os campos.
      const row: SubscriptionUpsert = {
        stripe_subscription_id: subscriptionId,
        plan_id: "free",
        status: "incomplete",
        updated_at: new Date().toISOString(),
      };
      setIfDefined(row, "stripe_customer_id", session.customer);
      setIfDefined(row, "email", email ?? undefined);
      await upsertSubscription(env, row);
      console.log(`[stripe-webhook] checkout.session.completed: sub=${subscriptionId} email=${email ?? "?"}`);
      return;
    }

    case "invoice.paid": {
      const invoice = object as StripeInvoiceObject;
      const subscriptionId = invoice.subscription;
      if (!subscriptionId) {
        console.log("[stripe-webhook] invoice.paid sem subscription — ignorado");
        return;
      }
      const line = invoice.lines?.data?.[0];
      const priceId = line?.price?.id;
      const productId = line?.price?.product;
      const email = invoice.customer_email ?? undefined;

      const row: SubscriptionUpsert = {
        stripe_subscription_id: subscriptionId,
        plan_id: getPlanByStripePrice(priceId),
        status: "active",
        updated_at: new Date().toISOString(),
      };
      setIfDefined(row, "stripe_customer_id", invoice.customer);
      setIfDefined(row, "stripe_price_id", priceId);
      setIfDefined(row, "stripe_product_id", productId);
      setIfDefined(row, "current_period_start", epochToIso(line?.period?.start));
      setIfDefined(row, "current_period_end", epochToIso(line?.period?.end));
      setIfDefined(row, "email", email ?? undefined);
      await upsertSubscription(env, row);
      console.log(`[stripe-webhook] invoice.paid: sub=${subscriptionId} -> active plan=${row.plan_id}`);
      return;
    }

    case "invoice.payment_failed": {
      const invoice = object as StripeInvoiceObject;
      const subscriptionId = invoice.subscription;
      if (!subscriptionId) {
        console.log("[stripe-webhook] invoice.payment_failed sem subscription — ignorado");
        return;
      }
      const email = invoice.customer_email ?? undefined;
      const row: SubscriptionUpsert = {
        stripe_subscription_id: subscriptionId,
        plan_id: getPlanByStripePrice(invoice.lines?.data?.[0]?.price?.id),
        status: "past_due",
        updated_at: new Date().toISOString(),
      };
      setIfDefined(row, "stripe_customer_id", invoice.customer);
      setIfDefined(row, "email", email ?? undefined);
      await upsertSubscription(env, row);
      console.log(`[stripe-webhook] invoice.payment_failed: sub=${subscriptionId} -> past_due`);
      return;
    }

    default: {
      console.log(`[stripe-webhook] evento nao tratado: ${type}`);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// fetch handler
// ---------------------------------------------------------------------------

const handler: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. So aceita POST.
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Sanidade de configuracao (sem vazar valores).
    if (!env.STRIPE_WEBHOOK_SECRET || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[stripe-webhook] secrets ausentes — verifique STRIPE_WEBHOOK_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
      // Erro de config nosso: 500 (Stripe ira tentar novamente).
      return new Response("Server misconfigured", { status: 500 });
    }

    // 1. Corpo RAW + header de assinatura.
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature");

    // 2. Validacao manual da assinatura (HMAC-SHA256). Invalida -> 400.
    const valid = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      console.warn("[stripe-webhook] assinatura invalida ou fora da janela de tolerancia — rejeitado (400)");
      return new Response("Invalid signature", { status: 400 });
    }

    // 3. Parse do JSON e processamento.
    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody) as StripeEvent;
    } catch {
      console.warn("[stripe-webhook] corpo nao e JSON valido — rejeitado (400)");
      return new Response("Invalid payload", { status: 400 });
    }

    try {
      await handleEvent(env, event);
    } catch (error) {
      // 7. Erro de processamento: logar sem vazar secrets e responder 200
      // para evitar retry infinito do Stripe. So a assinatura invalida retorna 400.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[stripe-webhook] erro ao processar ${event.type ?? "<sem type>"}: ${message}`);
      return new Response("Received (processing error logged)", { status: 200 });
    }

    // 7. Responde 200 rapidamente.
    return new Response("OK", { status: 200 });
  },
};

export default handler;
