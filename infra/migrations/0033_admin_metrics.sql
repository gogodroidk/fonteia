-- =============================================================================
-- 0033_admin_metrics.sql
-- =============================================================================
-- Métricas agregadas READ-ONLY do Painel do Dono (Administração da plataforma).
--
-- Projeto: pwiuiihsyazghdsrpshg (Fonte.ia / Olli)
-- Status:  NÃO APLICADA. Documentada aqui para revisão. Aplicar via Supabase MCP
--          `apply_migration` quando o dono autorizar. Até lá, o front degrada
--          honestamente ("backend pendente") — nenhum número é inventado.
--
-- POR QUE RPC (e não só a edge function admin-api):
--   • A página /sources já consome a RPC pública agregada `source_health()` via
--     PostgREST. Seguimos o MESMO padrão: o navegador autenticado chama
--     supabase.rpc('admin_*') e cada função revalida `is_admin(auth.uid())`
--     internamente (SECURITY DEFINER). O front NUNCA é fonte de verdade.
--   • Agregar no banco (1 round-trip por painel) é mais barato que puxar linhas
--     para o cliente. As tabelas têm RLS estrita; sem estas RPCs definer, o
--     authenticated não conseguiria ler subscriptions de terceiros, usage_events
--     globais nem coupon_redemptions de outros usuários — exatamente o desejado.
--
-- SEGURANÇA (invariantes):
--   • TODAS as funções: SECURITY DEFINER + `set search_path to 'public'`.
--   • Primeira instrução de cada função: gate `is_admin(auth.uid())` → senão
--     `raise exception 'forbidden' using errcode = '42501'` (vira 403 no PostgREST).
--   • EXECUTE revogado de anon/public; concedido só a `authenticated` (o gate
--     interno faz o resto). service_role mantém acesso por padrão.
--   • As funções de leitura NÃO expõem PII desnecessária: e-mails de assinatura
--     são mascarados; nenhuma função read-only escreve.
--   • A ÚNICA função de escrita (admin_grant_trial) registra a concessão em
--     coupon_redemptions reusando o caminho de cupom já auditado, e também
--     valida is_admin server-side — conceder trial pela UI jamais confia no front.
--
-- DEPENDÊNCIAS (já existem em produção — ver 0099_baseline_existing_rpcs.sql):
--   public.is_admin(uuid), public.subscriptions, public.usage_events,
--   public.coupons, public.coupon_redemptions, public.ai_rate_limits,
--   public.entities, public.profiles.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Helper interno: lança 403 se o chamador não for admin. Mantém o gate DRY.
-- Chamada de DENTRO das outras funções definer (que rodam como owner).
-- ---------------------------------------------------------------------------
create or replace function public.admin_assert()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'forbidden' using errcode = '42501', message = 'Acesso restrito ao administrador.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 1. admin_platform_metrics
--    Cartões da "Visão geral" num único round-trip: usuários, assinantes
--    pagantes, trials de cupom ativos, MRR estimado (R$), consultas pagas
--    (external_lookups) e eventos de IA recentes (ai_rate_limits, 24h).
--    Retorna jsonb para ser extensível sem quebrar o contrato.
-- ---------------------------------------------------------------------------
create or replace function public.admin_platform_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_total_users      bigint;
  v_admins           bigint;
  v_new_users_7d     bigint;
  v_paying           bigint;   -- assinaturas active/trialing
  v_past_due         bigint;
  v_trials           bigint;   -- trials de cupom ativos (granted_until > now)
  v_mrr_cents        bigint;   -- soma estimada por plano dos assinantes ativos
  v_lookups_30d      bigint;   -- consultas externas pagas no mês
  v_ai_hits_24h      bigint;   -- somatório de chamadas de IA por IP nas últimas 24h
