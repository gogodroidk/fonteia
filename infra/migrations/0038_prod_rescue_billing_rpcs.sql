-- =============================================================================
-- 0038_prod_rescue_billing_rpcs.sql
-- Resgate de produção em 2026-07-07 (Onda 1) — baseline idempotente do que JÁ
-- está rodando em produção (projeto pwiuiihsyazghdsrpshg). NÃO aplicar cegamente
-- em outro ambiente sem revisar: este arquivo documenta o estado real, não é uma
-- mudança nova.
--
-- Lido via `pg_get_functiondef` em produção com:
--   select pg_get_functiondef(oid) from pg_proc
--   where proname in ('my_plan','admin_list_plans');
-- (sem overloads — cada nome tem exatamente 1 versão em produção)
--
-- DIVERGÊNCIA vs. infra/migrations/0099_baseline_existing_rpcs.sql:
--
-- 1) my_plan() em produção tem 3 diferenças materiais que a versão em 0099 NÃO
--    tem:
--      a) checa `public.is_admin(v_uid)` PRIMEIRO e retorna
--         {plan:'pro', status:'admin', trial:false} sem nunca consultar
--         subscriptions — dono/admin nunca é paywalled. A versão 0099 não tem
--         esse bypass.
--      b) a consulta a `public.subscriptions` em produção EXIGE janela vigente:
--         `and (current_period_end is null or current_period_end > now())`.
--         A versão 0099 não valida a janela — um plano com
--         current_period_end no passado ainda seria considerado "ativo" por
--         estar em status in ('active','trialing','past_due'). Ou seja, a
--         0099 NUNCA expira um plano de fato.
--      c) produção detecta e retorna status 'expired' explicitamente quando a
--         assinatura mais recente do e-mail já passou do current_period_end
--         (para o front mostrar "sua assinatura expirou", não só "free"). A
--         0099 não tem esse terceiro caminho — cai direto em 'free'/coalesce.
--
-- 2) admin_list_plans() NÃO EXISTE em nenhuma migration versionada (grep em
--    infra/migrations/*.sql não encontra nenhuma ocorrência antes deste
--    arquivo). É usada pelo painel admin (coluna de plano/trial por usuário,
--    commit d865bcc "feat(admin): coluna de plano/trial por usuario no painel
--    (RPC admin_list_plans)") — código de produção sem contrapartida no git
--    até agora.
--
-- Ambas SECURITY DEFINER, SET search_path TO 'public' (hardened contra search
-- path hijacking, já no padrão de 0018_security_hardening.sql).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- my_plan() — versão de produção (substitui semanticamente a de 0099, que fica
-- como histórico/não é mais a fonte da verdade; não removê-la do 0099, isto é
-- só um CREATE OR REPLACE por cima, idempotente).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_plan()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce((auth.jwt() ->> 'email'), ''));
  v_plan  text;
  v_status text;
  v_until timestamptz;
  v_trial timestamptz;
  v_last_status text;
  v_last_until  timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('plan', 'free', 'status', 'anon', 'trial', false);
  end if;

  -- Dono/admin nunca e paywalled.
  if public.is_admin(v_uid) then
    return jsonb_build_object('plan', 'pro', 'status', 'admin', 'trial', false);
  end if;

  -- Assinatura/trial VIGENTE (janela ainda valida).
  select plan_id, status, current_period_end
    into v_plan, v_status, v_until
  from public.subscriptions
  where lower(email) = v_email
    and status in ('active', 'trialing', 'past_due')
    and (current_period_end is null or current_period_end > now())
  order by current_period_end desc nulls last
  limit 1;

  -- Trial por cupom (ja limitado por granted_until).
  select max(granted_until) into v_trial
  from public.coupon_redemptions
  where user_id = v_uid and granted_until > now();

  if v_plan is not null and v_plan <> 'free' then
    return jsonb_build_object('plan', v_plan, 'status', v_status,
                              'trial', (v_status = 'trialing'), 'until', v_until);
  end if;

  if v_trial is not null then
    return jsonb_build_object('plan', 'pro', 'status', 'trial', 'trial', true, 'until', v_trial);
  end if;

  -- Sem acesso vigente: detecta trial/assinatura EXPIRADA para mensagem no front.
  select status, current_period_end into v_last_status, v_last_until
  from public.subscriptions
  where lower(email) = v_email
  order by current_period_end desc nulls last
  limit 1;

  if v_last_status is not null and v_last_until is not null and v_last_until <= now() then
    return jsonb_build_object('plan', 'free', 'status', 'expired', 'trial', false, 'until', v_last_until);
  end if;

  return jsonb_build_object('plan', 'free', 'status', 'free', 'trial', false);
end;
$function$;

-- ---------------------------------------------------------------------------
-- admin_list_plans() — versão de produção. Não existia em NENHUM arquivo .sql
-- versionado antes deste resgate. Usada pelo painel admin para listar
-- plano/status/trial/until por e-mail (1 linha por e-mail, a mais relevante
-- por prioridade: vigente > mais recente).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_plans()
 RETURNS TABLE(email text, plan text, status text, trial boolean, until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with ranked as (
    select
      lower(s.email) as email,
      s.plan_id,
      s.status as sub_status,
      s.current_period_end,
      row_number() over (
        partition by lower(s.email)
        order by (s.status in ('active','trialing','past_due')
                  and (s.current_period_end is null or s.current_period_end > now())) desc,
                 s.current_period_end desc nulls last
      ) as rn
    from public.subscriptions s
    where s.email is not null
  )
  select
    r.email,
    case when r.sub_status in ('active','trialing','past_due')
              and (r.current_period_end is null or r.current_period_end > now())
         then coalesce(r.plan_id, 'free') else 'free' end as plan,
    case when r.sub_status in ('active','trialing','past_due')
              and (r.current_period_end is null or r.current_period_end > now())
         then r.sub_status
         when r.current_period_end is not null and r.current_period_end <= now()
         then 'expired'
         else coalesce(r.sub_status, 'free') end as status,
    (r.sub_status = 'trialing'
      and (r.current_period_end is null or r.current_period_end > now())) as trial,
    r.current_period_end as "until"
  from ranked r
  where r.rn = 1;
end;
$function$;
