-- 0002_stripe_subscriptions.sql
-- Tabela de assinaturas Stripe para liberacao automatica de plano apos pagamento (modo LIVE).
-- Populada exclusivamente pelo Worker fonteia-stripe-webhook via PostgREST com a service_role key.
--
-- Valores validos de plan_id: 'free' | 'pro' | 'corporativo'
--   free        -> sem assinatura ativa (default)
--   pro         -> price_1ThjWB4zjAI9pGd7GOAfQwBT
--   corporativo -> price_1ThjhR4zjAI9pGd7UyBOlctV
--
-- Valores validos de status (espelham o ciclo de vida da assinatura Stripe):
--   free            -> nunca assinou / sem cobranca ativa (default)
--   active          -> assinatura paga e ativa (plano liberado)
--   trialing        -> periodo de teste em andamento (plano liberado)
--   past_due        -> cobranca falhou (invoice.payment_failed) — acesso em risco
--   canceled        -> assinatura cancelada (customer.subscription.deleted) — volta para free
--   incomplete      -> checkout iniciado, pagamento ainda nao confirmado
--   unpaid          -> fatura em aberto apos retries

CREATE TABLE IF NOT EXISTS subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID,
  email                  TEXT,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id        TEXT,
  stripe_product_id      TEXT,
  plan_id                TEXT NOT NULL DEFAULT 'free',  -- free | pro | corporativo
  status                 TEXT NOT NULL DEFAULT 'free',  -- free | active | trialing | past_due | canceled | incomplete | unpaid
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN DEFAULT false,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_email             ON subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id           ON subscriptions(user_id);

-- RLS: usuarios autenticados leem apenas a propria assinatura.
-- Escrita e exclusiva da service_role (Worker do webhook) — nao ha policy de INSERT/UPDATE
-- para anon/authenticated, e a service_role ignora RLS por padrao.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Leitura limitada ao dono da linha; escrita reservada a service_role via GRANT abaixo.
REVOKE ALL ON subscriptions FROM anon, authenticated;
GRANT SELECT ON subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions TO service_role;

DROP POLICY IF EXISTS "Users can read their own subscription" ON subscriptions;
CREATE POLICY "Users can read their own subscription"
  ON subscriptions
  FOR SELECT
  TO authenticated
  USING (
    (email IS NOT NULL AND email = auth.email())
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  );

-- Mantem updated_at coerente mesmo em UPDATEs diretos no banco.
CREATE OR REPLACE FUNCTION set_subscriptions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION set_subscriptions_updated_at();
