-- 0010_entity_alerts.sql
-- Alertas genéricos: o usuário pode criar alerta para QUALQUER entidade/módulo
-- (empresa/CNPJ, parlamentar, município, auto ambiental, marca INPI, processo,
-- ou uma busca livre), não só leilão. Mesmo padrão do 0006_user_alerts:
-- RLS (só vê o próprio), RPCs SECURITY DEFINER, grant só a authenticated.
-- A detecção/entrega automática para entidades é fase 2 (cron de matching);
-- aqui persistimos e gerenciamos a inscrição. user_alerts (leilão) segue intacto.

create table if not exists public.entity_alerts (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null,
  kind            text        not null,
  entity_ref      text        not null,
  entity_label    text,
  query           text,
  email           text        not null,
  channel         text        not null default 'email',
  status          text        not null default 'active',
  last_checked_at timestamptz,
  notified_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, kind, entity_ref)
);

create index if not exists entity_alerts_user_idx   on public.entity_alerts (user_id);
create index if not exists entity_alerts_status_idx on public.entity_alerts (status, last_checked_at);

alter table public.entity_alerts enable row level security;

drop policy if exists "own entity_alerts select" on public.entity_alerts;
create policy "own entity_alerts select" on public.entity_alerts
  for select using (auth.uid() = user_id);

-- ─── RPC: create_entity_alert ──────────────────────────────────────────────────
create or replace function public.create_entity_alert(
  p_kind   text,
  p_ref    text,
  p_label  text default null,
  p_query  text default null,
  p_email  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_email text := btrim(coalesce(p_email, ''));
  v_kind  text := btrim(coalesce(p_kind, ''));
  v_ref   text := btrim(coalesce(p_ref, ''));
  v_id    uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'login', 'message', 'Faça login para criar um alerta.');
  end if;
  if v_kind = '' or v_ref = '' then
    return jsonb_build_object('ok', false, 'error', 'ref_empty', 'message', 'Informe o que monitorar.');
  end if;
  if v_email = '' or v_email not like '%@%' then
    return jsonb_build_object('ok', false, 'error', 'email_invalid', 'message', 'Informe um e-mail válido.');
  end if;

  insert into public.entity_alerts
    (user_id, kind, entity_ref, entity_label, query, email, channel, status, notified_at)
  values
    (v_uid, v_kind, v_ref, p_label, p_query, v_email, 'email', 'active', null)
  on conflict (user_id, kind, entity_ref) do update
    set entity_label = excluded.entity_label,
        query        = excluded.query,
        email        = excluded.email,
        status       = 'active',
        notified_at  = null
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'message', 'Alerta criado! Vamos te avisar por e-mail.');
end;
$function$;

-- ─── RPC: delete_entity_alert ──────────────────────────────────────────────────
create or replace function public.delete_entity_alert(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'login', 'message', 'Faça login.');
  end if;
  delete from public.entity_alerts where id = p_id and user_id = v_uid;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'deleted', v_count);
end;
$function$;

-- ─── RPC: list_my_entity_alerts ────────────────────────────────────────────────
create or replace function public.list_my_entity_alerts()
returns table (
  id              uuid,
  kind            text,
  entity_ref      text,
  entity_label    text,
  query           text,
  email           text,
  channel         text,
  status          text,
  last_checked_at timestamptz,
  notified_at     timestamptz,
  created_at      timestamptz
)
language sql
security definer
set search_path to 'public'
as $function$
  select a.id, a.kind, a.entity_ref, a.entity_label, a.query, a.email, a.channel,
         a.status, a.last_checked_at, a.notified_at, a.created_at
  from public.entity_alerts a
  where a.user_id = auth.uid()
  order by a.created_at desc;
$function$;

-- ─── Permissões ────────────────────────────────────────────────────────────────
revoke execute on function public.create_entity_alert(text, text, text, text, text) from public, anon;
grant  execute on function public.create_entity_alert(text, text, text, text, text) to authenticated;

revoke execute on function public.delete_entity_alert(uuid) from public, anon;
grant  execute on function public.delete_entity_alert(uuid) to authenticated;

revoke execute on function public.list_my_entity_alerts() from public, anon;
grant  execute on function public.list_my_entity_alerts() to authenticated;
