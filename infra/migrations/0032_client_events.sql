-- =============================================================================
-- 0032_client_events.sql
--   Tabela de telemetria do front-end: erros de JS, sinais de UX e eventos de
--   observabilidade. LGPD: sem dados pessoais — só telemetria técnica.
-- =============================================================================
-- ⚠️  NÃO APLICADA AUTOMATICAMENTE. Versionada para revisão e decisão do dono.
--     Aplicar via Supabase MCP `apply_migration` (name: 0032_client_events)
--     ou `supabase db push`.
--
-- O QUE ESTA MIGRATION FAZ
--   1. Cria a tabela `public.client_events` (append-only, sem PII).
--   2. Cria política RLS de INSERT anônimo (qualquer usuário, incluindo anon,
--      pode inserir) — leitura restrita à role admin via service_role.
--   3. Cria índices para consultas do painel admin (by kind, by route, by ts).
--   4. Habilita TTL via pg_cron (opcional): deleta eventos > 90 dias para
--      manter o volume controlado. Comentado — ative se pg_cron estiver
--      disponível no projeto.
--
-- POSTURA LGPD
--   - Nenhuma coluna armazena dados pessoais (nome, e-mail, CPF, CNPJ de
--     usuário, conteúdo de forms, IP completo).
--   - `authed` é boolean: indica se havia sessão, sem identificar o usuário.
--   - `ua_hint` é resumo de browser/SO: "Chrome 124 / macOS" — não fingerprint.
--   - `message` é sanitizada no cliente antes de chegar aqui (PII redactado).
--   - A Edge Function `log-event` NÃO exige autenticação para inserir,
--     reduzindo surface de correlação.
--
-- CONTRATO PARA O PAINEL ADMIN (leitura futura)
--   Queries típicas:
--     • Erros recentes: SELECT * FROM client_events WHERE kind='js_error' ORDER BY server_ts DESC LIMIT 50
--     • Rotas com mais erros: SELECT route, count(*) FROM client_events WHERE kind IN ('js_error','boundary_error') GROUP BY route ORDER BY 2 DESC
--     • Buscas vazias por módulo: SELECT label, count(*) FROM client_events WHERE kind='empty_result' GROUP BY label ORDER BY 2 DESC
--     • Série temporal de erros: SELECT date_trunc('hour', server_ts), count(*) FROM client_events WHERE kind='js_error' GROUP BY 1 ORDER BY 1
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tabela principal
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tipo de evento (js_error | boundary_error | empty_result | module_error |
  --                  page_not_loaded | navigation | feature_use)
  kind         text        NOT NULL CHECK (char_length(kind) <= 64),

  -- Rota no momento do evento (pathname sem query-string)
  route        text        NOT NULL CHECK (char_length(route) <= 512),

  -- Mensagem técnica (stack resumido, sanitizado de PII)
  message      text        CHECK (char_length(message) <= 1000),

  -- Label de feature/módulo para aggregation (ex.: "lotes", "inpi", "busca-cnpj")
  label        text        CHECK (char_length(label) <= 128),

  -- Resumo de browser+SO sem fingerprinting (ex.: "Chrome 124 / macOS")
  ua_hint      text        CHECK (char_length(ua_hint) <= 128),

  -- Boolean: havia sessão autenticada? Sem identificar o usuário.
  authed       boolean     NOT NULL DEFAULT false,

  -- Timestamp gerado pelo cliente (pode ser ligeiramente defasado)
  client_ts    timestamptz NOT NULL DEFAULT now(),

  -- Timestamp autoritativo do servidor (gerado pela Edge Function ao inserir)
  server_ts    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_events IS
  'Telemetria do front-end: erros de JS, sinais de UX, eventos de observabilidade. Sem PII.';

-- ---------------------------------------------------------------------------
-- Índices para queries do painel admin
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_client_events_kind
  ON public.client_events (kind, server_ts DESC);

CREATE INDEX IF NOT EXISTS idx_client_events_route
  ON public.client_events (route, server_ts DESC);

CREATE INDEX IF NOT EXISTS idx_client_events_server_ts
  ON public.client_events (server_ts DESC);

CREATE INDEX IF NOT EXISTS idx_client_events_label
  ON public.client_events (label, server_ts DESC)
  WHERE label IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS: INSERT público anônimo + leitura exclusiva admin via service_role
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_events ENABLE ROW LEVEL SECURITY;

-- Permite que QUALQUER role (incluindo anon) insira eventos.
-- Sem isso o PostgREST bloquearia inserts sem sessão.
-- A Edge Function usa a anon key para inserir — seguro porque a tabela
-- não tem dados sensíveis e o RLS bloqueia SELECT para anon.
CREATE POLICY "insert_anon_client_events"
  ON public.client_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- SELECT: somente service_role (admin API) consegue ler.
-- O front nunca lê client_events diretamente.
-- Nota: service_role bypassa RLS por design; esta política cobre chamadas
-- via PostgREST com a chave service_role explícita.
CREATE POLICY "select_service_role_client_events"
  ON public.client_events
  FOR SELECT
  TO service_role
  USING (true);

-- Proíbe UPDATE e DELETE por qualquer role (tabela append-only).
-- A limpeza de dados antigos é feita via scheduled job (ver abaixo).
CREATE POLICY "no_update_client_events"
  ON public.client_events
  FOR UPDATE
  TO anon, authenticated
  USING (false);

CREATE POLICY "no_delete_client_events"
  ON public.client_events
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- TTL automático via pg_cron (opcional)
-- Descomente SOMENTE se pg_cron estiver habilitado no projeto Supabase.
-- ---------------------------------------------------------------------------
-- SELECT cron.schedule(
--   'client_events_ttl_90d',
--   '0 3 * * *',  -- 03:00 UTC diário
--   $$DELETE FROM public.client_events WHERE server_ts < now() - interval '90 days'$$
-- );
