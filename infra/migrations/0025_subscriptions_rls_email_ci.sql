-- =============================================================================
-- 0025_subscriptions_rls_email_ci.sql  —  RLS de `subscriptions`: e-mail case-insensitive
-- =============================================================================
-- ⚠️  NÃO APLICADA. Versionada para revisão (achado da auditoria de segurança
--     RLS/billing). Aplicar via Supabase MCP `apply_migration` (name:
--     0025_subscriptions_rls_email_ci) ou `supabase db push` — decisão do dono.
--
-- ACHADO (severidade: BAIXA — falha fechada, sem escalonamento de privilégio)
--   A correlação assinatura <-> usuário por e-mail é INCONSISTENTE entre as duas
--   camadas que decidem acesso:
--
--     • RPC public.my_plan() (0099_baseline_existing_rpcs.sql, linha ~372):
--         where lower(email) = lower(auth.jwt()->>'email')   -- CASE-INSENSITIVE
--       É o ÚNICO gate de plano do app (apps/web/src/lib/use-plan.ts chama só
--       `my_plan`). Robusto: o usuário NÃO perde acesso por diferença de caixa.
--
--     • Policy RLS de SELECT em `subscriptions` (0002_stripe_subscriptions.sql):
--         USING (email = auth.email() OR user_id = auth.uid())  -- CASE-SENSITIVE
--       `auth.email()` devolve o claim do JWT VERBATIM (preserva a caixa). Já o
--       webhook (services/stripe-webhook/src/worker.ts) grava `subscriptions.email`
--       com a caixa que o Stripe enviar (session.customer_details.email /
--       invoice.customer_email) — o Stripe NÃO normaliza a caixa do e-mail.
--
--   Consequência: se a caixa do e-mail no Stripe diferir da caixa registrada no
--   Supabase Auth (ex.: "Igor@Exemplo.com" vs "igor@exemplo.com"), uma LEITURA
--   DIRETA da tabela `subscriptions` pela publishable key (role authenticated)
--   retorna ZERO linhas para o próprio dono — ele não "vê" a própria assinatura.
--
--   Impacto HOJE: praticamente nulo, porque o front gateia só por `my_plan`
--   (case-insensitive) e NÃO lê `subscriptions` diretamente (confirmado: o único
--   acesso do app é via a RPC `my_plan`). Mas a policy contradiz a intenção
--   documentada ("Users can read their own subscription") e vira uma armadilha
--   silenciosa para qualquer código futuro (painel de billing, /admin, suporte)
--   que leia a tabela direto. Padroniza-se a caixa para casar com a RPC, que é a
--   fonte de verdade do produto.
--
--   NÃO é vazamento: a comparação é igualdade por e-mail do PRÓPRIO usuário; tornar
--   case-insensitive NUNCA expõe a linha de outro usuário (e-mails do Supabase Auth
--   são únicos por identidade; `lower()` não funde identidades distintas). O ramo
--   user_id = auth.uid() (uuid = uuid) permanece intacto.
--
-- O QUE ESTA MIGRATION FAZ
--   Recria a policy de SELECT de `subscriptions` usando lower(email) = lower(auth.email()),
--   mantendo o OR por user_id. Nada além da policy muda: GRANTs, RLS habilitado,
--   trigger de updated_at e escrita exclusiva da service_role permanecem como em
--   0002. Idempotente (DROP POLICY IF EXISTS + CREATE). Seguro reaplicar.
--
-- POR QUE NÃO MEXER NO WEBHOOK / NA TABELA
--   Normalizar a coluna na escrita (lower no webhook) também resolveria, mas:
--     (a) o webhook em produção é NÃO-versionado (a referência é só worker.ts);
--     (b) normalizar a policy é defesa em profundidade no lado do banco e cobre
--         linhas já gravadas com caixa "suja", sem depender de redeploy do Worker.
--   Não alteramos dados existentes: só a regra de leitura. (Se desejado, um UPDATE
--   de normalização da coluna pode vir depois, mas não é necessário para o fix.)
-- =============================================================================

DROP POLICY IF EXISTS "Users can read their own subscription" ON public.subscriptions;

CREATE POLICY "Users can read their own subscription"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    (email IS NOT NULL AND lower(email) = lower(auth.email()))
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  );
