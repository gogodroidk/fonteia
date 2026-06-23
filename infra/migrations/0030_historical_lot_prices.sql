-- =============================================================================
-- 0030_historical_lot_prices.sql — BASE HISTÓRICA DE PREÇOS DE LOTES (Receita SLE)
-- =============================================================================
-- APLICADA em produção (Supabase MCP apply_migration) em 2026-06-23.
--
-- O QUE CRIA
--   1. Tabela `auction_lot_history` — registro PERENE por lote de leilão
--      encerrado/cancelado: identificação, categoria, lance mínimo, avaliação
--      oficial, valor de arremate (NULLABLE — só quando publicado em ata; nunca
--      estimado), datas, e EVIDÊNCIA (source_url + sha256 + collected_at).
--   2. `fonteia_norm_text` — normalização PT-BR (lower + remove acento) p/ agrupar
--      categorias ("lotes parecidos").
--   3. `auction_price_intelligence(...)` — RPC PÚBLICA, somente-leitura: dado uma
--      categoria (+ cidade/UF/janela), devolve estatística (n, mediana, p25/p75,
--      min/max de lance mínimo e avaliação; arremate só quando há dado) + amostra
--      com URL de fonte. Não fabrica preço.
--
-- COMO A BASE É PREENCHIDA
--   Pela Edge Function `ingest-receita-historico` (supabase/functions/), que lê a
--   API pública `editais-disponiveis` + `api/edital/{edle}` (todos os editais
--   TERMINAIS, não só "destaques") e faz upsert idempotente aqui. Agendada via
--   pg_cron `ingest-receita-historico-6h`. O arremate/arrematante (da ata) é
--   enriquecido depois, em fluxo separado — NUNCA apaga `final_value_*` no upsert.
--
-- NOTA DE PROCEDÊNCIA: a base desta migration veio do agente a721dc34 (que também
--   propôs uma RPC `snapshot_auction_lot_history` lendo de `entities`). Aqui a
--   captura é feita direto da API pela Edge Function (a API expõe os editais
--   encerrados, que NÃO chegavam a `entities` pelo coletor de destaques), então a
--   RPC de snapshot foi omitida. A versão completa do agente está preservada na
--   branch worktree-agent-a721dc341c095c1e2.
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.auction_lot_history (
  id                  uuid primary key default gen_random_uuid(),
  source_id           text not null default 'receita-leiloes-sle' references public.sources(id),
  receita_lot_id      text not null,
  entity_id           uuid references public.entities(id) on delete set null,
  edital              text,
  edle                text,
  lot_number          text,
  category_raw        text,
  category_norm       text,
  title               text,
  city                text,
  uf                  text,
  minimum_bid_cents   bigint check (minimum_bid_cents is null or minimum_bid_cents >= 0),
  appraisal_cents     bigint check (appraisal_cents   is null or appraisal_cents   >= 0),
  final_value_cents   bigint check (final_value_cents is null or final_value_cents >= 0),
  final_value_source  text,
  outcome             text not null default 'closed' check (outcome in ('closed','cancelled')),
  edital_situacao     integer,
  lot_situacao        integer,
  proposal_deadline   timestamptz,
  closed_at           timestamptz,
  first_seen_at       timestamptz not null default now(),
  last_snapshot_at    timestamptz not null default now(),
  source_url          text not null,
  content_hash        text not null,
  collected_at        timestamptz not null,
  attributes          jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  constraint auction_lot_history_receita_lot_id_unique unique (receita_lot_id)
);

comment on table public.auction_lot_history is
  'Histórico PERENE de lotes de leilão encerrados/cancelados (Receita SLE). Preserva preço (mínimo/avaliação; arremate quando publicado em ata), categoria e evidência (fonte+data+hash). Base da inteligência de preço. Só dado rastreável; nada fabricado.';

create index if not exists idx_alh_category_norm on public.auction_lot_history (category_norm) where outcome='closed';
create index if not exists idx_alh_category_city on public.auction_lot_history (category_norm, city) where outcome='closed';
create index if not exists idx_alh_min_bid on public.auction_lot_history (minimum_bid_cents) where outcome='closed' and minimum_bid_cents is not null;
create index if not exists idx_alh_appraisal on public.auction_lot_history (appraisal_cents) where outcome='closed' and appraisal_cents is not null;
create index if not exists idx_alh_closed_at on public.auction_lot_history (closed_at desc);
create index if not exists idx_alh_with_final on public.auction_lot_history (category_norm) where final_value_cents is not null;
create index if not exists idx_alh_attributes on public.auction_lot_history using gin (attributes);

alter table public.auction_lot_history enable row level security;
grant select, insert, update, delete on public.auction_lot_history to service_role;
grant select on public.auction_lot_history to anon, authenticated;
drop policy if exists "Public auction lot history is readable" on public.auction_lot_history;
create policy "Public auction lot history is readable"
  on public.auction_lot_history for select to anon, authenticated using (true);

