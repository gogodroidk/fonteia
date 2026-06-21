-- =============================================================================
-- 0026_db_perf.sql  —  Performance do banco aproveitando o plano Pro (NÃO aplicada)
-- =============================================================================
-- ⚠️  ESTA MIGRATION AINDA NÃO FOI APLICADA. Versionada para revisão. Aplicar via
--     Supabase MCP `apply_migration` (name: 0026_db_perf) OU `supabase db push`,
--     DEPOIS de 0099/0007/0002/0022 (versões canônicas das policies/RPCs que esta
--     migration reescreve) e, idealmente, junto/depois de 0024 (anti-churn).
--
-- TODAS as mudanças foram conferidas contra o banco REAL (read-only) em
-- 2026-06-21 (projeto pwiuiihsyazghdsrpshg). Cada predicado de policy abaixo é
-- cópia EXATA do que `pg_policies`/`pg_get_expr` retornaram em produção — não há
-- predicado inventado. Tudo idempotente (DROP POLICY IF EXISTS + CREATE,
-- CREATE INDEX IF NOT EXISTS, ALTER ... SET): reaplicar é no-op.
--
-- Conteúdo:
--   1. RLS performance (advisor auth_rls_initplan): 24 policies em 13 tabelas
--      reescritas para envolver auth.uid()/auth.email()/auth.jwt() em (select ...)
--      — avalia 1x por query em vez de 1x por linha.
--   2. multiple_permissive_policies em `entities`: consolida as 10 policies de
--      SELECT público (uma por kind) em UMA só — menos overhead de RLS por linha
--      na maior e mais consultada tabela. Preserva EXATAMENTE a visibilidade.
--   3. Autovacuum tuning em `entities` (e tabelas de alta churn) — para o
--      autovacuum acompanhar a churn de re-ingestão (foi o incidente de bloat).
--   4. pg_cron: comandos DOCUMENTADOS (comentados, NÃO executados) para reativar
--      os coletores ingest_* desligados e confirmar o prune do rate-limit.
--
-- O QUE ESTA MIGRATION **NÃO** FAZ (decisões conscientes, ver justificativas):
--   • NÃO dropa nenhum dos 66 "unused_index" do advisor. A maioria são os
--     idx_entities_<kind>_unique — alvos de ON CONFLICT das RPCs ingest_*
--     (garantia de idempotência). "Unused" no advisor = não usado em LEITURA;
--     eles são essenciais para EVITAR DUPLICATAS na escrita. Dropá-los quebraria
--     a idempotência da ingestão. Os demais (Stripe FDW, billing pouco lido) são
--     baratos e à prova de regressão. Limpeza de índice exige análise dedicada,
--     fora do escopo "perf sem risco" desta migration.
--   • NÃO adiciona índice de FK. O único unindexed_foreign_keys do advisor é
--     `stripe._managed_webhooks.fk_managed_webhooks_account`, em schema GERENCIADO
--     pelo wrapper Stripe (extensions.wrappers) — não é nosso para alterar e uma
--     recriação do FDW o sobrescreveria. TODAS as FKs do schema `public` já têm
--     índice de cobertura (conferido: pg_constraint × pg_index, 21/21 cobertas,
--     incl. user_module_access.module_id, coberto por 0023/idx criado via MCP).
--   • NÃO move extensões de `public` (postgis/vector/pg_net) nem mexe em
--     SECURITY DEFINER / search_path — são achados de SEGURANÇA (advisor security),
--     território do security-reviewer, não de performance.
-- =============================================================================


-- #############################################################################
-- # SEÇÃO 1 — RLS PERFORMANCE  (advisor: auth_rls_initplan)                    #
-- #############################################################################
-- PROBLEMA: auth.uid(), auth.email() e auth.jwt() são funções STABLE mas o
-- planejador, quando elas aparecem "cruas" no predicado de uma policy, as
-- reavalia UMA VEZ POR LINHA varrida (initplan não é içado). Em tabela grande
-- isso multiplica o custo da RLS pelo nº de linhas. Envolver em subselect escalar
-- — (select auth.uid()) — faz o Postgres avaliar UMA VEZ por execução e tratar o
-- resultado como constante (InitPlan). Recomendação oficial do Supabase:
--   https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Para is_admin(auth.uid()) o mesmo vale: o que precisa ser içado é o auth.uid()
-- VOLÁTIL-por-linha lá dentro → is_admin((select auth.uid())). is_admin é STABLE,
-- então com o argumento constante o resultado também é içável.
--
-- Cada CREATE abaixo replica o predicado EXATO de produção (mesmas colunas,
-- mesmos casts ::text, mesmos roles, mesmo permissive). Só muda: auth.* → (select auth.*).
-- -----------------------------------------------------------------------------

