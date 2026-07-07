-- =============================================================================
-- 0040_dossie_support.sql — suporte ao Raio-X 360° (dossiê por CNPJ)
-- =============================================================================
-- NÃO APLICADA AINDA (arquivo entregue para o release-manager revisar e aplicar
-- via Supabase MCP apply_migration). Idempotente (IF NOT EXISTS / CREATE OR REPLACE).
--
-- CONTEXTO: a tabela `dossiers` (0001_core_schema.sql) já existe, mas é um dossiê
-- PESSOAL do usuário — RLS por `created_by = auth.uid()::text` (0007_rls_policies.sql),
-- sem unique por CNPJ, com shape genérico (`sections jsonb[]`, `subject_entity_id`).
-- Ela NÃO serve como cache compartilhado do Raio-X 360°: o mesmo CNPJ consultado por
-- usuários diferentes precisa ser servido do MESMO cache (computed_at < 24h), e o
-- cache tem que ser gravável por service_role independente de qual usuário disparou
-- o cálculo. Por isso criamos `dossie_cache`, tabela nova e separada — não reaproveita
-- `dossiers` para não colidir com o RLS/shape já em uso por outra feature.
--
-- PRIVACIDADE: o payload cacheado é o RAIO-X COMPLETO (sem corte de gate). O corte
-- free/pro acontece SÓ na leitura, dentro da Edge Function `dossie` — nunca aqui.
-- =============================================================================

create table if not exists public.dossie_cache (
  id           uuid primary key default gen_random_uuid(),
  cnpj         text not null,
  payload      jsonb not null,
  computed_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- Unique por cnpj: upsert on conflict (cnpj) do update. Sem isto o upsert da Edge
-- Function não tem alvo de conflito e duplicaria linhas a cada recomputo.
create unique index if not exists idx_dossie_cache_cnpj_unique
  on public.dossie_cache (cnpj);

-- Leitura do cache é sempre por cnpj exato (ponto de entrada único da rota GET).
create index if not exists idx_dossie_cache_computed_at
  on public.dossie_cache (computed_at desc);

alter table public.dossie_cache enable row level security;

-- Nenhuma policy para anon/authenticated: o cache é infraestrutura interna da Edge
-- Function `dossie`, que sempre acessa via cliente service-role (bypassa RLS). Não
-- expomos leitura direta por PostgREST — a rota HTTP é a única porta de entrada, e
-- ela aplica o gate free/pro antes de responder.
revoke all on public.dossie_cache from anon, authenticated;
grant select, insert, update, delete on public.dossie_cache to service_role;

comment on table public.dossie_cache is
  'Cache compartilhado (24h) do payload COMPLETO do Raio-X 360° por CNPJ, usado pela '
  'Edge Function dossie. Sem RLS de usuário — acesso só via service_role. O corte de '
  'gate free/pro é aplicado na leitura pela Edge Function, nunca neste cache.';

-- Índice de suporte à busca de arremates por documento do arrematante — usado pela
-- seção "leiloes_arrematados" do Raio-X (JOIN auction_lot_history.winner_doc = cnpj).
-- Sem isto, a consulta faria seq scan em toda a tabela histórica a cada dossiê.
create index if not exists idx_auction_lot_history_winner_doc
  on public.auction_lot_history (winner_doc)
  where winner_doc is not null;
