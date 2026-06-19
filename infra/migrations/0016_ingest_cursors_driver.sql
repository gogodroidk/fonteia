-- 0016_ingest_cursors_driver.sql
--
-- DRIVER DE CURSOR PARA INGESTÕES HISTÓRICAS
-- ============================================
-- Problema: os crons chamavam as Edge Functions com parâmetros fixos e não
-- avançavam o cursor entre chamadas, portanto o histórico nunca era varrido
-- por completo. Esta migração cria:
--
--   1. Tabela `public.ingest_cursors` — estado persistente de cada fonte.
--   2. Função `public.ingest_driver_step(p_source)` — um "passo de driver":
--      (a) RECONCILIA a resposta da chamada anterior (lê net._http_response,
--          extrai nextCursor, avança o cursor para a próxima unidade quando a
--          atual termina);
--      (b) DISPARA a próxima chamada via net.http_post.
--
-- Com um cron frequente (ex.: a cada 2 minutos) chamando
--   SELECT public.ingest_driver_step('<source>');
-- o sistema percorre TODO o histórico sozinho, sem intervenção manual.
--
-- IDEMPOTÊNCIA: cada entity tem um id que inclui o período (mês/ano, exercício,
-- módulo), portanto períodos distintos coexistem na tabela — nenhum dado é
-- sobrescrito entre períodos. Rodar o driver mais de uma vez sobre o mesmo
-- cursor apenas dispara um upsert sem efeito colateral nas RPCs de ingestão.
--
-- FONTES COBERTAS:
--   • inpe-queimadas   — cursor "YYYYMM:byteOffset", rolling window de N meses
--   • tesouro-siconfi  — cursor "EXERCICIO:offset", backfill até ano mínimo
--   • transferegov     — cursor "modulo:offset" (faf → ted → faf, idempotente)
--
-- NÃO cria cron jobs (o orquestrador faz isso após testar).
-- NÃO faz DROP de nada existente.
-- Tudo é idempotente (CREATE TABLE IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING,
-- CREATE OR REPLACE FUNCTION).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABELA DE ESTADO
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ingest_cursors (
  -- Identificador da fonte (chave natural legível, ex.: 'inpe-queimadas').
  source          text        PRIMARY KEY,

  -- Cursor atual, formato específico por fonte (ver seção FONTES no cabeçalho).
  -- NULL/'' significa "começa do início padrão desta fonte".
  cursor          text,

  -- ID da requisição HTTP pendente (net.http_post). NULL = nenhuma chamada
  -- em voo. O driver verifica esta coluna antes de disparar uma nova chamada,
  -- evitando chamadas sobrepostas ao mesmo endpoint.
  last_request_id bigint,

  -- Estado operacional do driver para esta fonte.
  -- 'idle'    = pronto para disparar (ou em idle inicial).
  -- 'pending' = chamada em voo, aguardando net._http_response.
  -- 'error'   = última chamada retornou erro; próximo passo fará retry.
  status          text        NOT NULL DEFAULT 'idle',

  -- Limite de backfill (semântica por fonte):
  --   inpe-queimadas : número de meses para trás (ex.: '24').
  --   tesouro-siconfi: ano de exercício mínimo (ex.: '2019').
  --   transferegov   : ignorado (ciclo faf→ted é perpétuo).
  floor_cfg       text        NOT NULL DEFAULT '',

  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ingest_cursors IS
  'Estado persistente do driver de cursor para cada fonte de ingestão. '
  'Mantém o cursor de retomada e o ID da requisição HTTP em voo.';

COMMENT ON COLUMN public.ingest_cursors.cursor IS
  'Posição atual do cursor, específica por fonte. '
  'inpe-queimadas: "YYYYMM:byteOffset". '
  'tesouro-siconfi: "EXERCICIO:offset". '
  'transferegov: "modulo:offset" (ex.: "faf:200").';

COMMENT ON COLUMN public.ingest_cursors.last_request_id IS
  'ID retornado por net.http_post da última chamada disparada. '
  'NULL indica que não há chamada em voo. O driver reconcilia este ID '
  'antes de disparar a próxima chamada.';

COMMENT ON COLUMN public.ingest_cursors.floor_cfg IS
  'Limite de backfill. Para inpe-queimadas: meses máximos para trás (ex.: "24"). '
  'Para tesouro-siconfi: exercício mínimo (ex.: "2019"). '
  'Para transferegov: ignorado.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. SEEDS DAS FONTES INICIAIS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.ingest_cursors (source, cursor, last_request_id, status, floor_cfg, updated_at)
VALUES
  -- INPE Queimadas: rolling window de 24 meses para trás. Cursor NULL =
  -- começa pelo mês corrente e vai recuando mês a mês.
  ('inpe-queimadas',   NULL, NULL, 'idle', '24',  now()),

  -- Tesouro SICONFI: backfill de exercícios a partir de 2024 regressando
  -- até 2019. Cursor NULL = começa em "2024:0".
  ('tesouro-siconfi',  NULL, NULL, 'idle', '2019', now()),

  -- Transferegov: ciclo perpétuo faf→ted→faf (upsert idempotente).
  -- Cursor NULL = começa em faf:0 por padrão da função.
  ('transferegov',     NULL, NULL, 'idle', '',     now()),

  -- migrate: sincroniza Supabase->D1 via d1-bridge/migrate, paginado por ?after=
  -- (cursor = lastId). Quando done=true, cursor volta a '' e recomeça a varredura
  -- completa no próximo ciclo (upsert idempotente — mantém o D1 sempre em dia).
  ('migrate',          NULL, NULL, 'idle', '',     now())

ON CONFLICT (source) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FUNÇÃO DRIVER
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ingest_driver_step(p_source text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  -- ── Constantes ──────────────────────────────────────────────────────────
  c_base_url  CONSTANT text := 'https://pwiuiihsyazghdsrpshg.supabase.co/functions/v1/';
  c_anon_key  CONSTANT text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3aXVpaWhzeWF6Z2hkc3Jwc2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNTg4ODQsImV4cCI6MjA5NjYzNDg4NH0.x4ywII88iQXj8OxtT_MO_WkYKMiuelIh1qwUh5vzvY8';
  -- Publishable key (PÚBLICA por design) usada como apikey no d1-bridge/migrate.
  c_publishable CONSTANT text := 'sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ';

  -- ── Estado da linha ──────────────────────────────────────────────────────
  v_row           public.ingest_cursors%ROWTYPE;
  v_cursor_before text;       -- cursor antes de qualquer avanço (para log)

  -- ── Reconciliação ────────────────────────────────────────────────────────
  v_resp_status   int;
  v_resp_content  text;
  v_resp_timedout boolean;
  v_resp_found    boolean := false;
  v_resp_json     jsonb;
  v_next_raw      text;       -- nextCursor tal como vem da Edge Function
  v_new_cursor    text;       -- cursor calculado após reconciliação

  -- ── Parsing do cursor (split_part) ───────────────────────────────────────
  -- inpe-queimadas: "YYYYMM:byteOffset"
  v_ym            text;       -- parte YYYYMM
  v_off_text      text;       -- parte offset (texto)
  v_off_int       bigint;     -- parte offset (inteiro)
  v_prev_date     date;       -- data do mês atual do cursor (para ADVANCE)
  v_new_ym        text;       -- YYYYMM do mês anterior (ADVANCE)
  v_floor_ym      text;       -- YYYYMM do floor calculado

  -- tesouro-siconfi: "EXERCICIO:offset"
  v_exe           int;        -- exercício (ano)
  v_exe_floor     int;        -- exercício mínimo (floor_cfg::int)

  -- ── Fire ─────────────────────────────────────────────────────────────────
  v_fire_url      text;
  v_headers       jsonb;
  v_req_id        bigint;

BEGIN
  -- ─────────────────────────────────────────────────────────────────────────
  -- PASSO 0: carrega e trava a linha de estado
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT * INTO v_row
    FROM public.ingest_cursors
   WHERE source = p_source
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok',     false,
      'source', p_source,
      'error',  'source not found in ingest_cursors'
    );
  END IF;

  v_cursor_before := v_row.cursor;

  -- ─────────────────────────────────────────────────────────────────────────
  -- PASSO 1: RECONCILE — verifica o resultado da chamada anterior
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_row.last_request_id IS NOT NULL THEN

    -- Tenta ler a resposta HTTP que o pg_net armazenou.
    -- net._http_response pode não ter a linha ainda se a chamada ainda está
    -- em voo — nesse caso, retorna imediatamente sem disparar nova chamada.
    BEGIN
      SELECT
        r.status_code,
        r.content,
        r.timed_out
      INTO
        v_resp_status,
        v_resp_content,
        v_resp_timedout
      FROM net._http_response r
      WHERE r.id = v_row.last_request_id;

      v_resp_found := FOUND;
    EXCEPTION WHEN OTHERS THEN
      -- net._http_response pode não existir no ambiente; tratamos
      -- de forma defensiva como "ainda pendente".
      v_resp_found := false;
    END;

    IF NOT v_resp_found THEN
      -- Chamada ainda em voo. Devolver 'pending' sem disparar nova.
      RETURN jsonb_build_object(
        'ok',         true,
        'source',     p_source,
        'state',      'pending',
        'request_id', v_row.last_request_id
      );
    END IF;

    -- Linha encontrada: zera last_request_id (independente do resultado)
    -- para que a próxima passagem dispare nova chamada.
    v_row.last_request_id := NULL;

    IF v_resp_status = 200 AND NOT COALESCE(v_resp_timedout, false) THEN
      -- ── Extrai nextCursor da resposta JSON ──────────────────────────────
      v_resp_json := NULL;
      v_next_raw  := NULL;

      BEGIN
        IF v_resp_content IS NOT NULL AND v_resp_content <> '' THEN
          v_resp_json := v_resp_content::jsonb;
          -- nextCursor pode ser string ("YYYYMM:off", "modulo:off") ou
          -- número (offset numérico, caso siconfi). O operador ->> sempre
          -- devolve texto (ou NULL), portanto é seguro aqui.
          v_next_raw := v_resp_json->>'nextCursor';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Corpo não é JSON válido: mantém cursor atual (retry).
        v_next_raw := NULL;
      END;

      -- ── Atualiza cursor conforme a fonte ────────────────────────────────
      IF p_source = 'inpe-queimadas' THEN
        -- Cursor formato "YYYYMM:byteOffset".
        IF v_next_raw IS NOT NULL AND v_next_raw <> '' THEN
          -- A Edge Function devolveu um nextCursor: o arquivo deste mês ainda
          -- tem dados. Usa o cursor diretamente.
          v_new_cursor := v_next_raw;
        ELSE
          -- nextCursor null → mês atual esgotado. ADVANCE: recua 1 mês.
          -- Pega o YYYYMM do cursor atual (ou mês corrente se NULL).
          v_ym := CASE
            WHEN v_cursor_before IS NOT NULL AND v_cursor_before <> ''
              THEN split_part(v_cursor_before, ':', 1)
            ELSE to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM')
          END;

          -- Data do 1º dia do mês atual do cursor (para subtrair 1 mês).
          v_prev_date := to_date(v_ym, 'YYYYMM') - INTERVAL '1 month';
          v_new_ym    := to_char(v_prev_date, 'YYYYMM');

          -- FLOOR: se o novo mês ficou antes da janela permitida, volta
          -- ao mês corrente (rolling window).
          v_floor_ym := to_char(
            now() AT TIME ZONE 'America/Sao_Paulo'
            - (COALESCE(NULLIF(v_row.floor_cfg, ''), '24') || ' months')::INTERVAL,
            'YYYYMM'
          );

          IF v_new_ym < v_floor_ym THEN
            -- Janela percorrida por completo: recomeça do mês corrente.
            v_new_ym := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM');
          END IF;

          v_new_cursor := v_new_ym || ':0';
        END IF;

      ELSIF p_source = 'tesouro-siconfi' THEN
        -- Cursor formato "EXERCICIO:offset".
        -- O nextCursor da função é um NÚMERO (offset) ou null.
        -- Extrai o exercício atual do cursor.
        v_ym  := CASE
          WHEN v_cursor_before IS NOT NULL AND v_cursor_before <> ''
            THEN split_part(v_cursor_before, ':', 1)
          ELSE '2024'
        END;
        v_exe := COALESCE(NULLIF(v_ym, '')::int, 2024);

        IF v_next_raw IS NOT NULL AND v_next_raw <> '' THEN
          -- Offset numérico para o mesmo exercício.
          v_new_cursor := v_exe::text || ':' || v_next_raw;
        ELSE
          -- Exercício atual esgotado. ADVANCE: exercício - 1.
          v_exe_floor := COALESCE(NULLIF(v_row.floor_cfg, '')::int, 2019);

          IF (v_exe - 1) < v_exe_floor THEN
            -- Backfill completo: recomeça em 2024 (ano mais recente).
            v_new_cursor := '2024:0';
          ELSE
            v_new_cursor := (v_exe - 1)::text || ':0';
          END IF;
        END IF;

      ELSIF p_source = 'transferegov' THEN
        -- Cursor formato "modulo:offset" (ex.: "faf:100").
        IF v_next_raw IS NOT NULL AND v_next_raw <> '' THEN
          -- Módulo ainda tem dados: usa o cursor recebido.
          v_new_cursor := v_next_raw;
        ELSE
          -- faf e ted foram esgotados (nextCursor null). ADVANCE: volta a
          -- "faf:0" para re-varrer com novos planos (upsert idempotente).
          v_new_cursor := 'faf:0';
        END IF;

      ELSIF p_source = 'migrate' THEN
        -- Resposta do /migrate: {"migrated":N,"lastId":"...","done":bool,...}.
        -- Não usa nextCursor; pagina por lastId enquanto done=false.
        IF COALESCE((v_resp_json->>'done')::boolean, false) THEN
          -- Varredura completa concluída: recomeça do início no próximo ciclo.
          v_new_cursor := '';
        ELSE
          -- Continua a partir do último id processado (?after=lastId).
          v_new_cursor := COALESCE(v_resp_json->>'lastId', '');
        END IF;

      ELSE
        -- Fonte desconhecida: mantém cursor sem modificação.
        v_new_cursor := v_cursor_before;
      END IF;

      -- Persiste o novo cursor.
      v_row.cursor := v_new_cursor;
      v_row.status := 'idle';

    ELSE
      -- Resposta com erro ou timeout: mantém cursor atual para retry.
      -- status já está como 'error' ou continuará 'idle' para o próximo passo.
      v_row.status := 'error';
    END IF;

    -- Grava o estado reconciliado (cursor + last_request_id=NULL + status)
    UPDATE public.ingest_cursors
       SET cursor          = v_row.cursor,
           last_request_id = NULL,
           status          = v_row.status,
           updated_at      = now()
     WHERE source = p_source;

  END IF; -- fim do bloco de reconciliação

  -- ─────────────────────────────────────────────────────────────────────────
  -- PASSO 2: FIRE — constrói a URL e dispara a próxima chamada
  -- ─────────────────────────────────────────────────────────────────────────

  -- Cursor a usar no fire (pode ter sido atualizado na reconciliação acima).
  -- Relê da tabela para garantir consistência após o UPDATE.
  SELECT cursor INTO v_row.cursor
    FROM public.ingest_cursors
   WHERE source = p_source;

  -- ── Monta a URL e os headers conforme a fonte ────────────────────────────
  -- Headers padrão: anon key no Authorization (as ingest-* têm verify_jwt=true).
  -- O 'migrate' sobrescreve com apikey publishable + Bearer MIGRATE_SECRET.
  v_headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || c_anon_key
  );

  IF p_source = 'inpe-queimadas' THEN
    -- Cursor "YYYYMM:byteOffset". Se NULL/'' usa mês corrente, offset 0.
    IF v_row.cursor IS NULL OR v_row.cursor = '' THEN
      v_ym       := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM');
      v_off_text := '0';
    ELSE
      v_ym       := split_part(v_row.cursor, ':', 1);
      v_off_text := split_part(v_row.cursor, ':', 2);
    END IF;
    -- Garante que offset é um inteiro válido (fallback 0).
    v_off_int := COALESCE(NULLIF(v_off_text, '')::bigint, 0);

    v_fire_url := c_base_url
      || 'ingest-inpe-queimadas'
      || '?anoMes='  || v_ym
      || '&offset='  || v_off_int::text
      || '&window=12000000';   -- 12 MB por invocação (cabe em ~150s)

  ELSIF p_source = 'tesouro-siconfi' THEN
    -- Cursor "EXERCICIO:offset". Se NULL/'' inicia em 2024:0.
    IF v_row.cursor IS NULL OR v_row.cursor = '' THEN
      v_ym       := '2024';
      v_off_text := '0';
    ELSE
      v_ym       := split_part(v_row.cursor, ':', 1);
      v_off_text := split_part(v_row.cursor, ':', 2);
    END IF;
    v_exe     := COALESCE(NULLIF(v_ym, '')::int, 2024);
    v_off_int := COALESCE(NULLIF(v_off_text, '')::bigint, 0);

    v_fire_url := c_base_url
      || 'ingest-tesouro-siconfi'
      || '?exercicio=' || v_exe::text
      || '&cursor='    || v_off_int::text
      || '&limit=20';          -- 20 entes por chamada (≤150s)

  ELSIF p_source = 'transferegov' THEN
    -- Cursor "modulo:offset" (ex.: "faf:200"). Se NULL/'': não passa cursor
    -- (a função começa em faf:0 por padrão).
    v_fire_url := c_base_url
      || 'ingest-transferegov'
      || '?maxPaginas=8&limit=50'
      || CASE
           WHEN v_row.cursor IS NOT NULL AND v_row.cursor <> ''
             THEN '&cursor=' || v_row.cursor
           ELSE ''
         END;

  ELSIF p_source = 'migrate' THEN
    -- Sincroniza Supabase->D1. Paginação por ?after=<lastId>. Sem cursor = início.
    v_fire_url := c_base_url || 'd1-bridge/migrate'
      || CASE WHEN v_row.cursor IS NOT NULL AND v_row.cursor <> ''
                THEN '?after=' || v_row.cursor
                ELSE '' END;
    -- d1-bridge/migrate é ADMIN: apikey publishable + Bearer MIGRATE_SECRET (Vault).
    v_headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        c_publishable,
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'MIGRATE_SECRET')
    );

  ELSE
    RETURN jsonb_build_object(
      'ok',     false,
      'source', p_source,
      'error',  'unsupported source — add URL rule to ingest_driver_step'
    );
  END IF;

  -- ── Dispara a chamada via pg_net ─────────────────────────────────────────
  -- net.http_post devolve o id da requisição assíncrona. A resposta ficará
  -- disponível em net._http_response quando o worker do pg_net concluir.
  SELECT net.http_post(
    url     := v_fire_url,
    headers := v_headers,
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  ) INTO v_req_id;

  -- ── Persiste o estado com a nova requisição em voo ───────────────────────
  UPDATE public.ingest_cursors
     SET last_request_id = v_req_id,
         status          = 'pending',
         updated_at      = now()
   WHERE source = p_source;

  -- ─────────────────────────────────────────────────────────────────────────
  -- PASSO 3: retorna manifest do que foi feito
  -- ─────────────────────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',          true,
    'source',      p_source,
    'state',       'fired',
    'cursor_used', v_cursor_before,     -- cursor ANTES do fire (para log/debug)
    'cursor_next', v_row.cursor,        -- cursor que SERÁ usado na próxima reconciliação
    'url',         v_fire_url,
    'request_id',  v_req_id
  );

END;
$$;

COMMENT ON FUNCTION public.ingest_driver_step(text) IS
  'Driver de cursor para ingestões históricas. '
  'Em cada chamada: (1) reconcilia a resposta HTTP anterior (extrai nextCursor, '
  'avança para a próxima unidade quando a atual termina), (2) dispara a próxima '
  'chamada via net.http_post. Invocar com um cron frequente (ex: a cada 2 min) '
  'para varrer todo o histórico automaticamente.';
