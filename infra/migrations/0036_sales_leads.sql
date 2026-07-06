-- =============================================================================
-- 0036_sales_leads.sql
-- =============================================================================
-- Motor de VENDAS: leads B2B derivados dos ARREMATANTES de leilão da Receita
-- Federal (quem já comprou em leilão = ICP perfeito do produto).
--
-- Projeto: pwiuiihsyazghdsrpshg (Fonte.ia / Olli)
--
-- DE ONDE VÊM OS LEADS
--   public.auction_lot_history.winner_doc guarda o documento do arrematante.
--   CPF de pessoa física vem MASCARADO da Receita ("***670421-**") -> descartável
--   para outreach. CNPJ (14 dígitos, público) é o lead contatável e B2B — base
--   legal defensável na LGPD (dado cadastral público de PJ + opt-out + identificação).
--   Esta migration agrega esses CNPJs em leads: nº de lotes, GMV arrematado,
--   primeira/última compra, categoria e UFs — sinal de compra REAL, não presumido.
--
-- ENRIQUECIMENTO (contato) — feito depois pela Edge Function "enrich-sales-leads":
--   Roteado por CUSTO. Fonte GRÁTIS primeiro: Minha Receita (minhareceita.org),
--   que já devolve email + telefone + razão social + CNAE + sócios. InfoSimples
--   (paga) fica como camada premium de compliance, opcional. As colunas de
--   contato (email, telefone, razao_social, ...) são preenchidas por aquela função;
--   esta migration só cria o esqueleto e a agregação, e NUNCA as sobrescreve no
--   rebuild (o rebuild só atualiza os agregados de arremate).
--
-- PRIVACIDADE / SEGURANÇA
--   Dado de prospecção interno. RLS ligado + SEM policy de leitura para
--   anon/authenticated (igual a external_lookups): só service_role (Edge) e as
--   RPCs SECURITY DEFINER com gate is_admin() acessam. O e-mail de contato é PJ,
--   público, mas não deve vazar em massa pelo PostgREST.
--
-- Idempotente: create if not exists + create or replace. Seguro rodar de novo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tabela de leads de vendas.
-- ---------------------------------------------------------------------------
create table if not exists public.sales_leads (
  -- CNPJ normalizado (14 dígitos, só números) — chave natural do lead.
  cnpj                 text        primary key,
  cnpj_formatted       text,

  -- De onde o lead entrou (extensível: outros coletores no futuro).
  source               text        not null default 'receita_arremate',

  -- ── Sinal de compra (agregado de auction_lot_history — mantido pelo rebuild) ──
  winner_name          text,                 -- nome do arrematante no extrato (mais recente)
  lots_won             integer     not null default 0,
  total_won_cents      bigint      not null default 0,
  first_won_at         timestamptz,
  last_won_at          timestamptz,
  top_category         text,                 -- categoria mais frequente arrematada
  won_ufs              text[],               -- UFs onde arrematou (personalização)

  -- ── Contato / cadastro (preenchido pelo enriquecimento — NÃO tocado no rebuild) ─
  razao_social         text,
  nome_fantasia        text,
  email                text,
  telefone             text,
  uf                   text,
  municipio            text,
  cnae_codigo          text,
  cnae                 text,
  porte                text,
  situacao_cadastral   text,
  socios               jsonb,

  enrichment_status    text        not null default 'pending'
                         check (enrichment_status in ('pending','enriched','not_found','failed')),
  enriched_at          timestamptz,
  contact_source       text,                 -- 'minhareceita' | 'infosimples'

  -- ── Estado de CRM / outreach ────────────────────────────────────────────────
  stage                text        not null default 'novo'
                         check (stage in ('novo','enriquecido','contatado','respondeu','trial','pago','perdido','opt_out')),
  opt_out              boolean     not null default false,
  last_touch_at        timestamptz,
  touch_count          integer     not null default 0,
  notes                text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Índices para os cortes de venda mais usados.
create index if not exists sales_leads_stage_idx        on public.sales_leads (stage);
create index if not exists sales_leads_enrichment_idx   on public.sales_leads (enrichment_status);
create index if not exists sales_leads_uf_idx           on public.sales_leads (uf);
create index if not exists sales_leads_gmv_idx          on public.sales_leads (total_won_cents desc);
create index if not exists sales_leads_email_idx        on public.sales_leads (email) where email is not null and email <> '';
create index if not exists sales_leads_contactable_idx  on public.sales_leads (stage)
  where opt_out = false and email is not null and email <> '';

-- updated_at automático em qualquer UPDATE.
create or replace function public.sales_leads_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sales_leads_updated_at on public.sales_leads;
create trigger trg_sales_leads_updated_at
  before update on public.sales_leads
  for each row execute function public.sales_leads_set_updated_at();

-- RLS ligado e SEM policy: nega leitura/escrita a anon/authenticated. Só a
-- service_role (Edge) e as RPCs admin definer abaixo acessam.
alter table public.sales_leads enable row level security;
revoke all on public.sales_leads from anon, authenticated;


-- ---------------------------------------------------------------------------
-- Núcleo do rebuild (SEM gate) — agrega arrematantes-CNPJ de
-- auction_lot_history em leads. Só agregados de arremate são atualizados no
-- conflito; contato, enriquecimento e estágio de CRM são PRESERVADOS.
-- Interno: revogado de todos; chamado pelo seed da migration e pela RPC admin.
-- ---------------------------------------------------------------------------
create or replace function public._sales_leads_rebuild_core()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_upserted bigint;
begin
  with agg as (
    select
      regexp_replace(winner_doc, '\D', '', 'g')                              as cnpj,
      count(*)                                                               as lots_won,
      coalesce(sum(final_value_cents), 0)                                    as total_won_cents,
      min(coalesce(closed_at, final_value_collected_at, collected_at, created_at)) as first_won_at,
      max(coalesce(closed_at, final_value_collected_at, collected_at, created_at)) as last_won_at,
      (array_agg(winner_name order by coalesce(closed_at, final_value_collected_at, collected_at, created_at) desc nulls last)
        filter (where winner_name is not null and winner_name <> ''))[1]     as winner_name,
      mode() within group (order by category_norm)                          as top_category,
      array_agg(distinct uf) filter (where uf is not null and uf <> '')      as won_ufs
    from public.auction_lot_history
    where winner_doc is not null
      and winner_doc not like '%*%'                                          -- descarta CPF mascarado
      and length(regexp_replace(winner_doc, '\D', '', 'g')) = 14             -- só CNPJ
    group by 1
  )
  insert into public.sales_leads as sl (
    cnpj, cnpj_formatted, source,
    winner_name, lots_won, total_won_cents, first_won_at, last_won_at, top_category, won_ufs,
    updated_at
  )
  select
    a.cnpj,
    substr(a.cnpj,1,2)||'.'||substr(a.cnpj,3,3)||'.'||substr(a.cnpj,6,3)||'/'||substr(a.cnpj,9,4)||'-'||substr(a.cnpj,13,2),
    'receita_arremate',
    a.winner_name, a.lots_won, a.total_won_cents, a.first_won_at, a.last_won_at, a.top_category, a.won_ufs,
    now()
  from agg a
  on conflict (cnpj) do update set
    winner_name     = excluded.winner_name,
    lots_won        = excluded.lots_won,
    total_won_cents = excluded.total_won_cents,
    first_won_at    = excluded.first_won_at,
    last_won_at     = excluded.last_won_at,
    top_category    = excluded.top_category,
    won_ufs         = excluded.won_ufs,
    updated_at      = now();

  get diagnostics v_upserted = row_count;
  return v_upserted;
end;
$$;

revoke execute on function public._sales_leads_rebuild_core() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- RPC: rebuild_sales_leads — versão com gate is_admin, para a UI do dono acionar.
-- ---------------------------------------------------------------------------
create or replace function public.rebuild_sales_leads()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_upserted bigint;
  v_total    bigint;
  v_gmv      bigint;
begin
  perform public.admin_assert();
  v_upserted := public._sales_leads_rebuild_core();
  select count(*), coalesce(sum(total_won_cents), 0)
    into v_total, v_gmv
    from public.sales_leads;
  return jsonb_build_object(
    'ok', true,
    'upserted', v_upserted,
    'total_leads', v_total,
    'total_gmv_cents', v_gmv
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- RPC: admin_sales_leads — leitura paginada para o painel de vendas do dono.
--   Gate is_admin. Ordena por GMV arrematado desc (maior poder de compra primeiro).
-- ---------------------------------------------------------------------------
create or replace function public.admin_sales_leads(
  p_stage            text    default null,
  p_only_contactable boolean default false,
  p_limit            integer default 50,
  p_offset           integer default 0
)
returns table(
  cnpj text,
  cnpj_formatted text,
  winner_name text,
  razao_social text,
  email text,
  telefone text,
  uf text,
  municipio text,
  top_category text,
  lots_won integer,
  total_won_cents bigint,
  last_won_at timestamptz,
  enrichment_status text,
  stage text,
  opt_out boolean,
  touch_count integer,
  last_touch_at timestamptz
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
      sl.cnpj, sl.cnpj_formatted, sl.winner_name, sl.razao_social, sl.email, sl.telefone,
      sl.uf, sl.municipio, sl.top_category, sl.lots_won, sl.total_won_cents, sl.last_won_at,
      sl.enrichment_status, sl.stage, sl.opt_out, sl.touch_count, sl.last_touch_at
    from public.sales_leads sl
    where (p_stage is null or sl.stage = p_stage)
      and (not p_only_contactable
           or (sl.opt_out = false and sl.email is not null and sl.email <> ''))
    order by sl.total_won_cents desc, sl.lots_won desc
    limit least(greatest(coalesce(p_limit, 50), 1), 500)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;


-- ---------------------------------------------------------------------------
-- GRANTS / REVOKES — o gate real é o is_admin() interno; aqui só fechamos anon.
-- ---------------------------------------------------------------------------
revoke execute on function public.rebuild_sales_leads()                              from public, anon;
revoke execute on function public.admin_sales_leads(text, boolean, integer, integer) from public, anon;

grant execute on function public.rebuild_sales_leads()                              to authenticated;
grant execute on function public.admin_sales_leads(text, boolean, integer, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- SEED inicial: materializa os leads a partir dos arremates já coletados.
-- Roda como owner na aplicação da migration (sem gate). Idempotente.
-- ---------------------------------------------------------------------------
select public._sales_leads_rebuild_core();
