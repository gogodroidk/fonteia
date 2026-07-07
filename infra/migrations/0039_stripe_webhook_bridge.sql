-- =============================================================================
-- 0039_stripe_webhook_bridge.sql
-- Ponte de billing: substitui o Worker Cloudflare "fonteia-stripe-webhook"
-- (services/stripe-webhook/src/worker.ts) por uma Edge Function Supabase
-- (supabase/functions/stripe-webhook-v2/index.ts) que fala direto com o banco
-- via RPC SECURITY DEFINER, em vez de UPSERT solto por PostgREST.
--
-- Por que uma RPC em vez do UPSERT PostgREST que o Worker antigo usava:
--   1) Dedup real de evento (event.id) — o Worker antigo documentava
--      explicitamente que NAO tinha storage duravel para isso (comentario em
--      worker.ts: "Nao ha storage duravel neste Worker... logo NAO existe
--      dedup por event.id"). Aqui, stripe_webhook_events fecha essa lacuna.
--   2) Guard de ORDEM — o Stripe nao garante ordem de entrega. O Worker antigo
--      contornava isso fazendo cada escrita ser "nao-regressiva" por
--      construcao (checkout.session.completed nunca grava plan/status, etc).
--      Esse design continua valendo na Edge Function (ver stripe-webhook-v2),
--      mas agora ganha uma segunda camada: a RPC so aplica um patch se
--      p_event_created for >= ao last_stripe_event_at ja gravado para aquela
--      subscription, entao um evento antigo entregue atrasado (fora de ordem)
--      nao pisa num estado mais novo mesmo dentro do mesmo tipo de evento.
--
-- NAO aplicar automaticamente — o orquestrador roda isto via MCP apply_migration
-- depois de revisar. Idempotente (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) subscriptions.last_stripe_event_at — timestamp do evento mais recente
--    (event.created do Stripe, nao o received_at local) que gravou aquela
--    linha. Usado pela RPC como cursor de ordenacao por subscription.
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_stripe_event_at TIMESTAMPTZ;

-- user_id: correlação com auth.users (o checkout roda logado; client_reference_id
-- traz o uid). Hoje my_plan() casa por email; user_id habilita a 2ª onda
-- (correlação por uid, imune a email divergente entre Stripe e login).
-- Verificado em 2026-07-07: a coluna NÃO existia em produção — sem este ALTER
-- a RPC abaixo falharia em runtime no primeiro pagamento real.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2) stripe_webhook_events — dedup de event.id. Fechada por design: RLS
--    habilitada e SEM policies, entao nem anon nem authenticated enxergam ou
--    escrevem nela (nem via SELECT) — so service_role (bypassa RLS) ou codigo
--    SECURITY DEFINER (roda como owner, tambem bypassa RLS) tocam a tabela.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id    TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Sem GRANT a anon/authenticated e sem nenhuma policy: a tabela fica
-- inacessivel para esses roles mesmo que um dia ganhem GRANT por engano em
-- outra migration (RLS sem policy = nega tudo, inclusive para o dono da linha).
REVOKE ALL ON public.stripe_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.stripe_webhook_events TO service_role;

