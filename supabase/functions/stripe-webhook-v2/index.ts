// Supabase Edge Function: "stripe-webhook-v2" — bridge de billing.
//
// SUBSTITUI o Worker Cloudflare "fonteia-stripe-webhook"
// (services/stripe-webhook/src/worker.ts). O porte é quase 1:1 na verificação
// de assinatura (HMAC-SHA256 via Web Crypto, sem SDK) e no mapeamento de
// eventos Stripe → linha de `subscriptions` (buildUpsertFromSubscription,
// ciente da API Basil: períodos vivem no item da subscription, não no topo).
//
// O QUE MUDA em relação ao Worker antigo:
//   1. Persistência: em vez de UPSERT solto via PostgREST (Prefer:
//      merge-duplicates), cada evento vira UM patch jsonb entregue à RPC
//      `public.apply_stripe_event` (definida em
//      infra/migrations/0039_stripe_webhook_bridge.sql). A RPC faz dedup real
//      por event.id (stripe_webhook_events) e um guard de ordem por
//      subscription (last_stripe_event_at) — o Worker antigo documentava
//      explicitamente que não tinha storage durável para isso.
//   2. client_reference_id / metadata.supabase_user_id: a stripe-checkout
//      (supabase/functions/stripe-checkout/index.ts) já seta
//      client_reference_id = user id do Supabase e propaga
//      subscription_data.metadata.supabase_user_id. Este webhook lê esses
//      campos e valida como UUID antes de gravar `subscriptions.user_id`,
//      fechando a correlação por uid (não só por e-mail).
//   3. invoice.paid vira NO-OP LOGADO — é aqui que morre o bug de reativação
//      "silenciosa": o Worker antigo recalculava plan_id/status a partir da
//      invoice.paid mesmo quando isso não deveria ser a fonte de verdade;
//      agora quem manda em plan_id/status é exclusivamente
//      customer.subscription.created/updated/deleted.
//
// Cada patch é não-regressivo por construção (mesmo espírito do Worker
// antigo): checkout.session.completed grava só identidade (nunca
// plan_id/status); invoice.payment_failed grava só status='past_due' (nunca
// plan_id, para não rebaixar por engano); subscription.created/updated são a
// fonte de verdade de plan_id/status/períodos; subscription.deleted força
// status='canceled'/plan_id='free'.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   STRIPE_WEBHOOK_SECRET   whsec_... (endpoint NOVO no Stripe apontando para
//                           esta função — não reusar o do Worker antigo, que
//                           deve ser desativado depois que este for validado)
//   STRIPE_PRICE_PRO        price_... do plano Profissional (mesma env var
//                           que a stripe-checkout já usa; default abaixo)
//   STRIPE_PRICE_CORPORATIVO price_... do plano Corporativo (idem)
//   SUPABASE_URL            injetada automaticamente
//   SUPABASE_SERVICE_ROLE_KEY  service_role JWT (chama a RPC apply_stripe_event)
//
// verify_jwt=false (config.toml) — o Stripe não manda um JWT Supabase, manda
// o header `stripe-signature`; a autenticação é 100% a verificação HMAC feita
// aqui dentro. Sem assinatura válida → 400, sem processar nada.

import { fetchWithTimeout } from "../_shared/http.ts";

// ---------------------------------------------------------------------------
// Mapeamento price -> plano. Mesmos defaults documentados em stripe-checkout
// e no Worker antigo — nunca lidos de metadata (metadata é preenchida pelo
// cliente/checkout e não é fonte confiável para autorizar um plano pago).
// ---------------------------------------------------------------------------

type PlanId = "free" | "pro" | "corporativo";

function resolvePriceEnv(envVar: string, fallback: string): string {
  const fromEnv = (Deno.env.get(envVar) ?? "").trim();
  return fromEnv.length > 0 ? fromEnv : fallback;
}

/** Mapa price -> plano, montado a partir das mesmas env vars da stripe-checkout. */
function buildPriceToPlan(): Readonly<Record<string, PlanId>> {
  const pro = resolvePriceEnv("STRIPE_PRICE_PRO", "price_1ThjWB4zjAI9pGd7GOAfQwBT");
  const corporativo = resolvePriceEnv("STRIPE_PRICE_CORPORATIVO", "price_1ThjhR4zjAI9pGd7UyBOlctV");
  return { [pro]: "pro", [corporativo]: "corporativo" };
}