begin
  perform public.admin_assert();

  select count(*) into v_total_users from public.profiles;
  select count(*) into v_admins from public.profiles where role = 'admin';
  select count(*) into v_new_users_7d
    from public.profiles where created_at >= now() - interval '7 days';

  select count(*) into v_paying
    from public.subscriptions where status in ('active', 'trialing');
  select count(*) into v_past_due
    from public.subscriptions where status = 'past_due';

  select count(*) into v_trials
    from (
      select user_id from public.coupon_redemptions
      where granted_until > now()
      group by user_id
    ) t;

  -- MRR estimado: preço de tabela por plano (pro=R$197, corporativo=R$597),
  -- contando apenas assinaturas com status que liberam acesso. Em centavos para
  -- evitar float; o front formata em BRL. É ESTIMATIVA (não substitui o Stripe).
  select coalesce(sum(
      case s.plan_id
        when 'pro' then 19700
        when 'corporativo' then 59700
        else 0
      end), 0) into v_mrr_cents
    from public.subscriptions s
    where s.status in ('active', 'trialing');

  select count(*) into v_lookups_30d
    from public.external_lookups
    where fetched_at >= now() - interval '30 days';

  select coalesce(sum(count), 0) into v_ai_hits_24h
    from public.ai_rate_limits
    where window_start >= now() - interval '24 hours';

  return jsonb_build_object(
    'generated_at', now(),
    'users', jsonb_build_object(
      'total', v_total_users,
      'admins', v_admins,
      'new_7d', v_new_users_7d
    ),
    'subscriptions', jsonb_build_object(
      'paying', v_paying,
      'past_due', v_past_due,
      'trials', v_trials,
      'mrr_cents', v_mrr_cents
    ),
    'usage', jsonb_build_object(
      'lookups_30d', v_lookups_30d,
      'ai_hits_24h', v_ai_hits_24h
    )
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. admin_subscriptions_summary
--    Quebra de assinaturas por (plan_id, status) com contagem e a próxima
--    renovação mais próxima. Alimenta a tabela "Assinaturas por plano".
-- ---------------------------------------------------------------------------
create or replace function public.admin_subscriptions_summary()
returns table(
  plan_id text,
  status text,
  total bigint,
  next_renewal timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  perform public.admin_assert();
  return query
    select
      coalesce(s.plan_id, 'free')          as plan_id,
      coalesce(s.status, 'free')           as status,
      count(*)::bigint                     as total,
      min(s.current_period_end) filter (where s.current_period_end > now()) as next_renewal
    from public.subscriptions s
    group by 1, 2
    order by total desc, plan_id, status;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. admin_recent_subscriptions
--    Últimas assinaturas (para investigar churn/upgrades). E-mail mascarado
--    (ex.: ig***@gmail.com) — admin vê quem é sem expor o endereço completo
--    em telas/relatórios. p_limit limitado a 50.
-- ---------------------------------------------------------------------------
create or replace function public.admin_recent_subscriptions(p_limit integer default 20)
returns table(
  id uuid,
  email_masked text,
  plan_id text,
  status text,
  cancel_at_period_end boolean,
  current_period_end timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  perform public.admin_assert();
  return query
    select
      s.id,
      case
        when s.email is null or position('@' in s.email) = 0 then '—'
        else left(split_part(s.email, '@', 1), 2) || '***@' || split_part(s.email, '@', 2)
      end as email_masked,
      coalesce(s.plan_id, 'free'),
      coalesce(s.status, 'free'),
      coalesce(s.cancel_at_period_end, false),
      s.current_period_end,
      s.updated_at
    from public.subscriptions s
    order by s.updated_at desc nulls last
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. admin_usage_summary
--    Uso da plataforma nos últimos p_days dias: total de eventos por event_type
--    e por módulo. Alimenta os gráficos de barras de "Uso".
--    usage_events.user_id é TEXT no schema — contamos distintos como texto.
-- ---------------------------------------------------------------------------
create or replace function public.admin_usage_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_by_type jsonb;
  v_by_module jsonb;
  v_total bigint;
  v_active_users bigint;
begin
  perform public.admin_assert();

  select coalesce(jsonb_agg(jsonb_build_object('event_type', t.event_type, 'total', t.total)
                            order by t.total desc), '[]'::jsonb)
    into v_by_type
  from (
    select coalesce(event_type, 'desconhecido') as event_type,
           coalesce(sum(quantity), count(*))::bigint as total
    from public.usage_events
    where created_at >= now() - make_interval(days => v_days)
    group by 1
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('module_id', m.module_id, 'total', m.total)
                            order by m.total desc), '[]'::jsonb)
    into v_by_module
  from (
    select coalesce(module_id, 'sem módulo') as module_id,
           coalesce(sum(quantity), count(*))::bigint as total
    from public.usage_events
    where created_at >= now() - make_interval(days => v_days)
    group by 1
  ) m;

  select coalesce(sum(quantity), 0)::bigint into v_total
    from public.usage_events
    where created_at >= now() - make_interval(days => v_days);

  select count(distinct user_id)::bigint into v_active_users
    from public.usage_events
    where created_at >= now() - make_interval(days => v_days)
      and user_id is not null;

  return jsonb_build_object(
    'days', v_days,
    'total_events', v_total,
    'active_users', v_active_users,
    'by_type', v_by_type,
    'by_module', v_by_module
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. admin_coupons_overview
--    Cupons cadastrados + uso. redeemed_count vem da própria tabela coupons;
--    active_redemptions conta redenções ainda vigentes (granted_until > now).
-- ---------------------------------------------------------------------------
create or replace function public.admin_coupons_overview()
returns table(
  code text,
  kind text,
  trial_days integer,
  max_redemptions integer,
  redeemed_count integer,
  active_redemptions bigint,
  active boolean,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  perform public.admin_assert();
  return query
    select
      c.code,
      c.kind,
      c.trial_days,
      c.max_redemptions,
      c.redeemed_count,
      coalesce((
        select count(*) from public.coupon_redemptions r
        where r.code = c.code and r.granted_until > now()
      ), 0)::bigint as active_redemptions,
      c.active,
      c.expires_at,
      c.created_at
    from public.coupons c
    order by c.created_at desc, c.code;
end;
$$;


-- ---------------------------------------------------------------------------
-- 6. admin_grant_trial (AÇÃO SENSÍVEL — escrita)
--    Concede um trial de p_days dias a um usuário (por id). Registra em
--    coupon_redemptions sob um cupom administrativo dedicado ('ADMIN_GRANT'),
--    estendendo granted_until se já houver um vigente. Idempotente por (code,
--    user_id) — sempre prolonga para o maior prazo.
--
--    Por que reusar coupon_redemptions: é o caminho que my_plan()/my_trial()
--    já leem para liberar acesso. Conceder trial por aqui mantém UMA fonte de
--    verdade e herda a auditoria existente. O gate is_admin é server-side:
--    a UI manda o pedido, o BANCO decide.
-- ---------------------------------------------------------------------------
create or replace function public.admin_grant_trial(p_user_id uuid, p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 7), 1), 90);
  v_until timestamptz;
  v_exists boolean;
begin
  perform public.admin_assert();

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_user', 'message', 'Informe o usuário.');
  end if;

  select exists(select 1 from public.profiles where id = p_user_id) into v_exists;
  if not v_exists then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'message', 'Usuário não encontrado.');
  end if;

  -- Garante o cupom administrativo (não consome limite; serve de "guarda-chuva").
  insert into public.coupons (code, kind, trial_days, max_redemptions, active)
  values ('ADMIN_GRANT', 'admin', v_days, null, true)
  on conflict (code) do nothing;

  v_until := now() + make_interval(days => v_days);

  insert into public.coupon_redemptions (code, user_id, granted_until)
  values ('ADMIN_GRANT', p_user_id, v_until)
  on conflict (code, user_id) do update
    set granted_until = greatest(public.coupon_redemptions.granted_until, excluded.granted_until)
  returning granted_until into v_until;

  return jsonb_build_object('ok', true, 'granted_until', v_until, 'days', v_days,
                            'message', 'Trial concedido até ' || to_char(v_until, 'DD/MM/YYYY HH24:MI') || '.');
end;
$$;


-- ---------------------------------------------------------------------------
-- GRANTS / REVOKES — o gate real é o is_admin() interno; aqui só fechamos anon.
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_assert()                  from public, anon;
revoke execute on function public.admin_platform_metrics()        from public, anon;
revoke execute on function public.admin_subscriptions_summary()   from public, anon;
revoke execute on function public.admin_recent_subscriptions(integer) from public, anon;
revoke execute on function public.admin_usage_summary(integer)    from public, anon;
revoke execute on function public.admin_coupons_overview()        from public, anon;
revoke execute on function public.admin_grant_trial(uuid, integer) from public, anon;

grant execute on function public.admin_platform_metrics()        to authenticated;
grant execute on function public.admin_subscriptions_summary()   to authenticated;
grant execute on function public.admin_recent_subscriptions(integer) to authenticated;
grant execute on function public.admin_usage_summary(integer)    to authenticated;
grant execute on function public.admin_coupons_overview()        to authenticated;
grant execute on function public.admin_grant_trial(uuid, integer) to authenticated;
-- admin_assert fica acessível só a service_role/definer (não precisa de grant a authenticated;
-- é chamada de DENTRO das outras funções definer, que rodam como o owner).
