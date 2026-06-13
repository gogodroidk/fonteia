-- 0006_user_alerts.sql
-- Alertas de prazo por e-mail para o usuário logado.
--
-- O usuário cadastra um alerta vinculado a um lote (lot_id) e um e-mail.
-- A Edge Function "send-alerts" roda 1x/dia via pg_cron, busca alertas
-- pendentes (prazo chegando em até 3 dias, ainda futuro, notified_at null)
-- e envia o e-mail via Resend.
--
-- RPCs SECURITY DEFINER (padrão do projeto):
--   create_alert   — upsert de alerta para o lote, via auth.uid()
--   delete_alert   — remove o alerta do usuário autenticado para o lote
--   list_my_alerts — lista todos os alertas do usuário autenticado
--
-- Revoke de anon/public, grant apenas a authenticated.
-- RLS ligado: usuário enxerga/gerencia só os próprios registros.

create table if not exists public.user_alerts (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null,
  lot_id            text        not null,
  lot_label         text,
  edital            text,
  proposal_deadline timestamptz,
  email             text        not null,
  channel           text        not null default 'email',
  status            text        not null default 'active',
  notified_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (user_id, lot_id)
);

create index if not exists user_alerts_user_idx   on public.user_alerts (user_id);
create index if not exists user_alerts_status_idx on public.user_alerts (status, notified_at, proposal_deadline);

alter table public.user_alerts enable row level security;

-- Usuário enxerga apenas os próprios alertas.
drop policy if exists "own alerts select" on public.user_alerts;
create policy "own alerts select" on public.user_alerts
  for select using (auth.uid() = user_id);

-- Sem insert/update/delete direto: tudo passa pelas RPCs SECURITY DEFINER.

-- ─── RPC: create_alert ────────────────────────────────────────────────────────
-- Cria ou atualiza (upsert) um alerta para o lote informado.
-- Valida que o usuário está logado e que o e-mail foi fornecido.
create or replace function public.create_alert(
  p_lot_id            text,
  p_lot_label         text    default null,
  p_edital            text    default null,
  p_deadline          timestamptz default null,
  p_email             text    default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_email text := btrim(coalesce(p_email, ''));
  v_lot   text := btrim(coalesce(p_lot_id, ''));
  v_id    uuid;
begin
  if v_uid is null then
    return jsonb_build_object(
      'ok',      false,
      'error',   'login',
      'message', 'Faça login para criar um alerta.'
    );
  end if;

  if v_lot = '' then
    return jsonb_build_object(
      'ok',      false,
      'error',   'lot_id_empty',
      'message', 'Informe o ID do lote.'
    );
  end if;

  if v_email = '' or v_email not like '%@%' then
    return jsonb_build_object(
      'ok',      false,
      'error',   'email_invalid',
      'message', 'Informe um e-mail válido.'
    );
  end if;

  insert into public.user_alerts
    (user_id, lot_id, lot_label, edital, proposal_deadline, email, channel, status, notified_at)
  values
    (v_uid, v_lot, p_lot_label, p_edital, p_deadline, v_email, 'email', 'active', null)
  on conflict (user_id, lot_id) do update
    set lot_label         = excluded.lot_label,
        edital            = excluded.edital,
        proposal_deadline = excluded.proposal_deadline,
        email             = excluded.email,
        status            = 'active',
        notified_at       = null
  returning id into v_id;

  return jsonb_build_object(
    'ok',      true,
    'id',      v_id,
    'message', 'Alerta criado! Você receberá um e-mail quando o prazo estiver chegando.'
  );
end;
$function$;

-- ─── RPC: delete_alert ────────────────────────────────────────────────────────
-- Remove o alerta do usuário autenticado para o lote informado.
create or replace function public.delete_alert(p_lot_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_lot   text := btrim(coalesce(p_lot_id, ''));
  v_count integer;
begin
  if v_uid is null then
    return jsonb_build_object(
      'ok',      false,
      'error',   'login',
      'message', 'Faça login para remover um alerta.'
    );
  end if;

  delete from public.user_alerts
  where user_id = v_uid and lot_id = v_lot;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok',      true,
    'deleted', v_count
  );
end;
$function$;

-- ─── RPC: list_my_alerts ─────────────────────────────────────────────────────
-- Retorna todos os alertas do usuário autenticado, ordenados pelo prazo mais próximo.
create or replace function public.list_my_alerts()
returns table (
  id                uuid,
  lot_id            text,
  lot_label         text,
  edital            text,
  proposal_deadline timestamptz,
  email             text,
  channel           text,
  status            text,
  notified_at       timestamptz,
  created_at        timestamptz
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    a.id,
    a.lot_id,
    a.lot_label,
    a.edital,
    a.proposal_deadline,
    a.email,
    a.channel,
    a.status,
    a.notified_at,
    a.created_at
  from public.user_alerts a
  where a.user_id = auth.uid()
  order by a.proposal_deadline asc nulls last, a.created_at desc;
$function$;

-- ─── Permissões ───────────────────────────────────────────────────────────────
revoke execute on function public.create_alert(text, text, text, timestamptz, text) from public, anon;
grant  execute on function public.create_alert(text, text, text, timestamptz, text) to authenticated;

revoke execute on function public.delete_alert(text) from public, anon;
grant  execute on function public.delete_alert(text) to authenticated;

revoke execute on function public.list_my_alerts() from public, anon;
grant  execute on function public.list_my_alerts() to authenticated;
