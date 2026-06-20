-- =============================================================================
-- 0021_source_health_public_rpc.sql
-- =============================================================================
-- STATUS HONESTO DAS FONTES (página pública /sources).
--
-- PROBLEMA QUE RESOLVE
--   A página de Fontes (apps/web/src/app/sources/page.tsx) marcava fontes como
--   "conectado" via um mapa hardcoded (STATUS_OVERRIDES). Isso mente para o
--   usuário quando uma coleta quebra ou fica obsoleta: o badge continua verde.
--   O dono pediu status derivado da REALIDADE — a última coleta bem-sucedida
--   registrada em public.source_runs.
--
--   Porém public.source_runs tem RLS HABILITADO e NENHUMA policy de SELECT para
--   anon/authenticated. Sob RLS, "sem policy" = zero linhas via PostgREST. Logo
--   o front (chave publishable / anon) NÃO consegue ler source_runs diretamente.
--   E NÃO queremos abrir a tabela inteira: ela carrega error_message, que pode
--   vazar detalhes internos de falha (stack/SQL). Conceder SELECT amplo seria
--   exposição desnecessária.
--
-- SOLUÇÃO
--   Uma RPC SECURITY DEFINER, STABLE, SOMENTE-LEITURA e AGREGADA que devolve
--   apenas o que a UI precisa para pintar um indicador de saúde (verde/amarelo/
--   vermelho) por fonte:
--     • last_success_at  — última coleta com status='success'
--     • last_run_at      — última coleta de qualquer status
--     • last_status      — status da coleta mais recente ('success'/'failed'/'running')
--     • last_inserted    — records_inserted da coleta de sucesso mais recente
--     • success_runs     — total de coletas bem-sucedidas (sinal de maturidade)
--   NÃO expõe error_message, payloads, ids de linha nem qualquer dado sensível.
--   A derivação saudável/degradado fica no cliente (limiares de frescor por
--   cadência), mantendo a RPC simples e estável.
--
--   A chave de agrupamento é source_runs.source_id (ex.: 'pncp-contratacoes',
--   'pncp-contratos', 'ibge-localidades'), que difere em alguns casos do id do
--   catálogo público (packages/sources). O mapeamento catálogo -> source_id(s)
--   de coleta vive no front (apps/web/src/features/sources/source-health.ts).
--
-- SEGURANÇA
--   • SECURITY DEFINER + search_path fixo ('public'): sem path injection.
--   • STABLE, sem efeitos colaterais (só SELECT agregado).
--   • EXECUTE concedido a anon + authenticated (leitura pública e benigna).
--     service_role continua podendo executar (não é afetado por GRANT/REVOKE).
--   • A tabela source_runs permanece fechada (RLS sem policy de SELECT): o
--     único caminho de leitura pública é esta visão agregada.
--
-- IDEMPOTÊNCIA
--   CREATE OR REPLACE + GRANTs repetíveis. Seguro reaplicar em produção.
--
-- COMO APLICAR
--   Via Supabase MCP `apply_migration` (name: 0021_source_health_public_rpc),
--   ou `supabase db push`. NÃO altera schema de tabelas; só cria a função e o
--   grant. Requer migrations anteriores aplicadas (tabela source_runs existe).
-- =============================================================================

create or replace function public.source_health()
returns table (
  source_id      text,
  last_success_at timestamptz,
  last_run_at     timestamptz,
  last_status     text,
  last_inserted   integer,
  success_runs    bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ranked as (
    select
      sr.source_id,
      sr.status,
      sr.records_inserted,
      coalesce(sr.finished_at, sr.started_at) as run_at,
      row_number() over (
        partition by sr.source_id
        order by coalesce(sr.finished_at, sr.started_at) desc
      ) as rn_any,
      row_number() over (
        partition by sr.source_id
        order by (sr.status = 'success') desc, coalesce(sr.finished_at, sr.started_at) desc
      ) as rn_ok
    from public.source_runs sr
  )
  select
    r.source_id,
    max(r.run_at) filter (where r.status = 'success')        as last_success_at,
    max(r.run_at)                                            as last_run_at,
    max(r.status) filter (where r.rn_any = 1)                as last_status,
    max(r.records_inserted) filter (where r.rn_ok = 1 and r.status = 'success') as last_inserted,
    count(*) filter (where r.status = 'success')             as success_runs
  from ranked r
  group by r.source_id;
$function$;

comment on function public.source_health() is
  'Visão pública AGREGADA e SOMENTE-LEITURA da saúde de coletas por source_id '
  '(última coleta de sucesso, última coleta, status mais recente, contagem). '
  'Não expõe error_message nem dados sensíveis. Consumida pela página /sources.';

-- Leitura pública benigna: o front usa a chave publishable (role anon).
grant execute on function public.source_health() to anon, authenticated;
