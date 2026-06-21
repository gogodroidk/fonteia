-- 0031_feedback.sql
-- Canal de suporte e feedback do cliente.
--
-- Tabela `feedback`: usuário reporta reclamações, sugestões, melhorias e bugs.
-- Captura automática da rota/contexto + user_id/email opcional (anônimo ok).
-- Status: novo → em_análise → resolvido.
--
-- RLS:
--   - authenticated cria e lê o PRÓPRIO (filtrado por user_id).
--   - admin (profiles.role = 'admin') lê tudo via RPC SECURITY DEFINER.
--
-- RPCs SECURITY DEFINER:
--   submit_feedback    — insere feedback; funciona autenticado ou anônimo.
--   list_my_feedback   — lista os feedbacks do usuário logado.
--   list_all_feedback  — admin: lista todos os feedbacks (requer role=admin).

-- ─── Tabela ───────────────────────────────────────────────────────────────────

create table if not exists public.feedback (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users(id) on delete set null,
  email       text,
  tipo        text        not null check (tipo in ('reclamação','sugestão','melhoria','bug')),
  mensagem    text        not null check (char_length(btrim(mensagem)) >= 10),
  contexto    text,                         -- rota atual, ex.: /app/lotes
  status      text        not null default 'novo' check (status in ('novo','em_análise','resolvido')),
  created_at  timestamptz not null default now()
);

create index if not exists feedback_user_idx   on public.feedback (user_id);
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

-- Usuário autenticado lê e enxerga apenas o próprio feedback.
drop policy if exists "own feedback select" on public.feedback;
create policy "own feedback select" on public.feedback
  for select using (auth.uid() = user_id);

-- Não há insert/update/delete direto: tudo passa pelas RPCs SECURITY DEFINER.

-- ─── RPC: submit_feedback ────────────────────────────────────────────────────

create or replace function public.submit_feedback(
  p_tipo      text,
  p_mensagem  text,
  p_contexto  text    default null,
  p_email     text    default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid     uuid    := auth.uid();           -- null se anônimo
  v_tipo    text    := btrim(lower(coalesce(p_tipo, '')));
  v_msg     text    := btrim(coalesce(p_mensagem, ''));
  v_email   text    := btrim(coalesce(p_email, ''));
  v_id      uuid;
begin
  -- Validações básicas
  if v_tipo not in ('reclamação','sugestão','melhoria','bug') then
    return jsonb_build_object(
      'ok',      false,
      'error',   'tipo_invalido',
      'message', 'Tipo inválido. Use: reclamação, sugestão, melhoria ou bug.'
    );
  end if;

  if char_length(v_msg) < 10 then
    return jsonb_build_object(
      'ok',      false,
      'error',   'mensagem_curta',
      'message', 'Mensagem deve ter pelo menos 10 caracteres.'
    );
  end if;

  insert into public.feedback (user_id, email, tipo, mensagem, contexto, status)
  values (
    v_uid,
    nullif(v_email, ''),
    v_tipo,
    v_msg,
    nullif(btrim(coalesce(p_contexto, '')), ''),
    'novo'
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok',      true,
    'id',      v_id,
    'message', 'Feedback enviado com sucesso! Obrigado pela sua contribuição.'
  );
end;
$fn$;

revoke execute on function public.submit_feedback(text, text, text, text) from public, anon;
grant  execute on function public.submit_feedback(text, text, text, text) to anon, authenticated;

-- ─── RPC: list_my_feedback ───────────────────────────────────────────────────

create or replace function public.list_my_feedback()
returns table (
  id         uuid,
  tipo       text,
  mensagem   text,
  contexto   text,
  status     text,
  created_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $fn$
  select
    f.id,
    f.tipo,
    f.mensagem,
    f.contexto,
    f.status,
    f.created_at
  from public.feedback f
  where f.user_id = auth.uid()
  order by f.created_at desc
  limit 50;
$fn$;

revoke execute on function public.list_my_feedback() from public, anon;
grant  execute on function public.list_my_feedback() to authenticated;

-- ─── RPC: list_all_feedback (admin) ──────────────────────────────────────────

create or replace function public.list_all_feedback(
  p_status  text    default null,    -- filtro opcional: 'novo','em_análise','resolvido'
  p_limit   integer default 100
)
returns table (
  id         uuid,
  user_id    uuid,
  email      text,
  tipo       text,
  mensagem   text,
  contexto   text,
  status     text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  -- Verificação de admin via profiles
  select role into v_role
  from public.profiles
  where id = v_uid;

  if v_role is distinct from 'admin' then
    raise exception 'Acesso negado: apenas administradores podem listar todos os feedbacks.';
  end if;

  return query
    select
      f.id,
      f.user_id,
      f.email,
      f.tipo,
      f.mensagem,
      f.contexto,
      f.status,
      f.created_at
    from public.feedback f
    where (p_status is null or f.status = p_status)
    order by f.created_at desc
    limit least(p_limit, 500);
end;
$fn$;

revoke execute on function public.list_all_feedback(text, integer) from public, anon;
grant  execute on function public.list_all_feedback(text, integer) to authenticated;
