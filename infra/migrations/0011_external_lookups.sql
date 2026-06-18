-- Migration: 0011_external_lookups
--
-- Cache de consultas a agregadores PAGOS por consulta (InfoSimples e futuros).
-- A Edge Function "infosimples-proxy" usa esta tabela como cache-first + base da
-- TRAVA DE GASTO (conta as chamadas 'live' do mes p/ respeitar um teto mensal) e
-- do rate-limit por usuario (conta as chamadas 'live' do dia por requested_by).
--
-- Modelo do provedor: consulta ON-DEMAND por CNPJ/CPF/nome -> JSON. NUNCA bulk.
-- Cada chamada 'live' custa dinheiro (~R$0,05-0,20, franquia min. R$100/mes), por
-- isso o cache (default TTL 60 dias) e a trava sao parte do contrato de seguranca.
--
-- Acesso: SO via a Edge Function (service_role). Sem leitura anon/authenticated —
-- o payload pode conter dado pessoal de terceiros (titular de marca) e nao deve
-- vazar pelo PostgREST. RLS ligado + sem policy = nega tudo (exceto service_role,
-- que ignora RLS). As contagens da trava sao feitas por RPCs SECURITY DEFINER.
--
-- Idempotente: create if not exists + create or replace. Seguro rodar de novo.

create table if not exists public.external_lookups (
  id           uuid        primary key default gen_random_uuid(),
  -- Provedor pago (ex.: 'infosimples'). Permite somar custo/consultas por provedor.
  provider     text        not null,
  -- Tipo de consulta dentro do provedor (ex.: 'inpi-marcas-cnpj'). Generico p/
  -- adicionar tribunais/certidoes depois sem nova tabela.
  lookup_kind  text        not null,
  -- Chave normalizada da consulta (ex.: o CNPJ com 14 digitos). Forma o cache key.
  lookup_key   text        not null,
  -- Resposta crua ja normalizada pela Edge (envelope { ok, source, ... }).
  payload      jsonb       not null,
  -- 'live' = veio da API paga (conta na trava); 'cache' nunca e gravado (so leitura).
  source       text        not null default 'live',
  -- Usuario que disparou a chamada paga (auth.uid). Base do rate-limit por usuario.
  requested_by uuid,
  -- Quando o dado foi efetivamente buscado na origem paga (base do TTL e da trava).
  fetched_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- Cache key: 1 linha por (provedor, tipo, chave). O upsert da Edge atualiza o
-- payload e o fetched_at quando refaz a consulta (cache expirado).
create unique index if not exists external_lookups_key_unique
  on public.external_lookups (provider, lookup_kind, lookup_key);

-- Indice da TRAVA DE GASTO: contar chamadas 'live' por provedor no mes corrente.
create index if not exists external_lookups_spend_idx
  on public.external_lookups (provider, source, fetched_at);

-- Indice do RATE-LIMIT por usuario: contar chamadas 'live' por usuario no dia.
create index if not exists external_lookups_user_idx
  on public.external_lookups (requested_by, fetched_at)
  where requested_by is not null;

-- RLS ligado e SEM policy: nega leitura/escrita a anon/authenticated. Somente a
-- service_role (a Edge Function) acessa — e ela ignora RLS por design.
alter table public.external_lookups enable row level security;

revoke all on public.external_lookups from anon, authenticated;

-- ─── RPC: external_lookup_spend_count ─────────────────────────────────────────
-- Conta as chamadas 'live' de um provedor desde o inicio do mes corrente (UTC).
-- Base da TRAVA DE GASTO mensal. SECURITY DEFINER p/ a Edge chamar com a chave
-- de servico sem depender de RLS. Numero pequeno (teto ~400/mes), count e barato.
create or replace function public.external_lookup_spend_count(p_provider text)
returns integer
language sql
security definer
set search_path to 'public'
as $function$
  select count(*)::int
  from public.external_lookups
  where provider = p_provider
    and source = 'live'
    and fetched_at >= date_trunc('month', now());
$function$;

-- ─── RPC: external_lookup_user_day_count ──────────────────────────────────────
-- Conta as chamadas 'live' que um usuario disparou nas ultimas 24h. Base do
-- rate-limit por usuario (impede um unico usuario de torrar a franquia).
create or replace function public.external_lookup_user_day_count(
  p_provider text,
  p_user     uuid
)
returns integer
language sql
security definer
set search_path to 'public'
as $function$
  select count(*)::int
  from public.external_lookups
  where provider = p_provider
    and source = 'live'
    and requested_by = p_user
    and fetched_at >= now() - interval '24 hours';
$function$;

-- Apenas service_role (a Edge Function) executa as RPCs de contagem — elas
-- enxergam dado agregado de consultas pagas e nao devem ser publicas.
revoke execute on function public.external_lookup_spend_count(text) from public, anon, authenticated;
revoke execute on function public.external_lookup_user_day_count(text, uuid) from public, anon, authenticated;
