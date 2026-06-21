-- =============================================================================
-- 0027_subscriptions_correlate_by_user_id.sql
--   Correlação assinatura ↔ usuário por user_id (uuid), com e-mail como FALLBACK.
-- =============================================================================
-- ⚠️  NÃO APLICADA AUTOMATICAMENTE. Versionada para revisão e decisão do dono.
--     Aplicar via Supabase MCP `apply_migration` (name:
--     0027_subscriptions_correlate_by_user_id) ou `supabase db push`.
--
--     PRÉ-REQUISITO de produto: só aplique DEPOIS que o webhook em produção passar
--     a gravar `subscriptions.user_id` a partir do client_reference_id da Checkout
--     Session (ver "O QUE O WEBHOOK PRECISA LER" abaixo). Antes disso, user_id fica
--     NULL nas linhas novas e o ramo por e-mail (mantido) continua sendo o caminho.
--     Aplicar esta migration ANTES do webhook é seguro (o fallback por e-mail cobre
--     tudo), mas o ganho de robustez só aparece quando o user_id começa a ser gravado.
--
-- CONTEXTO (o bug que isto fecha)
--   Hoje a liberação de plano correlaciona assinatura↔usuário SÓ por e-mail:
--
--     • Front: o checkout era um Payment Link cru (apps/web/src/config/stripe.ts).
--       O Payment Link NÃO carrega a identidade Supabase — no máximo pré-preenche o
--       e-mail. Resultado: a única âncora que chega ao webhook é o e-mail do Stripe.
--
--     • Webhook (services/stripe-webhook/src/worker.ts): grava subscriptions.email
--       com a caixa que o Stripe enviar e NUNCA grava subscriptions.user_id.
--
--     • RPC public.my_plan() (0099_baseline_existing_rpcs.sql, ~L372): casa por
--         where lower(email) = lower(auth.jwt()->>'email')
--       É o ÚNICO gate de plano do app (apps/web/src/lib/use-plan.ts chama só my_plan).
--
--   Fragilidades da correlação só-por-e-mail:
--     (a) e-mail divergente entre Stripe e Supabase Auth (digitação, alias, +tag,
--         troca de e-mail no Auth depois de assinar) ⇒ o pagante não recebe o plano;
--     (b) e-mail compartilhado/herdado ⇒ ambiguidade de quem é o dono da assinatura;
--     (c) o Stripe não normaliza a caixa do e-mail ⇒ casamento sensível à caixa.
--
--   ATENÇÃO (corrigido na renumeração 0026→0027): a coluna subscriptions.user_id
--   NÃO existe no banco de produção (o schema real divergiu da 0002, que a declara).
--   Por isso ESTA migration ADICIONA a coluna + índice (ADD COLUMN IF NOT EXISTS,
--   logo abaixo) ANTES de recriar my_plan(). A identidade nunca chegava ao webhook;
--   a nova Edge Function "stripe-checkout"
--   (supabase/functions/stripe-checkout) resolve a origem do problema: cria uma
--   Checkout Session com `client_reference_id` = id do usuário Supabase (uuid) +
--   metadata (supabase_user_id / email / plan_id). A partir daí o webhook CONSEGUE
--   gravar user_id, e a correlação passa a ser por chave estável (uuid).
--
-- O QUE ESTA MIGRATION FAZ
--   Recria public.my_plan() para resolver a assinatura ativa preferindo user_id e
--   caindo para o e-mail (case-insensitive) quando user_id ainda for NULL — ou seja,
--   robusto para as linhas novas (com user_id) SEM quebrar as antigas / compras por
--   Payment Link (que continuam só com e-mail). O contrato de retorno (jsonb com
--   plan/status/trial/until) é IDÊNTICO ao atual; o trial por cupom não muda.
--   Idempotente (CREATE OR REPLACE). Seguro reaplicar.
--
-- O QUE O WEBHOOK PRECISA LER  (sem mexer no webhook de prod, que é NÃO-versionado)
--   Para a correlação por user_id funcionar de ponta a ponta, o webhook
--   (referência: services/stripe-webhook/src/worker.ts) precisa, no
--   `checkout.session.completed`, extrair a identidade da Checkout Session e gravá-la
--   em subscriptions.user_id (além do que já grava):
--
--     • session.client_reference_id   → uuid do usuário Supabase  (FONTE PRIMÁRIA)
--     • session.metadata.supabase_user_id (redundância de client_reference_id)
--     • session.metadata.email / session.metadata.plan_id (rastreabilidade)
--
--   Como o Stripe não garante ordem nem entrega única (o worker.ts já trata isso),
--   o ideal é propagar a identidade também para o objeto subscription — a Edge
--   Function "stripe-checkout" JÁ envia subscription_data[metadata][supabase_user_id],
--   então os eventos customer.subscription.created/updated trazem
--   subscription.metadata.supabase_user_id e o webhook pode gravar user_id também por
--   esse caminho (defesa em profundidade contra o checkout.session.completed atrasar).
--
--   A escrita de user_id deve ser NÃO-REGRESSIVA (igual ao resto do worker.ts): só
--   preenche/atualiza user_id, nunca apaga um user_id já gravado por outro evento.
--   O UNIQUE é stripe_subscription_id (não muda): o upsert continua casando por ele.
--
--   (Opcional, fora desta migration) Backfill das linhas antigas: para assinaturas
--   já ativas sem user_id, dá para preencher uma vez correlacionando
--   subscriptions.email ↔ auth.users.email (lower em ambos). Não é necessário para o
--   fix — o fallback por e-mail em my_plan() já cobre essas linhas.
--
-- POR QUE NÃO MEXER NO WEBHOOK / NA TABELA AQUI
--     (a) o webhook em produção é NÃO-versionado (a referência é só worker.ts) e está
--         fora do escopo desta entrega (não tocar billing de prod);
--     (b) ajustar my_plan() é a mudança de menor risco que coloca o user_id no caminho
--         de decisão de acesso assim que o webhook começar a gravá-lo, sem regressão.
-- =============================================================================