/** Resolve o plano a partir do price id do Stripe. Desconhecido -> 'free'. */
export function getPlanByStripePrice(priceId: string | null | undefined): PlanId {
  if (!priceId) return "free";
  const map = buildPriceToPlan();
  return Object.prototype.hasOwnProperty.call(map, priceId) ? map[priceId] : "free";
}

// ---------------------------------------------------------------------------
// Tolerância de replay para a assinatura (segundos) — igual ao Worker antigo.
// ---------------------------------------------------------------------------

const SIGNATURE_TOLERANCE_SECONDS = 300;

// ---------------------------------------------------------------------------
// Interfaces mínimas dos objetos Stripe usados (apenas campos necessários).
// ---------------------------------------------------------------------------

interface StripeEvent {
  id?: string;
  type?: string;
  created?: number; // epoch seconds — vira p_event_created (TIMESTAMPTZ) na RPC
  data?: {
    object?: unknown;
  };
}

interface StripeSubscriptionItem {
  price?: {
    id?: string;
    product?: string;
  } | null;
  // API Basil (2025-03-31+): períodos vivem no item, não no topo da subscription.
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
  metadata?: Record<string, string | undefined> | null;
  items?: {
    data?: StripeSubscriptionItem[];
  };
}

interface StripeCheckoutSessionObject {
  customer?: string;
  subscription?: string;
  client_reference_id?: string | null;
  customer_details?: {
    email?: string | null;
  } | null;
  customer_email?: string | null;
  metadata?: Record<string, string | undefined> | null;
}

interface StripeInvoiceObject {
  customer?: string;
  subscription?: string;
  customer_email?: string | null;
}

// ---------------------------------------------------------------------------
// Patch aplicado via RPC apply_stripe_event. Só chaves presentes (não-undefined)
// são escritas pela RPC — undefined aqui vira "campo ausente" no jsonb.
// ---------------------------------------------------------------------------

interface SubscriptionPatch {
  stripe_subscription_id: string;
  email?: string;
  user_id?: string;
  stripe_customer_id?: string;
  stripe_price_id?: string;
  stripe_product_id?: string;
  plan_id?: PlanId;
  status?: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
}

// ---------------------------------------------------------------------------
// Verificação de assinatura (Stripe-Signature) com Web Crypto — HMAC-SHA256.
// Porte 1:1 do Worker antigo (services/stripe-webhook/src/worker.ts).
// ---------------------------------------------------------------------------

/** Converte ArrayBuffer em string hex minúscula. */
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