-- ---------------------------------------------------------------------------
-- 3) apply_stripe_event — ponto unico de escrita para o webhook.
--
--    Contrato:
--      p_event_id      Stripe event.id (dedup key)
--      p_event_type    Stripe event.type (so para o log em stripe_webhook_events)
--      p_event_created TIMESTAMPTZ do event.created (epoch -> to_timestamp já
--                      feito pela Edge Function antes de chamar a RPC)
--      p_patch         jsonb com os campos a aplicar em subscriptions. Chaves
--                      aceitas (todas opcionais, so sobrescreve o que vier
--                      nao-nulo): stripe_subscription_id (obrigatoria dentro
--                      do patch — é a chave de conflito), email, user_id,
--                      stripe_customer_id, stripe_price_id, stripe_product_id,
--                      plan_id, status, current_period_start,
--                      current_period_end, cancel_at_period_end.
--
--    Retorno (text): 'duplicate' | 'stale' | 'applied'
--      duplicate  event_id ja processado antes (ON CONFLICT DO NOTHING no
--                 insert de stripe_webhook_events) — nao mexeu em subscriptions.
--      stale      event_id era novo, mas p_event_created é mais antigo que o
--                 last_stripe_event_at ja gravado para essa subscription —
--                 nao aplica o patch (evita regressao por entrega fora de ordem).
--      applied    patch aplicado (insert ou update) e last_stripe_event_at
--                 avancado para p_event_created.
--
--    Sempre SECURITY DEFINER + search_path fixo (mesmo padrao hardened de
--    0018_security_hardening.sql). REVOKE de public/anon/authenticated: so
--    service_role (usado pela Edge Function com a service role key) chama.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_stripe_event(
  p_event_id      TEXT,
  p_event_type    TEXT,
  p_event_created TIMESTAMPTZ,
  p_patch         JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub_id  TEXT := p_patch ->> 'stripe_subscription_id';
  v_current TIMESTAMPTZ;
BEGIN
  IF v_sub_id IS NULL OR v_sub_id = '' THEN
    RAISE EXCEPTION 'apply_stripe_event: p_patch.stripe_subscription_id é obrigatório';
  END IF;

  -- (a) Dedup: registra o evento; se já existir, é reentrega do Stripe — no-op.
  INSERT INTO public.stripe_webhook_events (event_id, type, received_at)
  VALUES (p_event_id, p_event_type, now())
  ON CONFLICT (event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 'duplicate';
  END IF;

  -- (b) Guard de ordem: só aplica se este evento é >= o último aplicado
  -- para esta subscription (por stripe_subscription_id). Subscription nova
  -- (ainda não existe) sempre passa (coalesce com '-infinity').
  SELECT last_stripe_event_at INTO v_current
  FROM public.subscriptions
  WHERE stripe_subscription_id = v_sub_id;

  IF p_event_created < COALESCE(v_current, '-infinity'::timestamptz) THEN
    RETURN 'stale';
  END IF;

  -- (c) Upsert: só sobrescreve campos presentes (não-nulos) no patch.
  -- COALESCE(EXCLUDED.x, subscriptions.x) preserva o valor existente quando
  -- o patch não trouxe aquele campo (mesmo espírito do merge-duplicates do
  -- PostgREST usado pelo Worker antigo, agora explícito e testável em SQL).
  INSERT INTO public.subscriptions (
    stripe_subscription_id,
    email,
    user_id,
    stripe_customer_id,
    stripe_price_id,
    stripe_product_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    last_stripe_event_at,
    updated_at
  )
  VALUES (
    v_sub_id,
    NULLIF(p_patch ->> 'email', ''),
    NULLIF(p_patch ->> 'user_id', '')::uuid,
    NULLIF(p_patch ->> 'stripe_customer_id', ''),
    NULLIF(p_patch ->> 'stripe_price_id', ''),
    NULLIF(p_patch ->> 'stripe_product_id', ''),
    COALESCE(NULLIF(p_patch ->> 'plan_id', ''), 'free'),
    COALESCE(NULLIF(p_patch ->> 'status', ''), 'free'),
    CASE WHEN p_patch ? 'current_period_start'
         THEN (p_patch ->> 'current_period_start')::timestamptz END,
    CASE WHEN p_patch ? 'current_period_end'
         THEN (p_patch ->> 'current_period_end')::timestamptz END,
    CASE WHEN p_patch ? 'cancel_at_period_end'
         THEN (p_patch ->> 'cancel_at_period_end')::boolean END,
    p_event_created,
    now()
  )
  ON CONFLICT (stripe_subscription_id) DO UPDATE SET
    email                 = COALESCE(NULLIF(EXCLUDED.email, ''), subscriptions.email),
    user_id                = COALESCE(EXCLUDED.user_id, subscriptions.user_id),
    stripe_customer_id     = COALESCE(NULLIF(EXCLUDED.stripe_customer_id, ''), subscriptions.stripe_customer_id),
    stripe_price_id        = COALESCE(NULLIF(EXCLUDED.stripe_price_id, ''), subscriptions.stripe_price_id),
    stripe_product_id      = COALESCE(NULLIF(EXCLUDED.stripe_product_id, ''), subscriptions.stripe_product_id),
    plan_id                = CASE WHEN p_patch ? 'plan_id' THEN EXCLUDED.plan_id ELSE subscriptions.plan_id END,
    status                 = CASE WHEN p_patch ? 'status' THEN EXCLUDED.status ELSE subscriptions.status END,
    current_period_start   = CASE WHEN p_patch ? 'current_period_start' THEN EXCLUDED.current_period_start ELSE subscriptions.current_period_start END,
    current_period_end     = CASE WHEN p_patch ? 'current_period_end' THEN EXCLUDED.current_period_end ELSE subscriptions.current_period_end END,
    cancel_at_period_end   = CASE WHEN p_patch ? 'cancel_at_period_end' THEN EXCLUDED.cancel_at_period_end ELSE subscriptions.cancel_at_period_end END,
    last_stripe_event_at   = p_event_created,
    updated_at             = now();

  RETURN 'applied';
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_stripe_event(TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_event(TEXT, TEXT, TIMESTAMPTZ, JSONB) TO service_role;
