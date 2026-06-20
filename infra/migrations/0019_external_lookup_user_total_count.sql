-- 0019_external_lookup_user_total_count.sql
--
-- RPC de apoio ao gate de COTA DE CORTESIA do infosimples-proxy: conta quantas
-- consultas LIVE (source='live') um usuário já fez para um provider, SEM filtro de
-- data (cota total durante o trial). Usada para liberar um número pequeno de
-- consultas a usuários em trial/free, mantendo as travas globais de gasto.
--
-- SECURITY DEFINER porque lê public.external_lookups (que tem RLS sem policy
-- pública). DEVE ser exclusiva do service_role (Edge Functions). O REVOKE abaixo
-- corrige o default do Postgres de EXECUTE para PUBLIC — sem ele, anon/authenticated
-- conseguiriam contar uso de qualquer usuário via PostgREST (vazamento + bypass RLS).
--
-- Já aplicada em produção via MCP (migrations add_external_lookup_user_total_count_rpc
-- + harden_revoke_external_lookup_user_total_count). Este arquivo versiona para
-- re-provisionamento e revisão.

create or replace function public.external_lookup_user_total_count(
  p_provider text,
  p_user uuid
) returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.external_lookups
  where provider = p_provider
    and source = 'live'
    and requested_by = p_user
$$;

revoke execute on function public.external_lookup_user_total_count(text, uuid)
  from public, anon, authenticated;
grant execute on function public.external_lookup_user_total_count(text, uuid)
  to service_role;