/** Comparação de strings hex em tempo constante (anti timing-attack). */
export function timingSafeEqualHex(a: string, b: string): boolean {
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
export function parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } | null {
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
 * Rejeita se a assinatura não bater ou se |now - t| > tolerância.
 */
export async function verifyStripeSignature(
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
// Helpers de extração dos objetos Stripe
// ---------------------------------------------------------------------------

/** Converte epoch (segundos) em ISO 8601, ou undefined se ausente/inválido. */
function epochToIso(seconds: number | null | undefined): string | undefined {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return new Date(seconds * 1000).toISOString();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Adiciona um campo a um objeto somente quando o valor está definido. */
function setIfDefined<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

// UUID v1-v5 — mesma forma usada pelo Supabase Auth (gen_random_uuid()/auth.uid()).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Valida e normaliza um possível user id (client_reference_id / metadata.supabase_user_id). */
export function asValidUserId(raw: string | null | undefined): string | undefined {
  const value = (raw ?? "").trim();
  return UUID_RE.test(value) ? value : undefined;
}

function normalizeEmail(raw: string | null | undefined): string | undefined {
  const value = (raw ?? "").trim().toLowerCase();
  return value.length > 0 ? value : undefined;
}

/** Primeiro item de assinatura (price/product) quando presente. */
function firstSubscriptionItem(sub: StripeSubscriptionObject): StripeSubscriptionItem | undefined {
  const items = sub.items?.data;
  if (items && items.length > 0) {
    return items[0];
  }
  return undefined;
}

/**
 * Constrói o patch completo (plan_id + status + períodos) a partir de um
 * objeto subscription do Stripe. Usado por customer.subscription.created,
 * .updated e .deleted (com forceStatus/forcePlan neste último).
 */
export function buildPatchFromSubscription(
  sub: StripeSubscriptionObject,
  options: { forceStatus?: string; forcePlan?: PlanId } = {},
): SubscriptionPatch | null {
  const subscriptionId = sub.id;
  if (!subscriptionId) {
    return null;
  }

  const item = firstSubscriptionItem(sub);
  const priceId = item?.price?.id;
  const productId = item?.price?.product;

  const status = options.forceStatus ?? sub.status ?? "free";
  const planId = options.forcePlan ?? getPlanByStripePrice(priceId);

  // Períodos: API Basil (2025+) traz no item; APIs antigas, no topo da subscription.
  const periodStart = item?.current_period_start ?? sub.current_period_start;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;

  const patch: SubscriptionPatch = {
    stripe_subscription_id: subscriptionId,
    plan_id: planId,
    status,
  };

  setIfDefined(patch, "stripe_customer_id", sub.customer);
  setIfDefined(patch, "stripe_price_id", priceId);
  setIfDefined(patch, "stripe_product_id", productId);
  setIfDefined(patch, "current_period_start", epochToIso(periodStart));
  setIfDefined(patch, "current_period_end", epochToIso(periodEnd));
  setIfDefined(
    patch,
    "cancel_at_period_end",
    typeof sub.cancel_at_period_end === "boolean" ? sub.cancel_at_period_end : undefined,
  );
  setIfDefined(patch, "user_id", asValidUserId(sub.metadata?.supabase_user_id));
  setIfDefined(patch, "email", normalizeEmail(sub.metadata?.email));

  return patch;
}

// ---------------------------------------------------------------------------
// Persistência via RPC apply_stripe_event (service_role).
// ---------------------------------------------------------------------------

/** Falha ao chamar a RPC (Supabase fora / 5xx / erro de rede). Sinaliza 503. */
class PersistenceError extends Error {}

type ApplyResult = "duplicate" | "stale" | "applied";

async function applyStripeEvent(
  supabaseUrl: string,
  serviceRoleKey: string,
  eventId: string,
  eventType: string,
  eventCreatedIso: string,
  patch: SubscriptionPatch,
): Promise<ApplyResult> {
  const url = `${supabaseUrl}/rest/v1/rpc/apply_stripe_event`;
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        p_event_id: eventId,
        p_event_type: eventType,
        p_event_created: eventCreatedIso,
        p_patch: patch,
      }),
    },
    15000,
  );

  if (!response.ok) {
    const detail = await response.text();
    // Não vaza secrets — apenas status e corpo de erro do PostgREST/RPC.
    throw new PersistenceError(`apply_stripe_event failed [${response.status}]: ${detail}`);
  }

  const result = (await response.json()) as ApplyResult;
  return result;
}

// ---------------------------------------------------------------------------
// Tratamento dos eventos
//
// Cada handler monta APENAS o patch (função pura, testável) — quem chama a
// RPC é o laço em `handleEvent`. Mantém o mesmo princípio de não-regressão do
// Worker antigo: cada tipo de evento só escreve os campos dos quais é a fonte
// de verdade.
// ---------------------------------------------------------------------------

/** checkout.session.completed -> patch SÓ de identidade (nunca plan/status). */
export function buildIdentityPatchFromCheckoutSession(
  session: StripeCheckoutSessionObject,
): SubscriptionPatch | null {
  const subscriptionId = session.subscription;
  if (!subscriptionId) {
    return null;
  }
  const email =
    normalizeEmail(session.customer_details?.email) ??
    normalizeEmail(session.customer_email) ??
    normalizeEmail(session.metadata?.email);
  const userId = asValidUserId(session.client_reference_id) ?? asValidUserId(session.metadata?.supabase_user_id);

  const patch: SubscriptionPatch = { stripe_subscription_id: subscriptionId };
  setIfDefined(patch, "stripe_customer_id", session.customer);
  setIfDefined(patch, "email", email);
  setIfDefined(patch, "user_id", userId);
  return patch;
}

/** invoice.payment_failed -> patch SÓ de status (nunca plan_id, para não rebaixar por engano). */
export function buildPastDuePatchFromInvoice(invoice: StripeInvoiceObject): SubscriptionPatch | null {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) {
    return null;
  }
  const patch: SubscriptionPatch = { stripe_subscription_id: subscriptionId, status: "past_due" };
  setIfDefined(patch, "stripe_customer_id", invoice.customer);
  setIfDefined(patch, "email", normalizeEmail(invoice.customer_email));
  return patch;
}