create or replace function public.fonteia_norm_text(p_in text)
returns text language sql immutable set search_path to ''
as $function$
  select case when p_in is null then null
    else trim(lower(translate(p_in,
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuucCnn'))) end;
$function$;

create or replace function public.auction_price_intelligence(
  p_category text, p_city text default null, p_uf text default null,
  p_months int default 36, p_sample int default 8
)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_cat    text := public.fonteia_norm_text(p_category);
  v_city   text := public.fonteia_norm_text(p_city);
  v_uf     text := nullif(upper(trim(coalesce(p_uf,''))),'');
  v_months int  := nullif(coalesce(p_months,36),0);
  v_sample int  := least(greatest(coalesce(p_sample,8),1),50);
  v_since  timestamptz := case when v_months is null then null else now() - make_interval(months => v_months) end;
  v_stats jsonb; v_sample_rows jsonb;
begin
  if v_cat is null or v_cat = '' then
    return jsonb_build_object('ok',false,'error','categoria obrigatória','stats',null,'sample','[]'::jsonb);
  end if;
  with base as (
    select h.* from public.auction_lot_history h
    where h.outcome='closed' and h.category_norm is not null
      and h.category_norm like v_cat || '%'
      and (v_city is null or public.fonteia_norm_text(h.city)=v_city)
      and (v_uf is null or h.uf=v_uf)
      and (v_since is null or coalesce(h.closed_at,h.first_seen_at) >= v_since)
  )
  select jsonb_build_object(
    'category',p_category,'category_norm',v_cat,'city',p_city,'uf',v_uf,'months',v_months,
    'n',count(*),'n_with_final',count(*) filter (where final_value_cents is not null),
    'minimum_bid', jsonb_build_object(
      'n',count(*) filter (where minimum_bid_cents is not null),
      'min',min(minimum_bid_cents),
      'p25',percentile_cont(0.25) within group (order by minimum_bid_cents) filter (where minimum_bid_cents is not null),
      'median',percentile_cont(0.50) within group (order by minimum_bid_cents) filter (where minimum_bid_cents is not null),
      'p75',percentile_cont(0.75) within group (order by minimum_bid_cents) filter (where minimum_bid_cents is not null),
      'max',max(minimum_bid_cents)),
    'appraisal', jsonb_build_object(
      'n',count(*) filter (where appraisal_cents is not null),
      'min',min(appraisal_cents),
      'p25',percentile_cont(0.25) within group (order by appraisal_cents) filter (where appraisal_cents is not null),
      'median',percentile_cont(0.50) within group (order by appraisal_cents) filter (where appraisal_cents is not null),
      'p75',percentile_cont(0.75) within group (order by appraisal_cents) filter (where appraisal_cents is not null),
      'max',max(appraisal_cents)),
    'final_value', jsonb_build_object(
      'n',count(*) filter (where final_value_cents is not null),
      'min',min(final_value_cents),
      'median',percentile_cont(0.50) within group (order by final_value_cents) filter (where final_value_cents is not null),
      'max',max(final_value_cents))
  ) into v_stats from base;
  select coalesce(jsonb_agg(sample.s order by sample.s_closed desc), '[]'::jsonb) into v_sample_rows
  from (
    select jsonb_build_object(
      'receita_lot_id',h.receita_lot_id,'title',h.title,'category',h.category_raw,'city',h.city,
      'minimum_bid_cents',h.minimum_bid_cents,'appraisal_cents',h.appraisal_cents,
      'final_value_cents',h.final_value_cents,'closed_at',h.closed_at,'source_url',h.source_url,
      'collected_at',h.collected_at,'content_hash',h.content_hash) as s,
      coalesce(h.closed_at,h.first_seen_at) as s_closed
    from public.auction_lot_history h
    where h.outcome='closed' and h.category_norm is not null and h.category_norm like v_cat || '%'
      and (v_city is null or public.fonteia_norm_text(h.city)=v_city)
      and (v_uf is null or h.uf=v_uf)
      and (v_since is null or coalesce(h.closed_at,h.first_seen_at) >= v_since)
    order by coalesce(h.closed_at,h.first_seen_at) desc limit v_sample
  ) sample;
  return jsonb_build_object('ok',true,'stats',v_stats,'sample',v_sample_rows,
    'citation', jsonb_build_object('source_id','receita-leiloes-sle',
      'source_name','Receita Federal - Sistema de Leilão Eletrônico',
      'note','Estatística sobre lances mínimos e avaliações oficiais de lotes encerrados. Valor de arremate só consta quando publicado em ata.'));
end;
$function$;

grant execute on function public.auction_price_intelligence(text, text, text, int, int) to anon, authenticated;