-- Garante a coluna de correlação. O schema de PRODUÇÃO não tinha `user_id`
-- (divergiu da 0002), então criamos aqui de forma idempotente — sem isto, o
-- my_plan() abaixo quebra ao referenciar a coluna inexistente.
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions (user_id);

CREATE OR REPLACE FUNCTION public.my_plan()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(coalesce((auth.jwt() ->> 'email'), ''));
  v_plan   text;
  v_status text;
  v_until  timestamptz;
  v_trial  timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('plan', 'free', 'status', 'anon', 'trial', false);
  end if;

  -- Correlação preferencial por user_id (uuid), com fallback por e-mail
  -- (case-insensitive) para linhas antigas / compras por Payment Link sem user_id.
  -- A linha por user_id, quando existir, é a mais confiável → ordenada primeiro.
  select plan_id, status, current_period_end
    into v_plan, v_status, v_until
  from public.subscriptions
  where status in ('active', 'trialing', 'past_due')
    and (
      (user_id is not null and user_id = v_uid)
      or (user_id is null and v_email <> '' and lower(email) = v_email)
    )
  order by
    (user_id is not null and user_id = v_uid) desc,  -- match por uuid vence o por e-mail
    current_period_end desc nulls last
  limit 1;

  -- Trial por cupom (inalterado): concede 'pro' enquanto não houver assinatura paga.
  select max(granted_until) into v_trial
  from public.coupon_redemptions
  where user_id = v_uid and granted_until > now();

  if (v_plan is null or v_plan = 'free') and v_trial is not null then
    return jsonb_build_object('plan', 'pro', 'status', 'trial', 'trial', true, 'until', v_trial);
  end if;

  return jsonb_build_object(
    'plan',   coalesce(v_plan, 'free'),
    'status', coalesce(v_status, 'free'),
    'trial',  false,
    'until',  v_until
  );
end;
$function$;
