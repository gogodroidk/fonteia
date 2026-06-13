-- 0005_coupons.sql
-- Cupons de teste gerenciados pela Fonte.ia (sem Stripe): concedem um período de
-- TESTE (ex.: 1 dia) ao usuário logado, sem cartão. Registro por usuário, com
-- limite de usos e validade. Sem paywall ligado — é a base do acesso por cupom.
--
-- redeem_coupon/my_trial são SECURITY DEFINER e só executáveis por usuários
-- autenticados (revoke de anon/public). A tabela de redenções tem RLS para o
-- usuário ver apenas as próprias.

create table if not exists public.coupons (
  code            text primary key,
  kind            text not null default 'trial',
  trial_days      integer not null default 1 check (trial_days > 0 and trial_days <= 365),
  max_redemptions integer,                         -- null = ilimitado
  redeemed_count  integer not null default 0,
  expires_at      timestamptz,                     -- null = sem validade
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.coupon_redemptions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null references public.coupons(code) on delete cascade,
  user_id       uuid not null,
  granted_until timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (code, user_id)
);

create index if not exists coupon_redemptions_user_idx on public.coupon_redemptions (user_id);

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

-- O usuário pode ver apenas as próprias redenções (para mostrar "teste ativo até X").
drop policy if exists "own redemptions" on public.coupon_redemptions;
create policy "own redemptions" on public.coupon_redemptions
  for select using (auth.uid() = user_id);

-- Resgata um cupom para o usuário logado. SECURITY DEFINER, validando código
-- ativo, validade, limite e uso único por usuário.
create or replace function public.redeem_coupon(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_coupon public.coupons%rowtype;
  v_existing public.coupon_redemptions%rowtype;
  v_until timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'login', 'message', 'Faça login para usar um cupom.');
  end if;
  if v_code = '' then
    return jsonb_build_object('ok', false, 'error', 'empty', 'message', 'Informe um código de cupom.');
  end if;

  select * into v_coupon from public.coupons where code = v_code for update;
  if not found or not v_coupon.active then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'Cupom inválido ou inativo.');
  end if;
  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired', 'message', 'Este cupom expirou.');
  end if;

  select * into v_existing from public.coupon_redemptions where code = v_code and user_id = v_uid;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'kind', v_coupon.kind,
                              'trial_days', v_coupon.trial_days, 'granted_until', v_existing.granted_until,
                              'message', 'Você já havia ativado este cupom.');
  end if;

  if v_coupon.max_redemptions is not null and v_coupon.redeemed_count >= v_coupon.max_redemptions then
    return jsonb_build_object('ok', false, 'error', 'exhausted', 'message', 'Este cupom já atingiu o limite de usos.');
  end if;

  v_until := now() + make_interval(days => v_coupon.trial_days);
  insert into public.coupon_redemptions (code, user_id, granted_until)
  values (v_code, v_uid, v_until);
  update public.coupons set redeemed_count = redeemed_count + 1 where code = v_code;

  return jsonb_build_object('ok', true, 'already', false, 'kind', v_coupon.kind,
                            'trial_days', v_coupon.trial_days, 'granted_until', v_until,
                            'message', 'Cupom ativado!');
end;
$function$;

-- Até quando o usuário logado tem teste ativo (maior granted_until futuro), ou null.
create or replace function public.my_trial()
returns timestamptz
language sql
security definer
set search_path to 'public'
as $function$
  select max(granted_until)
  from public.coupon_redemptions
  where user_id = auth.uid() and granted_until > now();
$function$;

revoke execute on function public.redeem_coupon(text) from public, anon;
grant execute on function public.redeem_coupon(text) to authenticated;
revoke execute on function public.my_trial() from public, anon;
grant execute on function public.my_trial() to authenticated;

-- Cupom de teste de 1 dia (pedido do dono). Ilimitado, sem validade.
insert into public.coupons (code, kind, trial_days, max_redemptions, active)
values ('TESTE1', 'trial', 1, null, true)
on conflict (code) do nothing;
