-- Rate limiting por IP para as rotas de IA da Edge Function "fonteia".
--
-- Tabela de janelas fixas (fixed-window counter): uma linha por (ip, janela de 1 min).
-- RLS LIGADO e SEM policy pública: só o service_role (que ignora RLS) e a função
-- SECURITY DEFINER abaixo conseguem ler/escrever. O anon/authenticated não enxerga nada.
--
-- A Edge Function chama a RPC `check_ai_rate_limit` no início de cada rota de IA.
-- A RPC incrementa atomicamente o contador da janela atual e devolve se estourou o
-- limite e em quantos segundos a janela reseta (retry_after).

create table if not exists public.ai_rate_limits (
  ip           text        not null,
  window_start timestamptz not null,
  count        int         not null default 0,
  primary key (ip, window_start)
);

-- RLS ligado, nenhuma policy criada => bloqueia anon/authenticated por completo.
-- service_role e funções SECURITY DEFINER (owner) seguem podendo operar.
alter table public.ai_rate_limits enable row level security;

-- Sem GRANT para anon/authenticated; o acesso é exclusivamente via service_role
-- ou via a função SECURITY DEFINER `check_ai_rate_limit`.
revoke all on table public.ai_rate_limits from anon, authenticated;

-- Função atômica de checagem + incremento (fixed window de `p_window_seconds`).
-- Retorna JSON: { allowed: bool, count: int, limit: int, retry_after: int }.
-- SECURITY DEFINER: roda como owner (postgres), então NÃO precisa de policy/GRANT
-- na tabela. É a única porta de entrada de quem não é service_role.
create or replace function public.check_ai_rate_limit(
  p_ip             text,
  p_limit          int default 30,
  p_window_seconds int default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count        int;
  v_retry_after  int;
begin
  -- IP vazio/desconhecido: não bloqueia (fail-open), mas registra numa chave fixa.
  if p_ip is null or length(btrim(p_ip)) = 0 then
    p_ip := 'unknown';
  end if;

  -- Início da janela fixa atual (alinha ao múltiplo de p_window_seconds).
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  ) at time zone 'UTC';

  -- Incremento atômico da janela atual (cria a linha se for o 1º hit da janela).
  insert into public.ai_rate_limits (ip, window_start, count)
  values (p_ip, v_window_start, 1)
  on conflict (ip, window_start)
  do update set count = public.ai_rate_limits.count + 1
  returning count into v_count;

  v_retry_after := greatest(
    1,
    ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - now())))::int
  );

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'limit', p_limit,
    'retry_after', v_retry_after
  );
end;
$$;

-- Só o service_role pode invocar a RPC (a Edge Function usa a service_role key).
revoke all on function public.check_ai_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_ai_rate_limit(text, int, int) to service_role;

-- Limpeza oportunista de janelas antigas (evita crescimento infinito da tabela).
-- Roda como owner; chamada pelo cron abaixo, fora do caminho quente das requisições.
create or replace function public.prune_ai_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ai_rate_limits
  where window_start < now() - interval '1 hour';
$$;

revoke all on function public.prune_ai_rate_limits() from public, anon, authenticated;
grant execute on function public.prune_ai_rate_limits() to service_role;

-- Agenda a limpeza de hora em hora (pg_cron já habilitado neste projeto).
-- Idempotente: remove um agendamento anterior de mesmo nome antes de recriar.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('prune-ai-rate-limits')
    where exists (select 1 from cron.job where jobname = 'prune-ai-rate-limits');
    perform cron.schedule('prune-ai-rate-limits', '7 * * * *', $cron$select public.prune_ai_rate_limits();$cron$);
  end if;
end;
$$;
