-- =============================================================================
-- 0023_perf_indexes.sql  —  Índices de performance (NÃO aplicado ainda)
-- =============================================================================
-- Origem: docs/HARDENING.md (seção 6, item 1) e SAAS_PRODUCTION_AUDIT.md (linha
-- 98) + advisors de performance do Supabase. Versiona DOIS índices que hoje só
-- existem (ou deveriam existir) no banco real, mas não em nenhuma migration —
-- então uma recriação do banco do zero perderia a performance.
--
-- ⚠️  ESTA MIGRATION AINDA NÃO FOI APLICADA. Está versionada para revisão. Ao
--     aplicar, leia as NOTAS DE APLICAÇÃO de cada índice abaixo (o HNSW pode ser
--     pesado em tabela populada e merece janela/observação).
--
-- Tudo idempotente (IF NOT EXISTS): aplicar duas vezes é no-op; aplicar em um
-- banco que já tenha o índice (criado manualmente via MCP) também é no-op.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Índice vetorial HNSW em entities.embedding  (busca semântica / RAG)
-- -----------------------------------------------------------------------------
-- entities.embedding é VECTOR(768) (Gemini text-embedding-004 — ver 0001, linha
-- 84). As RPCs match_entities/similar_entities fazem ORDER BY embedding <=> $1
-- (distância de cosseno). SEM índice, cada busca é um full scan da tabela
-- (~milhares de lotes hoje, crescendo) → busca semântica lenta.
--
-- HNSW (graph-based) é o índice recomendado para pgvector >= 0.5.0: melhor
-- recall/latência que IVFFlat e não exige re-treino quando os dados crescem.
-- vector_cosine_ops casa com o operador <=> usado pelas RPCs (cosseno).
--
-- Pré-requisito: extensão `vector` já habilitada em 0001 (CREATE EXTENSION
-- IF NOT EXISTS vector). Mantemos a guarda aqui por segurança em recriações.
CREATE EXTENSION IF NOT EXISTS vector;

-- Parâmetros: m=16 e ef_construction=64 são os defaults do pgvector — equilíbrio
-- sólido entre tempo de build, uso de memória e recall. Não precisamos afinar
-- agora (volume moderado); subir ef_construction melhora recall ao custo de
-- build mais lento, se um dia o recall ficar aquém.
CREATE INDEX IF NOT EXISTS idx_entities_embedding_hnsw
  ON entities
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- NOTAS DE APLICAÇÃO (HNSW):
--   • Construir HNSW em tabela já populada consome CPU/memória e, do jeito
--     acima (dentro de transação, como o apply_migration faz), pega um lock que
--     bloqueia ESCRITAS em `entities` até terminar. Em produção, prefira rodar
--     FORA de transação e sem bloquear escritas, com a variante CONCURRENTLY:
--
--         CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entities_embedding_hnsw
--           ON entities USING hnsw (embedding vector_cosine_ops)
--           WITH (m = 16, ef_construction = 64);
--
--     CONCURRENTLY NÃO pode rodar dentro de bloco de transação — execute esse
--     comando avulso (psql/SQL editor), não via apply_migration. Por isso o
--     comando "padrão" acima fica sem CONCURRENTLY: serve para recriação de um
--     banco vazio (build instantâneo); em produção populada, use a variante.
--   • Opcional na sessão de busca: SET hnsw.ef_search = 40; (maior = mais recall,
--     um pouco mais lento). Default 40 já é razoável.


-- -----------------------------------------------------------------------------
-- 2. Índice de cobertura para a FK user_module_access.module_id
-- -----------------------------------------------------------------------------
-- Advisor de performance do Supabase aponta user_module_access.module_id como FK
-- SEM índice de cobertura (ver SAAS_PRODUCTION_AUDIT.md, linha 98). Sem índice no
-- lado "filho" da FK, toda checagem/cascata da FK e todo filtro por module_id faz
-- scan. A tabela hoje é legada/quase vazia (o gating real é por plano), então o
-- índice é barato e à prova de regressão — mas mantém o schema limpo de avisos e
-- correto caso a tabela volte a ser usada.
CREATE INDEX IF NOT EXISTS idx_user_module_access_module_id
  ON user_module_access (module_id);

-- NOTA: se este banco recriado do zero ainda não tiver a tabela
-- user_module_access (ela foi criada via MCP, não há CREATE TABLE versionado
-- dela em infra/migrations/), este CREATE INDEX falhará por tabela inexistente.
-- Aplicar APENAS em banco que já contenha a tabela (caso atual de produção).
-- Quando a definição da tabela for versionada, mover este índice para junto dela.