-- ---- coupon_redemptions : "own redemptions" (SELECT, role public) -----------
-- prod: USING (auth.uid() = user_id)   [user_id é uuid]
drop policy if exists "own redemptions" on public.coupon_redemptions;
create policy "own redemptions"
  on public.coupon_redemptions
  for select
  to public
  using ((select auth.uid()) = user_id);

-- ---- entity_alerts : "own entity_alerts select" (SELECT, role public) --------
-- prod: USING (auth.uid() = user_id)   [user_id é uuid]
drop policy if exists "own entity_alerts select" on public.entity_alerts;
create policy "own entity_alerts select"
  on public.entity_alerts
  for select
  to public
  using ((select auth.uid()) = user_id);

-- ---- user_alerts : "own alerts select" (SELECT, role public) -----------------
-- prod: USING (auth.uid() = user_id)   [user_id é uuid]
drop policy if exists "own alerts select" on public.user_alerts;
create policy "own alerts select"
  on public.user_alerts
  for select
  to public
  using ((select auth.uid()) = user_id);

-- ---- subscriptions : "own subscription" (SELECT, role public) ---------------
-- prod: USING (lower(email) = lower(COALESCE(auth.jwt()->>'email', '')))
-- ⚠️ A tabela `subscriptions` NÃO tem coluna user_id (conferido em produção); a
--    correlação é só por e-mail (case-insensitive), idêntica ao gate my_plan().
--    Mantemos EXATAMENTE essa semântica — só içamos o auth.jwt().
drop policy if exists "own subscription" on public.subscriptions;
create policy "own subscription"
  on public.subscriptions
  for select
  to public
  using (lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', '')));

-- ---- profiles : self-or-admin (SELECT + UPDATE, role authenticated) ----------
-- prod SELECT:  USING ((auth.uid() = id) OR is_admin(auth.uid()))
-- prod UPDATE:  USING/WITH CHECK ((auth.uid() = id) OR is_admin(auth.uid()))
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
  on public.profiles
  for select
  to authenticated
  using (((select auth.uid()) = id) or is_admin((select auth.uid())));

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
  on public.profiles
  for update
  to authenticated
  using (((select auth.uid()) = id) or is_admin((select auth.uid())))
  with check (((select auth.uid()) = id) or is_admin((select auth.uid())));

-- ---- user_module_access : self-or-admin SELECT + admin-only IUD --------------
-- prod SELECT: USING ((auth.uid() = user_id) OR is_admin(auth.uid()))
-- prod INSERT: WITH CHECK (is_admin(auth.uid()))
-- prod UPDATE: USING/WITH CHECK (is_admin(auth.uid()))
-- prod DELETE: USING (is_admin(auth.uid()))
drop policy if exists "uma_select_self_or_admin" on public.user_module_access;
create policy "uma_select_self_or_admin"
  on public.user_module_access
  for select
  to authenticated
  using (((select auth.uid()) = user_id) or is_admin((select auth.uid())));

drop policy if exists "uma_insert_admin" on public.user_module_access;
create policy "uma_insert_admin"
  on public.user_module_access
  for insert
  to authenticated
  with check (is_admin((select auth.uid())));

drop policy if exists "uma_update_admin" on public.user_module_access;
create policy "uma_update_admin"
  on public.user_module_access
  for update
  to authenticated
  using (is_admin((select auth.uid())))
  with check (is_admin((select auth.uid())));

drop policy if exists "uma_delete_admin" on public.user_module_access;
create policy "uma_delete_admin"
  on public.user_module_access
  for delete
  to authenticated
  using (is_admin((select auth.uid())));

-- ---- entitlements : "entitlements_select_own" (SELECT, role authenticated) ---
-- prod: USING (account_id = auth.uid()::text)   [account_id é text → cast obrigatório]
drop policy if exists "entitlements_select_own" on public.entitlements;
create policy "entitlements_select_own"
  on public.entitlements
  for select
  to authenticated
  using (account_id = (select auth.uid())::text);

-- ---- usage_events : select_own + insert_own (role authenticated) -------------
-- prod SELECT:  USING (account_id = auth.uid()::text)
-- prod INSERT:  WITH CHECK (account_id = auth.uid()::text)
drop policy if exists "usage_events_select_own" on public.usage_events;
create policy "usage_events_select_own"
  on public.usage_events
  for select
  to authenticated
  using (account_id = (select auth.uid())::text);

drop policy if exists "usage_events_insert_own" on public.usage_events;
create policy "usage_events_insert_own"
  on public.usage_events
  for insert
  to authenticated
  with check (account_id = (select auth.uid())::text);

-- ---- alerts : select/insert/update/delete own (role authenticated) -----------
-- prod: account_id = auth.uid()::text  (USING e/ou WITH CHECK conforme o cmd)
drop policy if exists "alerts_select_own" on public.alerts;
create policy "alerts_select_own"
  on public.alerts
  for select
  to authenticated
  using (account_id = (select auth.uid())::text);

drop policy if exists "alerts_insert_own" on public.alerts;
create policy "alerts_insert_own"
  on public.alerts
  for insert
  to authenticated
  with check (account_id = (select auth.uid())::text);

drop policy if exists "alerts_update_own" on public.alerts;
create policy "alerts_update_own"
  on public.alerts
  for update
  to authenticated
  using (account_id = (select auth.uid())::text)
  with check (account_id = (select auth.uid())::text);

drop policy if exists "alerts_delete_own" on public.alerts;
create policy "alerts_delete_own"
  on public.alerts
  for delete
  to authenticated
  using (account_id = (select auth.uid())::text);

-- ---- alert_events : ownership via subquery em alerts (role authenticated) ----
-- prod SELECT/DELETE: USING (alert_id IN (SELECT id FROM alerts WHERE account_id = auth.uid()::text))
-- prod INSERT:        WITH CHECK (mesma subquery)
-- O auth.uid() içado vira constante; a subquery em alerts continua igual.
drop policy if exists "alert_events_select_own" on public.alert_events;
create policy "alert_events_select_own"
  on public.alert_events
  for select
  to authenticated
  using (
    alert_id in (
      select alerts.id from public.alerts
      where alerts.account_id = (select auth.uid())::text
    )
  );

drop policy if exists "alert_events_insert_own" on public.alert_events;
create policy "alert_events_insert_own"
  on public.alert_events
  for insert
  to authenticated
  with check (
    alert_id in (
      select alerts.id from public.alerts
      where alerts.account_id = (select auth.uid())::text
    )
  );

drop policy if exists "alert_events_delete_own" on public.alert_events;
create policy "alert_events_delete_own"
  on public.alert_events
  for delete
  to authenticated
  using (
    alert_id in (
      select alerts.id from public.alerts
      where alerts.account_id = (select auth.uid())::text
    )
  );

-- ---- dossiers : select/insert/update/delete own (role authenticated) ---------
-- prod: created_by = auth.uid()::text  (USING e/ou WITH CHECK conforme o cmd)
drop policy if exists "dossiers_select_own" on public.dossiers;
create policy "dossiers_select_own"
  on public.dossiers
  for select
  to authenticated
  using (created_by = (select auth.uid())::text);

drop policy if exists "dossiers_insert_own" on public.dossiers;
create policy "dossiers_insert_own"
  on public.dossiers
  for insert
  to authenticated
  with check (created_by = (select auth.uid())::text);

drop policy if exists "dossiers_update_own" on public.dossiers;
create policy "dossiers_update_own"
  on public.dossiers
  for update
  to authenticated
  using (created_by = (select auth.uid())::text)
  with check (created_by = (select auth.uid())::text);

drop policy if exists "dossiers_delete_own" on public.dossiers;
create policy "dossiers_delete_own"
  on public.dossiers
  for delete
  to authenticated
  using (created_by = (select auth.uid())::text);


-- #############################################################################
-- # SEÇÃO 2 — CONSOLIDAR POLICIES PERMISSIVAS DE `entities`                    #
-- #           (advisor: multiple_permissive_policies)                          #
-- #############################################################################
-- PROBLEMA: `entities` (a maior e mais consultada tabela — ~48k linhas hoje,
-- crescendo; 695 MB com o índice HNSW) tem HOJE 10 policies PERMISSIVAS de SELECT,
-- uma por kind público. RLS PERMISSIVA é "OR": para CADA linha varrida o Postgres
-- avalia TODAS as policies aplicáveis e faz OR dos resultados. São 10 checagens de
-- `kind = '...'` por linha. Consolidar em UMA só com `kind = ANY(ARRAY[...])`
-- reduz a 1 checagem por linha — ganho direto em todo SELECT público (listagens,
-- /app, busca, Cérebro) e elimina os 5 avisos multiple_permissive_policies
-- (anon, authenticated, authenticator, dashboard_user, supabase_privileged_role).
--
-- VISIBILIDADE PRESERVADA EXATAMENTE (conferido contra pg_policies em produção):
--   • As 10 policies atuais e seus predicados:
--       "Public auction lots are readable"            kind='auction_lot'            TO {anon,authenticated}
--       "Public bidding opportunities are readable"   kind='bidding_opportunity'    TO public
--       "Public contracts are readable"               kind='public_contract'        TO public
--       "Public environmental infractions are readable" kind='environmental_infraction' TO public
--       "Public legal processes are readable"         kind='legal_process'          TO public
--       "Public legal propositions are readable"      kind='legal_proposition'      TO public
--       "Public municipalities are readable"          kind='municipality'           TO public
--       "Public organizations are readable"           kind='organization'           TO public
--       "Public politicians are readable"             kind='politician'             TO public
--       "Public sanctions are readable"               kind='sanction'               TO public
--   • A nova policy é `TO public` (que JÁ inclui anon+authenticated, então cobre o
--     caso especial de auction_lot sem ampliar nada) e seu USING é a DISJUNÇÃO
--     exata dos 10 kinds. Resultado: o MESMO conjunto de linhas visível para os
--     MESMOS papéis. Nenhum kind novo é exposto; nenhum kind deixa de ser visível.
--   • kinds NÃO públicos (federal_transfer 32k, environmental_alert 14k,
--     fiscal_report 3k, company, e quaisquer futuros) continuam SEM policy de
--     SELECT para anon/authenticated → permanecem privados (lidos só via service_role
--     / RPCs SECURITY DEFINER). Comportamento idêntico ao atual.
--
-- ⚠️ SUPERFÍCIE DE EXPOSIÇÃO PÚBLICA: por tocar a leitura pública da tabela
--    central, esta seção deve passar pelo security-reviewer antes de aplicar (a
--    consolidação é provadamente lossless, mas a regra do projeto é revisar
--    qualquer mudança de RLS de exposição de dados).
-- -----------------------------------------------------------------------------

drop policy if exists "Public auction lots are readable"             on public.entities;
drop policy if exists "Public bidding opportunities are readable"    on public.entities;
drop policy if exists "Public contracts are readable"                on public.entities;
drop policy if exists "Public environmental infractions are readable" on public.entities;
drop policy if exists "Public legal processes are readable"          on public.entities;
drop policy if exists "Public legal propositions are readable"       on public.entities;
drop policy if exists "Public municipalities are readable"           on public.entities;
drop policy if exists "Public organizations are readable"            on public.entities;
drop policy if exists "Public politicians are readable"              on public.entities;
drop policy if exists "Public sanctions are readable"                on public.entities;

-- Uma única policy permissiva substituindo as 10. (select ...) não se aplica aqui:
-- o predicado é só sobre a coluna `kind`, sem funções auth.* — nada a içar.
drop policy if exists "Public entity kinds are readable" on public.entities;
create policy "Public entity kinds are readable"
  on public.entities
  for select
  to public
  using (
    kind = any (array[
      'auction_lot',
      'bidding_opportunity',
      'public_contract',
      'environmental_infraction',
      'legal_process',
      'legal_proposition',
      'municipality',
      'organization',
      'politician',
      'sanction'
    ]::text[])
  );


-- #############################################################################
-- # SEÇÃO 3 — AUTOVACUUM TUNING (alta churn de re-ingestão)                    #
-- #############################################################################
-- CONTEXTO/INCIDENTE: `entities` é re-ingerida com frequência pelos coletores
-- ingest_* (mesmas janelas, crons repetidos). Cada UPDATE/DELETE gera tupla morta
-- (MVCC). Com o DEFAULT autovacuum_vacuum_scale_factor=0.2, o autovacuum só dispara
-- após dead_tuples >= 0.2*reltuples + threshold. Para ~48k linhas (e crescendo)
-- isso é ~9,6k tuplas mortas acumuladas ANTES de qualquer limpeza — e o vacuum,
-- quando enfim roda numa tabela com índice HNSW (caro de varrer/atualizar) +
-- GIN(attributes) + GiST(geometry), fica longo e pesado. Resultado observado:
-- autovacuum não acompanha a churn → bloat (a tabela já está em 695 MB para 48k
-- linhas) e saturação. Conferido em produção: entities.reloptions = (none),
-- autovacuum_count = 0 (o autovacuum praticamente não rodou nesta tabela).
--
-- ESTRATÉGIA (Pro tem mais CPU/RAM, então pode varrer mais cedo e mais rápido):
--   • scale_factor BAIXO + threshold ABSOLUTO fixo → dispara cedo e em cadência
--     previsível, independente do tamanho (não "afrouxa" conforme a tabela cresce).
--   • cost_limit ALTO → o worker faz mais trabalho por ciclo antes de dormir
--     (o cost_delay default fatia o I/O; no Pro dá para ser mais agressivo).
--   • analyze também mais cedo → estatísticas frescas p/ o planner (importante com
--     filtros por kind e ON CONFLICT em índices parciais).
-- Valores escolhidos e por quê:
--   entities (grande, churn alta, índices caros):
--     vacuum_scale_factor   = 0.02  (~2%  → ~960 dead em 48k, vs ~9,6k no default)
--     vacuum_threshold      = 1000  (piso absoluto; evita varrer cedo demais quando vazia)
--     analyze_scale_factor  = 0.02
--     analyze_threshold     = 1000
--     vacuum_cost_limit     = 2000  (default global é 200; Pro aguenta ~10x → vacuum termina antes)
--     vacuum_cost_delay     = 2     (ms; menor que o default 2–20 → menos pausas)
-- Idempotente: ALTER TABLE ... SET sobrescreve o mesmo valor sem erro. Não bloqueia
-- (só atualiza catálogo); o efeito vale para os próximos ciclos de autovacuum.
-- -----------------------------------------------------------------------------

alter table public.entities set (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_vacuum_threshold     = 1000,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold    = 1000,
  autovacuum_vacuum_cost_limit    = 2000,
  autovacuum_vacuum_cost_delay    = 2
);

-- source_runs: 1 linha por execução de coletor (insert + update de status). Cresce
-- continuamente e cada run faz UPDATE (running→success/failed) → churn constante,
-- tabela pequena → vale disparar cedo para não bloatar o log de saúde das fontes.
alter table public.source_runs set (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_vacuum_threshold     = 100,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_analyze_threshold    = 100
);

-- ai_rate_limits: alta rotatividade (insert/upsert por janela + DELETE do prune a
-- cada hora). Tabela minúscula, mas o padrão insert→delete acumula tuplas mortas
-- rápido em proporção. scale_factor baixíssimo + threshold pequeno mantém enxuta.
alter table public.ai_rate_limits set (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_vacuum_threshold     = 50,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_analyze_threshold    = 50
);

-- ingest_cursors: poucas linhas, mas UPDATE a cada passo do driver (cron a cada
-- 1–3 min). Pequena; manter HOT/limpa com disparo cedo.
alter table public.ingest_cursors set (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_vacuum_threshold     = 25,
  autovacuum_analyze_scale_factor = 0.10,
  autovacuum_analyze_threshold    = 25
);


-- #############################################################################
-- # SEÇÃO 4 — pg_cron  (DOCUMENTAÇÃO — NÃO EXECUTAR NESTA MIGRATION)           #
-- #############################################################################
-- pg_cron 1.6.4 e pg_net 0.20.3 JÁ estão instalados. Os jobs de cron em produção
-- foram criados via MCP (não há cron.schedule versionado no repo). Esta seção
-- DOCUMENTA os comandos para deixar os dados se atualizarem sozinhos e o status
-- das fontes (página /sources, RPC source_health) honesto/verde. Ficam COMENTADOS:
-- NÃO queremos que `apply_migration` agende/altere jobs como efeito colateral —
-- agendamento é decisão operacional do dono (release-manager), executada à parte.
--
-- ESTADO ATUAL DOS JOBS (conferido em cron.job, 2026-06-21):
--   ATIVOS (active=true), manter:
--     stripe-sync-worker         */1 * * * *   (com trava de skip via Vault)
--     embed-entities-backfill    */3 * * * *   (backfill de embeddings, 100/exec)
--     prune-ai-rate-limits       7   * * * *   (JÁ agendado: select public.prune_ai_rate_limits())
--     driver-transferegov        */2 * * * *
--     driver-inpe-queimadas      */3 * * * *
--     driver-tesouro-siconfi     */3 * * * *
--     driver-migrate             */5 * * * *
--     catalogo-2x-dia            0 */6 * * *   (ingest-receita-catalog)
--   DESLIGADOS (active=false) — coletores parados (dados envelhecem, /sources fica
--   "stale"); reativar para manter o produto fresco:
--     ingest-receita-leiloes-6h            0 */6 * * *
--     licitacoes-pncp-2x-dia               0 9,21 * * *
--     ingest-pncp-contratos-1x-dia         0 5 * * *
--     sancoes-portal-transparencia-1x-dia  0 3 * * *
--     ingest-cnj-datajud-2x-dia            0 6,18 * * *
--
-- NOTA DE ARQUITETURA: nesta plataforma o cron NÃO chama as RPCs ingest_* direto
-- (elas recebem `p_payload jsonb` já coletado e não fazem fetch). O cron chama as
-- Edge Functions HTTP (que coletam da fonte e então invocam a RPC). Por isso os
-- comandos abaixo usam net.http_post para /functions/v1/<func>, com a anon key
-- (publishable, pública por design — mesma já usada nos jobs atuais). Os horários
-- são ESPAÇADOS (madrugada/horários distintos) para não concorrerem entre si nem
-- com embed-entities-backfill/stripe-sync.
--
-- prune_ai_rate_limits(): JÁ está agendado (job "prune-ai-rate-limits", 7 * * * *).
-- Nada a fazer; documentado aqui para o checklist.
--
-- ---- COMO REATIVAR (rodar manualmente no SQL editor / via MCP, NÃO aqui) -----
-- Opção A (preferida) — reaproveitar os jobs existentes, só (re)ativar:
--     UPDATE cron.job SET active = true
--      WHERE jobname IN (
--        'ingest-receita-leiloes-6h',
--        'licitacoes-pncp-2x-dia',
--        'ingest-pncp-contratos-1x-dia',
--        'sancoes-portal-transparencia-1x-dia',
--        'ingest-cnj-datajud-2x-dia'
--      );
--
-- Opção B — recriar via cron.schedule (upsert por nome no pg_cron 1.6). Trocar
-- <ANON_KEY> pela publishable/anon key do projeto. Exemplo (1 por coletor):
--
--   select cron.schedule(
--     'licitacoes-pncp-2x-dia', '0 9,21 * * *',
--     $$ select net.http_post(
--          url := 'https://pwiuiihsyazghdsrpshg.supabase.co/functions/v1/ingest-pncp?dias=2&maxPaginas=10',
--          headers := jsonb_build_object('Content-Type','application/json',
--                                        'Authorization','Bearer <ANON_KEY>'),
--          body := '{}'::jsonb); $$
--   );
--   select cron.schedule(
--     'ingest-pncp-contratos-1x-dia', '0 5 * * *',
--     $$ select net.http_post(
--          url := 'https://pwiuiihsyazghdsrpshg.supabase.co/functions/v1/ingest-pncp-contratos?dias=7&maxPaginas=10',
--          headers := jsonb_build_object('Content-Type','application/json',
--                                        'Authorization','Bearer <ANON_KEY>'),
--          body := '{}'::jsonb); $$
--   );
--   select cron.schedule(
--     'sancoes-portal-transparencia-1x-dia', '0 3 * * *',
--     $$ select net.http_post(
--          url := 'https://pwiuiihsyazghdsrpshg.supabase.co/functions/v1/ingest-portal-transparencia?maxPaginas=30',
--          headers := jsonb_build_object('Content-Type','application/json',
--                                        'Authorization','Bearer <ANON_KEY>'),
--          body := '{}'::jsonb); $$
--   );
--   select cron.schedule(
--     'ingest-cnj-datajud-2x-dia', '0 6,18 * * *',
--     $$ select net.http_post(
--          url := 'https://pwiuiihsyazghdsrpshg.supabase.co/functions/v1/ingest-cnj?dias=90&tribunais=tjsp,tjdft&maxPaginas=5&size=100',
--          headers := jsonb_build_object('Content-Type','application/json',
--                                        'Authorization','Bearer <ANON_KEY>'),
--          body := '{}'::jsonb); $$
--   );
--   select cron.schedule(
--     'ingest-receita-leiloes-6h', '0 */6 * * *',
--     $$ select net.http_post(
--          url := 'https://pwiuiihsyazghdsrpshg.supabase.co/functions/v1/ingest-receita-leiloes',
--          headers := jsonb_build_object('Content-Type','application/json',
--                                        'Authorization','Bearer <ANON_KEY>'),
--          body := '{}'::jsonb); $$
--   );
--
-- VERIFICAÇÃO pós-reativação:
--   select jobname, schedule, active from cron.job order by jobname;
--   select jobname, status, start_time, return_message
--     from cron.job_run_details order by start_time desc limit 20;
-- =============================================================================