interface HandleEventDeps {
  supabaseUrl: string;
  serviceRoleKey: string;
}

async function handleEvent(deps: HandleEventDeps, event: StripeEvent): Promise<void> {
  const type = event.type;
  const object = event.data?.object;
  const eventId = event.id;
  const eventCreatedIso = epochToIso(event.created) ?? new Date().toISOString();

  if (!type || !eventId || !isObject(object)) {
    console.log(`[stripe-webhook-v2] evento ignorado (sem type/id/object): ${type ?? "<sem type>"}`);
    return;
  }

  let patch: SubscriptionPatch | null = null;

  switch (type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      patch = buildPatchFromSubscription(object as StripeSubscriptionObject);
      break;
    }

    case "customer.subscription.deleted": {
      // Cancelada -> volta para free. Fonte de verdade explícita: não depende
      // do status/price que o Stripe mandar no payload de delete.
      patch = buildPatchFromSubscription(object as StripeSubscriptionObject, {
        forceStatus: "canceled",
        forcePlan: "free",
      });
      break;
    }

    case "checkout.session.completed": {
      patch = buildIdentityPatchFromCheckoutSession(object as StripeCheckoutSessionObject);
      if (!patch) {
        console.log("[stripe-webhook-v2] checkout.session.completed sem subscription — ignorado");
      }
      break;
    }

    case "invoice.paid": {
      // NO-OP LOGADO por design: plan_id/status são fonte de verdade EXCLUSIVA
      // de customer.subscription.created/updated. Reativar/promover plano a
      // partir de invoice.paid foi o bug de reativação silenciosa do desenho
      // anterior — morre aqui.
      console.log(
        `[stripe-webhook-v2] invoice.paid: no-op (fonte de verdade é customer.subscription.*) id=${eventId}`,
      );
      return;
    }

    case "invoice.payment_failed": {
      patch = buildPastDuePatchFromInvoice(object as StripeInvoiceObject);
      if (!patch) {
        console.log("[stripe-webhook-v2] invoice.payment_failed sem subscription — ignorado");
      }
      break;
    }

    default: {
      console.log(`[stripe-webhook-v2] evento não tratado: ${type}`);
      return;
    }
  }

  if (!patch) {
    return;
  }

  const result = await applyStripeEvent(
    deps.supabaseUrl,
    deps.serviceRoleKey,
    eventId,
    type,
    eventCreatedIso,
    patch,
  );
  console.log(
    `[stripe-webhook-v2] ${type}: sub=${patch.stripe_subscription_id} result=${result} plan=${patch.plan_id ?? "-"} status=${patch.status ?? "-"}`,
  );
}

// ---------------------------------------------------------------------------
// fetch handler
// ---------------------------------------------------------------------------

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error(
      "[stripe-webhook-v2] secrets ausentes — verifique STRIPE_WEBHOOK_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
    );
    return new Response("Server misconfigured", { status: 500 });
  }

  // Corpo RAW + header de assinatura — a verificação precisa do texto exato
  // recebido, antes de qualquer JSON.parse.
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  const valid = await verifyStripeSignature(rawBody, signature, webhookSecret);
  if (!valid) {
    console.warn("[stripe-webhook-v2] assinatura inválida ou fora da janela de tolerância — rejeitado (400)");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    console.warn("[stripe-webhook-v2] corpo não é JSON válido — rejeitado (400)");
    return new Response("Invalid payload", { status: 400 });
  }

  try {
    await handleEvent({ supabaseUrl, serviceRoleKey }, event);
  } catch (error) {
    // PersistenceError (RPC falhou) -> 503, Stripe re-tenta.
    // Qualquer outro erro inesperado -> 200, não re-tentar (não deveria ocorrer
    // aqui; handlers de evento não lançam fora do caminho de persistência).
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof PersistenceError ? 503 : 200;
    console.error(`[stripe-webhook-v2] erro ao processar ${event.type ?? "<sem type>"} (status ${status}): ${message}`);
    if (status === 503) {
      return new Response("Persistence error, retry", { status: 503 });
    }
    return new Response("Received (processing error logged)", { status: 200 });
  }

  return new Response("OK", { status: 200 });
});
