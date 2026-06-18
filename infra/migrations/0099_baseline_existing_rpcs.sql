-- =============================================================================
-- 0099_baseline_existing_rpcs.sql
-- =============================================================================
-- BASELINE das RPCs e funções que existiam APENAS em produção (criadas no SQL
-- Editor do Supabase) e NÃO estavam versionadas no repositório.
--
-- Gerado em: 2026-06-18 via Supabase MCP (pg_get_functiondef).
-- Projeto:   pwiuiihsyazghdsrpshg (Fonte.ia / Olli)
--
-- OBJETIVO: garantir que, se o banco cair ou precisar ser recriado a partir do
-- zero, todas as funções possam ser restauradas apenas aplicando as migrations
-- em ordem. Antes deste arquivo, uma queda de banco significava perda definitiva
-- de ~30 objetos de lógica de negócio.
--
-- INSTRUÇÕES DE APLICAÇÃO:
--   Todas as instruções são CREATE OR REPLACE → idempotentes; seguro rodar
--   em produção sem downtime.
--   Pré-requisitos: migrations 0001–0011 já aplicadas (tabelas existem).
--
-- CONTEÚDO:
--   Seção A — Funções de utilidade / auth (8 funções + 1 event trigger + 1 trigger)
--   Seção B — Funções de busca semântica / IA (3 funções)
--   Seção C — Funções de negócio / plano / alertas (6 funções)
--   Seção D — Ingestão de dados públicos (14 funções ingest_*)
--
-- NOTA SOBRE ingest_receita_lots e ingest_receita_catalog:
--   Essas duas funções já estão versionadas em 0003 e 0004. NÃO reincluídas aqui
--   para evitar conflito de versão. O REVOKE de 0003 está preservado.
-- =============================================================================


-- =============================================================================
-- SEÇÃO A — UTILITÁRIOS / AUTH
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A1. get_vault_secret
--     Lê um segredo do Vault (vault.decrypted_secrets) pelo nome.
--     search_path='' para evitar path injection ao acessar vault schema.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vault_secret(p_name text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ select decrypted_secret from vault.decrypted_secrets where name = p_name $function$;

-- ---------------------------------------------------------------------------
-- A2. is_admin
--     Verifica se um uid é admin via tabela profiles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$function$;

-- ---------------------------------------------------------------------------
-- A3. handle_new_user
--     Trigger function: após INSERT em auth.users, faz upsert em public.profiles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do update
    set email     = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = now();
  return new;
end;
$function$;

-- Trigger em auth.users → on_auth_user_created (idempotente via DROP IF EXISTS)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- A4. rls_auto_enable (event trigger function)
--     Ativa RLS automaticamente em qualquer CREATE TABLE no schema public.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Event trigger: ensure_rls (idempotente)
DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();

-- ---------------------------------------------------------------------------
-- A5. admin_entities_by_kind
--     Retorna contagem de entities por kind; só admin ou service_role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_entities_by_kind()
 RETURNS TABLE(kind text, count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.is_admin(auth.uid()) or current_setting('role', true) = 'service_role') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select e.kind, count(*)::bigint
    from public.entities e
    group by e.kind
    order by count(*) desc;
end;
$function$;

-- ---------------------------------------------------------------------------
-- A6. check_ai_rate_limit
--     Rate limiting por IP para endpoints de IA. Grava em ai_rate_limits.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(p_ip text, p_limit integer DEFAULT 30, p_window_seconds integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_window_start timestamptz;
  v_count        int;
  v_retry_after  int;
begin
  if p_ip is null or length(btrim(p_ip)) = 0 then
    p_ip := 'unknown';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  ) at time zone 'UTC';

  insert into public.ai_rate_limits (ip, window_start, count)
  values (p_ip, v_window_start, 1)
  on conflict (ip, window_start)
  do update set count = public.ai_rate_limits.count + 1
  returning count into v_count;

  v_retry_after := greatest(
    1,
    ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - now())))::int
  );

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'limit', p_limit,
    'retry_after', v_retry_after
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- A7. prune_ai_rate_limits
--     Remove entradas antigas de ai_rate_limits (mais de 1 hora). Chamada por cron.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_ai_rate_limits()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from public.ai_rate_limits
  where window_start < now() - interval '1 hour';
$function$;

-- ---------------------------------------------------------------------------
-- A8. external_lookup_spend_count / external_lookup_user_day_count
--     Contagens de uso para trava de gasto mensal (InfoSimples e similares).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.external_lookup_spend_count(p_provider text)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int
  from public.external_lookups
  where provider = p_provider
    and source = 'live'
    and fetched_at >= date_trunc('month', now());
$function$;

CREATE OR REPLACE FUNCTION public.external_lookup_user_day_count(p_provider text, p_user uuid)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int
  from public.external_lookups
  where provider = p_provider
    and source = 'live'
    and requested_by = p_user
    and fetched_at >= now() - interval '24 hours';
$function$;


-- =============================================================================
-- SEÇÃO B — BUSCA SEMÂNTICA / IA
-- =============================================================================

-- ---------------------------------------------------------------------------
-- B1. match_entities
--     Busca vetorial (cosine) de entities por query_embedding (vector(768)).
--     ATENÇÃO: A coluna entities.embedding é vector(768) em produção.
--     A migration 0001 declarou vector(1536) — divergência documentada em
--     docs/HARDENING.md. O código usa 768 e o banco tem 768. OK.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_entities(query_embedding vector, match_kind text DEFAULT NULL::text, match_count integer DEFAULT 10)
 RETURNS TABLE(id uuid, kind text, name text, attributes jsonb, score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id,
         e.kind,
         e.name,
         e.attributes,
         (1 - (e.embedding <=> query_embedding))::double precision AS score
  FROM public.entities e
  WHERE e.embedding IS NOT NULL
    AND (match_kind IS NULL OR e.kind = match_kind)
  ORDER BY e.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(COALESCE(match_count, 10), 1), 100);
$function$;

-- ---------------------------------------------------------------------------
-- B2. similar_entities
--     Retorna entities parecidas com p_entity_id por cosine sobre vector(768).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.similar_entities(p_entity_id uuid, p_count integer DEFAULT 6)
 RETURNS TABLE(id uuid, name text, attributes jsonb, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kind text;
  v_embedding vector(768);
begin
  select e.kind, e.embedding
    into v_kind, v_embedding
    from public.entities e
   where e.id = p_entity_id;

  if v_embedding is null then
    return;
  end if;

  return query
    select e.id, e.name, e.attributes,
           1 - (e.embedding <=> v_embedding) as score
      from public.entities e
     where e.kind = v_kind
       and e.embedding is not null
       and e.id <> p_entity_id
     order by e.embedding <=> v_embedding
     limit greatest(coalesce(p_count, 6), 0);
end;
$function$;

-- ---------------------------------------------------------------------------
-- B3. similar_entities_by_external
--     Wrapper de similar_entities que resolve a entity por external_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.similar_entities_by_external(p_kind text, p_external_key text, p_external_id text, p_count integer DEFAULT 6)
 RETURNS TABLE(id uuid, name text, attributes jsonb, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entity_id uuid;
begin
  select e.id
    into v_entity_id
    from public.entities e
   where e.kind = p_kind
     and e.external_ids ->> p_external_key = p_external_id
   limit 1;

  if v_entity_id is null then
    return;
  end if;

  return query
    select s.id, s.name, s.attributes, s.score
      from public.similar_entities(v_entity_id, p_count) s;
end;
$function$;


-- =============================================================================
-- SEÇÃO C — NEGÓCIO: PLANO / CUPONS / ALERTAS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- C1. my_plan
--     Retorna o plano atual do usuário autenticado (free/pro/trialing).
--     Consulta public.subscriptions e public.coupon_redemptions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_plan()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce((auth.jwt() ->> 'email'), ''));
  v_plan  text;
  v_status text;
  v_until timestamptz;
  v_trial timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('plan', 'free', 'status', 'anon', 'trial', false);
  end if;

  select plan_id, status, current_period_end
    into v_plan, v_status, v_until
  from public.subscriptions
  where lower(email) = v_email and status in ('active', 'trialing', 'past_due')
  order by current_period_end desc nulls last
  limit 1;

  select max(granted_until) into v_trial
  from public.coupon_redemptions
  where user_id = v_uid and granted_until > now();

  if (v_plan is null or v_plan = 'free') and v_trial is not null then
    return jsonb_build_object('plan', 'pro', 'status', 'trial', 'trial', true, 'until', v_trial);
  end if;

  return jsonb_build_object('plan', coalesce(v_plan, 'free'), 'status', coalesce(v_status, 'free'), 'trial', false, 'until', v_until);
end;
$function$;

-- ---------------------------------------------------------------------------
-- C2. my_trial
--     Retorna a data de expiração do trial mais longo ativo (cupons).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_trial()
 RETURNS timestamp with time zone
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select max(granted_until)
  from public.coupon_redemptions
  where user_id = auth.uid() and granted_until > now();
$function$;

-- ---------------------------------------------------------------------------
-- C3. redeem_coupon
--     Aplica um cupom de trial ao usuário autenticado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_coupon(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_coupon public.coupons%rowtype;
  v_existing public.coupon_redemptions%rowtype;
  v_until timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'login', 'message', 'Faça login para usar um cupom.');
  end if;
  if v_code = '' then
    return jsonb_build_object('ok', false, 'error', 'empty', 'message', 'Informe um código de cupom.');
  end if;

  select * into v_coupon from public.coupons where code = v_code for update;
  if not found or not v_coupon.active then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'message', 'Cupom inválido ou inativo.');
  end if;
  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired', 'message', 'Este cupom expirou.');
  end if;

  select * into v_existing from public.coupon_redemptions where code = v_code and user_id = v_uid;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'kind', v_coupon.kind,
                              'trial_days', v_coupon.trial_days, 'granted_until', v_existing.granted_until,
                              'message', 'Você já havia ativado este cupom.');
  end if;

  if v_coupon.max_redemptions is not null and v_coupon.redeemed_count >= v_coupon.max_redemptions then
    return jsonb_build_object('ok', false, 'error', 'exhausted', 'message', 'Este cupom já atingiu o limite de usos.');
  end if;

  v_until := now() + make_interval(days => v_coupon.trial_days);
  insert into public.coupon_redemptions (code, user_id, granted_until)
  values (v_code, v_uid, v_until);
  update public.coupons set redeemed_count = redeemed_count + 1 where code = v_code;

  return jsonb_build_object('ok', true, 'already', false, 'kind', v_coupon.kind,
                            'trial_days', v_coupon.trial_days, 'granted_until', v_until,
                            'message', 'Cupom ativado!');
end;
$function$;

-- ---------------------------------------------------------------------------
-- C4. create_alert / delete_alert / list_my_alerts
--     Gestão de alertas de leilão por usuário autenticado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_alert(p_lot_id text, p_lot_label text DEFAULT NULL::text, p_edital text DEFAULT NULL::text, p_deadline timestamp with time zone DEFAULT NULL::timestamp with time zone, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_email text := btrim(coalesce(p_email, ''));
  v_lot   text := btrim(coalesce(p_lot_id, ''));
  v_id    uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'login', 'message', 'Faça login para criar um alerta.');
  end if;
  if v_lot = '' then
    return jsonb_build_object('ok', false, 'error', 'lot_id_empty', 'message', 'Informe o ID do lote.');
  end if;
  if v_email = '' or v_email not like '%@%' then
    return jsonb_build_object('ok', false, 'error', 'email_invalid', 'message', 'Informe um e-mail válido.');
  end if;

  insert into public.user_alerts
    (user_id, lot_id, lot_label, edital, proposal_deadline, email, channel, status, notified_at)
  values
    (v_uid, v_lot, p_lot_label, p_edital, p_deadline, v_email, 'email', 'active', null)
  on conflict (user_id, lot_id) do update
    set lot_label         = excluded.lot_label,
        edital            = excluded.edital,
        proposal_deadline = excluded.proposal_deadline,
        email             = excluded.email,
        status            = 'active',
        notified_at       = null
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'message', 'Alerta criado! Você receberá um e-mail quando o prazo estiver chegando.');
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_alert(p_lot_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_lot   text := btrim(coalesce(p_lot_id, ''));
  v_count integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'login', 'message', 'Faça login para remover um alerta.');
  end if;
  delete from public.user_alerts where user_id = v_uid and lot_id = v_lot;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'deleted', v_count);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_alerts()
 RETURNS TABLE(id uuid, lot_id text, lot_label text, edital text, proposal_deadline timestamp with time zone, email text, channel text, status text, notified_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.id, a.lot_id, a.lot_label, a.edital, a.proposal_deadline,
         a.email, a.channel, a.status, a.notified_at, a.created_at
  from public.user_alerts a
  where a.user_id = auth.uid()
  order by a.proposal_deadline asc nulls last, a.created_at desc;
$function$;


-- =============================================================================
-- SEÇÃO D — INGESTÃO DE DADOS PÚBLICOS (ingest_*)
-- =============================================================================
-- NOTA: ingest_receita_lots e ingest_receita_catalog já estão em 0003/0004.
--       As funções abaixo foram criadas manualmente no SQL Editor e nunca
--       versionadas. Todas: SECURITY DEFINER, search_path='public'.
--       O REVOKE de anon/authenticated deve ser aplicado separadamente se
--       necessário — por convenção, toda ingest_* deve ser acessível APENAS
--       via service_role.
-- =============================================================================

-- Proteção preventiva: revogar EXECUTE de anon/authenticated em TODAS as ingest_*
-- (idempotente — se já revogado, não falha)
DO $$ DECLARE f text; BEGIN
  FOR f IN
    SELECT p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'ingest_%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(jsonb) FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.ingest_ambiental(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id uuid;
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count int := 0;
  v_item jsonb;
  v_id text;
  v_infrator text;
  v_uf text;
  v_tipo text;
  v_url text;
  v_raw_id uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values ('ibama-dados-abertos', 'running', coalesce(jsonb_array_length(p_payload->'items'), 0))
  returning id into v_run_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;
    v_infrator := coalesce(nullif(btrim(v_item->>'infrator'), ''), 'Infrator nao informado');
    v_uf := coalesce(v_item->>'uf', '');
    v_tipo := coalesce(nullif(btrim(v_item->>'tipoInfracao'), ''), 'Nao informado');
    v_url := 'https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao';

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values ('ibama-dados-abertos', v_run_id, v_url, v_id,
            coalesce(v_item->'raw', v_item),
            'md5:' || md5((coalesce(v_item->'raw', v_item))::text), v_collected)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash, collected_at = excluded.collected_at
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, cnpj, ibge_code, external_ids, attributes, source_ids)
    values ('environmental_infraction',
            left(v_infrator, 300),
            lower(left(v_infrator || ' ' || v_uf || ' ' || v_tipo, 500)),
            nullif(v_item->>'cpfCnpj', ''),
            nullif(v_item->>'codigoIbge', ''),
            jsonb_build_object('seqAutoInfracao', v_id),
            v_item,
            array['ibama-dados-abertos'])
    on conflict ((external_ids ->> 'seqAutoInfracao')) where kind = 'environmental_infraction' and external_ids ? 'seqAutoInfracao'
    do update set name = excluded.name, normalized_name = excluded.normalized_name,
                  cnpj = excluded.cnpj, ibge_code = excluded.ibge_code,
                  external_ids = excluded.external_ids, attributes = excluded.attributes,
                  source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', 'ibama-dados-abertos', v_url, v_collected, v_raw_id,
            left('Auto de infracao ' || v_id || ': ' || v_infrator || coalesce('/' || nullif(v_uf, ''), '') || ' — ' || v_tipo || '.', 500),
            '$[*]', 'md5:' || md5(v_item::text), 0.9)
    on conflict (raw_record_id, kind) where raw_record_id is not null
    do update set collected_at = excluded.collected_at, quote = excluded.quote,
                  content_hash = excluded.content_hash, confidence = excluded.confidence;

    v_count := v_count + 1;
  end loop;

  update source_runs set status = 'success', finished_at = now(), records_inserted = v_count where id = v_run_id;
  return v_count;
exception when others then
  update source_runs set status = 'failed', finished_at = now(), error_message = sqlerrm where id = v_run_id;
  raise;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_cnj(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id        uuid;
  v_collected     timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count         int  := 0;
  v_item          jsonb;
  v_numero        text;
  v_tribunal      text;
  v_grau          text;
  v_classe_nome   text;
  v_assunto_nome  text;
  v_name          text;
  v_norm          text;
  v_source_url    text;
  v_content_hash  text;
  v_raw_id        uuid;
  v_attrs         jsonb;
BEGIN
  INSERT INTO source_runs (source_id, status, records_seen)
  VALUES ('cnj-datajud', 'running',
          coalesce(jsonb_array_length(p_payload->'items'), 0))
  RETURNING id INTO v_run_id;

  FOR v_item IN
    SELECT * FROM jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  LOOP
    v_numero := v_item->>'numeroProcesso';
    IF v_numero IS NULL OR v_numero = '' THEN CONTINUE; END IF;

    v_tribunal     := coalesce(v_item->>'tribunal', '');
    v_grau         := coalesce(v_item->>'grau', '');
    v_classe_nome  := coalesce(v_item->'classe'->>'nome', '');
    v_assunto_nome := coalesce(
                        (v_item->'assuntos'->0)->>'nome',
                        '');

    -- name = "Classe - Tribunal/Grau (numeroProcesso)"
    v_name := left(
      trim(
        coalesce(nullif(v_classe_nome, ''), 'Processo') ||
        CASE WHEN v_tribunal <> '' THEN ' — ' || v_tribunal ELSE '' END ||
        CASE WHEN v_grau     <> '' THEN '/' || v_grau         ELSE '' END ||
        ' (' || v_numero || ')'
      ), 400);

    v_norm := lower(left(
      v_name || ' ' || v_assunto_nome,
      600));

    v_source_url := 'https://www.cnj.jus.br/sgt/consulta_publica_processo.php?numero_processo='
                    || v_numero;

    v_content_hash := 'md5:' || md5(v_item::text);

    -- raw_records (dedup by source_id + external_id = numeroProcesso)
    INSERT INTO raw_records
      (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    VALUES
      ('cnj-datajud', v_run_id, v_source_url, v_numero,
       v_item, v_content_hash, v_collected)
    ON CONFLICT (source_id, external_id)
      WHERE external_id IS NOT NULL
    DO UPDATE
      SET source_run_id  = EXCLUDED.source_run_id,
          payload        = EXCLUDED.payload,
          content_hash   = EXCLUDED.content_hash,
          collected_at   = EXCLUDED.collected_at
    RETURNING id INTO v_raw_id;

    -- Build attributes jsonb (omit movimentos to keep size down)
    v_attrs := jsonb_build_object(
      'tribunal',           v_tribunal,
      'grau',               v_grau,
      'classe',             v_item->'classe',
      'assuntos',           v_item->'assuntos',
      'orgaoJulgador',      v_item->'orgaoJulgador',
      'dataAjuizamento',    v_item->>'dataAjuizamento',
      'dataHoraUltimaAtualizacao', v_item->>'dataHoraUltimaAtualizacao',
      'formato',            v_item->'formato',
      'sistema',            v_item->'sistema',
      'nivelSigilo',        v_item->'nivelSigilo',
      'qtdMovimentos',      jsonb_array_length(coalesce(v_item->'movimentos','[]'::jsonb))
    );

    -- entities upsert keyed on numeroProcesso + kind = legal_process
    INSERT INTO entities
      (kind, name, normalized_name, external_ids, attributes, source_ids)
    VALUES
      ('legal_process', v_name, v_norm,
       jsonb_build_object('numeroProcesso', v_numero),
       v_attrs,
       ARRAY['cnj-datajud'])
    ON CONFLICT ( (external_ids ->> 'numeroProcesso') )
      WHERE kind = 'legal_process' AND external_ids ? 'numeroProcesso'
    DO UPDATE
      SET name             = EXCLUDED.name,
          normalized_name  = EXCLUDED.normalized_name,
          attributes       = EXCLUDED.attributes,
          source_ids       = EXCLUDED.source_ids,
          updated_at       = now();

    -- evidence (dedup by raw_record_id + kind)
    INSERT INTO evidence
      (kind, source_id, source_url, collected_at, raw_record_id,
       quote, path, content_hash, confidence)
    VALUES
      ('api_payload', 'cnj-datajud', v_source_url, v_collected, v_raw_id,
       left(v_classe_nome ||
            CASE WHEN v_tribunal <> '' THEN ' | ' || v_tribunal ELSE '' END ||
            CASE WHEN v_assunto_nome <> '' THEN ' | ' || v_assunto_nome ELSE '' END,
            500),
       '$._source',
       v_content_hash,
       0.9)
    ON CONFLICT (raw_record_id, kind)
      WHERE raw_record_id IS NOT NULL
    DO UPDATE
      SET collected_at   = EXCLUDED.collected_at,
          quote          = EXCLUDED.quote,
          content_hash   = EXCLUDED.content_hash,
          confidence     = EXCLUDED.confidence;

    v_count := v_count + 1;
  END LOOP;

  UPDATE source_runs
  SET status = 'success', finished_at = now(), records_inserted = v_count
  WHERE id = v_run_id;

  RETURN v_count;

EXCEPTION WHEN OTHERS THEN
  UPDATE source_runs
  SET status = 'failed', finished_at = now(), error_message = sqlerrm
  WHERE id = v_run_id;
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_juridico(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id uuid;
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count int := 0;
  v_item jsonb;
  v_id text;
  v_titulo text;
  v_tipo text;
  v_ementa text;
  v_url text;
  v_raw_id uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values ('camara-dados-abertos', 'running', coalesce(jsonb_array_length(p_payload->'items'), 0))
  returning id into v_run_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;
    v_tipo := coalesce(v_item->>'tipo', '');
    v_titulo := coalesce(nullif(btrim(v_item->>'titulo'), ''), 'Proposicao ' || v_id);
    v_ementa := coalesce(v_item->>'ementa', '');
    v_url := 'https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=' || v_id;

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values ('camara-dados-abertos', v_run_id, v_url, v_id,
            coalesce(v_item->'raw', v_item),
            'md5:' || md5((coalesce(v_item->'raw', v_item))::text), v_collected)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash, collected_at = excluded.collected_at
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, external_ids, attributes, source_ids)
    values ('legal_proposition',
            left(v_titulo, 300),
            lower(left(v_titulo || ' ' || v_ementa, 500)),
            jsonb_build_object('proposicaoId', v_id),
            v_item,
            array['camara-dados-abertos'])
    on conflict ((external_ids ->> 'proposicaoId')) where kind = 'legal_proposition' and external_ids ? 'proposicaoId'
    do update set name = excluded.name, normalized_name = excluded.normalized_name,
                  external_ids = excluded.external_ids, attributes = excluded.attributes,
                  source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', 'camara-dados-abertos', v_url, v_collected, v_raw_id,
            left(v_titulo || coalesce(' - ' || nullif(v_ementa, ''), '') || '.', 500),
            '$[*]', 'md5:' || md5(v_item::text), 0.95)
    on conflict (raw_record_id, kind) where raw_record_id is not null
    do update set collected_at = excluded.collected_at, quote = excluded.quote,
                  content_hash = excluded.content_hash, confidence = excluded.confidence;

    v_count := v_count + 1;
  end loop;

  update source_runs set status = 'success', finished_at = now(), records_inserted = v_count where id = v_run_id;
  return v_count;
exception when others then
  update source_runs set status = 'failed', finished_at = now(), error_message = sqlerrm where id = v_run_id;
  raise;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_municipios(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id uuid;
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count int := 0;
  v_item jsonb;
  v_id text;
  v_nome text;
  v_uf text;
  v_url text;
  v_raw_id uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values ('ibge-localidades', 'running', coalesce(jsonb_array_length(p_payload->'items'), 0))
  returning id into v_run_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;
    v_nome := coalesce(nullif(btrim(v_item->>'nome'), ''), 'Municipio ' || v_id);
    v_uf := coalesce(v_item->>'uf', '');
    v_url := 'https://www.ibge.gov.br/cidades-e-estados/' || lower(v_uf) || '.html';

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values ('ibge-localidades', v_run_id, v_url, v_id,
            coalesce(v_item->'raw', v_item),
            'md5:' || md5((coalesce(v_item->'raw', v_item))::text), v_collected)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash, collected_at = excluded.collected_at
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, ibge_code, external_ids, attributes, source_ids)
    values ('municipality',
            left(v_nome, 300),
            lower(left(v_nome || ' ' || v_uf, 500)),
            v_id,
            jsonb_build_object('codigoIbge', v_id),
            v_item,
            array['ibge-localidades'])
    on conflict ((external_ids ->> 'codigoIbge')) where kind = 'municipality' and external_ids ? 'codigoIbge'
    do update set name = excluded.name, normalized_name = excluded.normalized_name,
                  ibge_code = excluded.ibge_code,
                  external_ids = excluded.external_ids, attributes = excluded.attributes,
                  source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', 'ibge-localidades', v_url, v_collected, v_raw_id,
            left('Municipio ' || v_id || ': ' || v_nome || coalesce('/' || nullif(v_uf, ''), '') || '.', 500),
            '$[*]', 'md5:' || md5(v_item::text), 0.95)
    on conflict (raw_record_id, kind) where raw_record_id is not null
    do update set collected_at = excluded.collected_at, quote = excluded.quote,
                  content_hash = excluded.content_hash, confidence = excluded.confidence;

    v_count := v_count + 1;
  end loop;

  update source_runs set status = 'success', finished_at = now(), records_inserted = v_count where id = v_run_id;
  return v_count;
exception when others then
  update source_runs set status = 'failed', finished_at = now(), error_message = sqlerrm where id = v_run_id;
  raise;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_orgaos(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id uuid;
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count int := 0;
  v_item jsonb;
  v_id text;
  v_nome text;
  v_cnpj text;
  v_uf text;
  v_url text;
  v_raw_id uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values ('orgaos-publicos', 'running', coalesce(jsonb_array_length(p_payload->'items'), 0))
  returning id into v_run_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;
    v_nome := coalesce(nullif(btrim(v_item->>'nome'), ''), 'Orgao ' || v_id);
    v_cnpj := nullif(v_item->>'cnpj', '');
    v_uf := coalesce(v_item->>'uf', '');
    -- Link oficial: a licitação do órgão no PNCP (busca por CNPJ quando houver).
    v_url := case
      when v_cnpj is not null then 'https://pncp.gov.br/app/editais?q=' || v_cnpj
      else 'https://pncp.gov.br/app/editais?q=' || replace(v_nome, ' ', '+')
    end;

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values ('orgaos-publicos', v_run_id, v_url, v_id,
            coalesce(v_item->'raw', v_item),
            'md5:' || md5((coalesce(v_item->'raw', v_item))::text), v_collected)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash, collected_at = excluded.collected_at
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, cnpj, external_ids, attributes, source_ids)
    values ('organization',
            left(v_nome, 300),
            lower(left(v_nome || ' ' || v_uf, 500)),
            v_cnpj,
            jsonb_build_object('orgaoKey', v_id),
            v_item,
            array['orgaos-publicos'])
    on conflict ((external_ids ->> 'orgaoKey')) where kind = 'organization' and external_ids ? 'orgaoKey'
    do update set name = excluded.name, normalized_name = excluded.normalized_name,
                  cnpj = excluded.cnpj,
                  external_ids = excluded.external_ids, attributes = excluded.attributes,
                  source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', 'orgaos-publicos', v_url, v_collected, v_raw_id,
            left('Orgao publico: ' || v_nome || coalesce(' (' || v_cnpj || ')', '') || coalesce('/' || nullif(v_uf, ''), '') || '.', 500),
            '$', 'md5:' || md5(v_item::text), 0.9)
    on conflict (raw_record_id, kind) where raw_record_id is not null
    do update set collected_at = excluded.collected_at, quote = excluded.quote,
                  content_hash = excluded.content_hash, confidence = excluded.confidence;

    v_count := v_count + 1;
  end loop;

  update source_runs set status = 'success', finished_at = now(), records_inserted = v_count where id = v_run_id;
  return v_count;
exception when others then
  update source_runs set status = 'failed', finished_at = now(), error_message = sqlerrm where id = v_run_id;
  raise;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_pncp(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id uuid;
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count int := 0;
  v_item jsonb;
  v_id text;
  v_url text;
  v_objeto text;
  v_orgao text;
  v_modalidade text;
  v_raw_id uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values ('pncp-contratacoes', 'running', coalesce(jsonb_array_length(p_payload->'items'), 0))
  returning id into v_run_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;
    v_url := coalesce(nullif(v_item->>'sourceUrl', ''), 'https://pncp.gov.br/app/editais');
    v_objeto := coalesce(nullif(btrim(v_item->>'objeto'), ''), 'Licitacao ' || v_id);
    v_orgao := coalesce(nullif(btrim(v_item->>'orgao'), ''), 'Orgao nao informado');
    v_modalidade := coalesce(v_item->>'modalidade', '');

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values ('pncp-contratacoes', v_run_id, v_url, v_id,
            coalesce(v_item->'raw', v_item),
            'md5:' || md5((coalesce(v_item->'raw', v_item))::text), v_collected)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash, collected_at = excluded.collected_at
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, cnpj, ibge_code, external_ids, attributes, source_ids)
    values ('bidding_opportunity',
            left(v_objeto, 300),
            lower(left(v_objeto || ' ' || v_orgao || ' ' || v_modalidade, 500)),
            nullif(v_item->>'orgaoCnpj', ''),
            nullif(v_item->>'codigoIbge', ''),
            jsonb_build_object('numeroControlePNCP', v_id),
            v_item,
            array['pncp-contratacoes'])
    on conflict ((external_ids ->> 'numeroControlePNCP')) where kind = 'bidding_opportunity' and external_ids ? 'numeroControlePNCP'
    do update set name = excluded.name, normalized_name = excluded.normalized_name,
                  cnpj = excluded.cnpj, ibge_code = excluded.ibge_code,
                  external_ids = excluded.external_ids, attributes = excluded.attributes,
                  source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', 'pncp-contratacoes', v_url, v_collected, v_raw_id,
            left('Contratacao ' || v_id || ': ' || v_objeto || ' (' || v_orgao || ').', 500),
            '$.data[*]', 'md5:' || md5(v_item::text), 0.9)
    on conflict (raw_record_id, kind) where raw_record_id is not null
    do update set collected_at = excluded.collected_at, quote = excluded.quote,
                  content_hash = excluded.content_hash, confidence = excluded.confidence;

    v_count := v_count + 1;
  end loop;

  update source_runs set status = 'success', finished_at = now(), records_inserted = v_count where id = v_run_id;
  return v_count;
exception when others then
  update source_runs set status = 'failed', finished_at = now(), error_message = sqlerrm where id = v_run_id;
  raise;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_pncp_contratos(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id       uuid;
  v_collected    timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count        int := 0;
  v_item         jsonb;
  v_id           text;           -- numeroControlePNCP
  v_url          text;
  v_fornecedor   text;
  v_objeto       text;
  v_cnpj         text;
  v_raw_id       uuid;
  v_quote        text;
begin
  -- Cria source_run
  INSERT INTO source_runs (source_id, status, records_seen)
  VALUES ('pncp-contratos', 'running', coalesce(jsonb_array_length(p_payload->'items'), 0))
  RETURNING id INTO v_run_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  LOOP
    v_id := v_item->>'id';
    IF v_id IS NULL OR v_id = '' THEN CONTINUE; END IF;

    v_url        := coalesce(nullif(v_item->>'sourceUrl', ''), 'https://pncp.gov.br/app/contratos');
    v_fornecedor := coalesce(nullif(btrim(v_item->>'fornecedorNome'), ''), 'Fornecedor não informado');
    v_objeto     := coalesce(nullif(btrim(v_item->>'objeto'), ''), 'Contrato ' || v_id);
    -- CNPJ: só dígitos, só se for PJ (14 dígitos)
    v_cnpj       := regexp_replace(coalesce(v_item->>'fornecedorCnpj', ''), '\D', '', 'g');
    IF length(v_cnpj) <> 14 THEN v_cnpj := NULL; END IF;

    -- raw_records (dedup por source_id + external_id)
    INSERT INTO raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    VALUES (
      'pncp-contratos', v_run_id, v_url, v_id,
      coalesce(v_item->'raw', v_item),
      'md5:' || md5((coalesce(v_item->'raw', v_item))::text),
      v_collected
    )
    ON CONFLICT (source_id, external_id) WHERE external_id IS NOT NULL
    DO UPDATE SET
      source_run_id = EXCLUDED.source_run_id,
      payload       = EXCLUDED.payload,
      content_hash  = EXCLUDED.content_hash,
      collected_at  = EXCLUDED.collected_at
    RETURNING id INTO v_raw_id;

    -- entity: kind='public_contract', name = razão social do fornecedor
    INSERT INTO entities (kind, name, normalized_name, cnpj, external_ids, attributes, source_ids)
    VALUES (
      'public_contract',
      left(v_fornecedor, 300),
      lower(left(v_fornecedor || ' ' || v_objeto, 500)),
      v_cnpj,
      jsonb_build_object('numeroControlePNCP', v_id),
      v_item - 'raw',   -- tudo menos o campo raw (já está em raw_records)
      ARRAY['pncp-contratos']
    )
    ON CONFLICT ((external_ids ->> 'numeroControlePNCP'))
      WHERE kind = 'public_contract' AND external_ids ? 'numeroControlePNCP'
    DO UPDATE SET
      name             = EXCLUDED.name,
      normalized_name  = EXCLUDED.normalized_name,
      cnpj             = EXCLUDED.cnpj,
      attributes       = EXCLUDED.attributes,
      source_ids       = EXCLUDED.source_ids,
      updated_at       = now();

    -- evidence
    v_quote := left(
      v_fornecedor || ' | ' || v_objeto || ' | R$ ' ||
      coalesce(v_item->>'valorGlobal', '0'),
      500
    );

    INSERT INTO evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    VALUES (
      'api_payload', 'pncp-contratos', v_url, v_collected, v_raw_id,
      v_quote,
      '$.data[*]',
      'md5:' || md5(v_item::text),
      0.95
    )
    ON CONFLICT (raw_record_id, kind) WHERE raw_record_id IS NOT NULL
    DO UPDATE SET
      collected_at = EXCLUDED.collected_at,
      quote        = EXCLUDED.quote,
      content_hash = EXCLUDED.content_hash,
      confidence   = EXCLUDED.confidence;

    v_count := v_count + 1;
  END LOOP;

  UPDATE source_runs
  SET status = 'success', finished_at = now(), records_inserted = v_count
  WHERE id = v_run_id;

  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  UPDATE source_runs
  SET status = 'failed', finished_at = now(), error_message = sqlerrm
  WHERE id = v_run_id;
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_politica(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id uuid;
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count int := 0;
  v_item jsonb;
  v_id text;
  v_url text;
  v_nome text;
  v_partido text;
  v_uf text;
  v_raw_id uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values ('camara-dados-abertos', 'running', coalesce(jsonb_array_length(p_payload->'items'), 0))
  returning id into v_run_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;
    v_url := 'https://www.camara.leg.br/deputados/' || v_id;
    v_nome := coalesce(nullif(btrim(v_item->>'nome'), ''), 'Deputado ' || v_id);
    v_partido := coalesce(v_item->>'partido', '');
    v_uf := coalesce(v_item->>'uf', '');

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values ('camara-dados-abertos', v_run_id, v_url, v_id,
            coalesce(v_item->'raw', v_item),
            'md5:' || md5((coalesce(v_item->'raw', v_item))::text), v_collected)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash, collected_at = excluded.collected_at
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, external_ids, attributes, source_ids)
    values ('politician',
            left(v_nome, 300),
            lower(left(v_nome || ' ' || v_partido || ' ' || v_uf, 500)),
            jsonb_build_object('camaraId', v_id),
            v_item,
            array['camara-dados-abertos'])
    on conflict ((external_ids ->> 'camaraId')) where kind = 'politician' and external_ids ? 'camaraId'
    do update set name = excluded.name, normalized_name = excluded.normalized_name,
                  external_ids = excluded.external_ids, attributes = excluded.attributes,
                  source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', 'camara-dados-abertos', v_url, v_collected, v_raw_id,
            left('Deputado ' || v_id || ': ' || v_nome || ' (' || coalesce(nullif(v_partido, ''), 'sem partido') || '/' || coalesce(nullif(v_uf, ''), '--') || ').', 500),
            '$.dados[*]', 'md5:' || md5(v_item::text), 0.9)
    on conflict (raw_record_id, kind) where raw_record_id is not null
    do update set collected_at = excluded.collected_at, quote = excluded.quote,
                  content_hash = excluded.content_hash, confidence = excluded.confidence;

    v_count := v_count + 1;
  end loop;

  update source_runs set status = 'success', finished_at = now(), records_inserted = v_count where id = v_run_id;
  return v_count;
exception when others then
  update source_runs set status = 'failed', finished_at = now(), error_message = sqlerrm where id = v_run_id;
  raise;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_receita_catalog(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id      uuid;
  v_collected   timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count       int := 0;
  v_lot         jsonb;
  v_id          text;
  v_raw_id      uuid;
  v_url         text;
begin
  insert into source_runs (source_id, status, records_seen)
  values ('receita-leiloes-sle', 'running', coalesce(jsonb_array_length(p_payload->'lots'), 0))
  returning id into v_run_id;

  for v_lot in select * from jsonb_array_elements(p_payload->'lots')
  loop
    v_id  := v_lot->>'id';
    v_url := coalesce(v_lot->>'sourceUrl', 'https://www25.receita.fazenda.gov.br/sle-sociedade/portal');

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values (
      'receita-leiloes-sle', v_run_id, v_url, v_id,
      coalesce(v_lot->'raw', v_lot),
      'sha256:'||encode(digest((coalesce(v_lot->'raw', v_lot))::text, 'sha256'), 'hex'),
      v_collected
    )
    on conflict (source_id, external_id) where external_id is not null
    do update set
      source_run_id = excluded.source_run_id,
      payload       = excluded.payload,
      content_hash  = excluded.content_hash,
      collected_at  = case when raw_records.content_hash != excluded.content_hash then excluded.collected_at else raw_records.collected_at end
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, external_ids, attributes, source_ids)
    values (
      'auction_lot',
      'Lote '||(v_lot->>'displayNumber')||' - '||coalesce(v_lot->>'category', v_lot->>'city'),
      lower('lote '||(v_lot->>'displayNumber')||' '||coalesce(v_lot->>'category', '')||' '||coalesce(v_lot->>'city', '')),
      jsonb_build_object('receitaLotId', v_id, 'edital', v_lot->>'edital', 'edle', v_lot->>'edle'),
      v_lot,
      array['receita-leiloes-sle']
    )
    on conflict ((external_ids->>'receitaLotId')) where kind = 'auction_lot' and external_ids ? 'receitaLotId'
    do update set
      name = excluded.name, normalized_name = excluded.normalized_name,
      external_ids = excluded.external_ids, attributes = excluded.attributes,
      source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values (
      'api_payload', 'receita-leiloes-sle', v_url, v_collected, v_raw_id,
      'Lote '||(v_lot->>'displayNumber')||' do edital '||(v_lot->>'edital')||' (Receita Federal SLE).',
      '$.listaLotes[*]',
      'sha256:'||encode(digest(v_lot::text, 'sha256'), 'hex'),
      0.8
    )
    on conflict (raw_record_id, kind) where raw_record_id is not null
    do update set
      content_hash = excluded.content_hash, confidence = excluded.confidence, quote = excluded.quote,
      collected_at = case when evidence.content_hash != excluded.content_hash then excluded.collected_at else evidence.collected_at end;

    v_count := v_count + 1;
  end loop;

  update source_runs set status = 'success', finished_at = now(), records_inserted = v_count where id = v_run_id;
  return v_count;
exception when others then
  update source_runs set status = 'failed', finished_at = now(), error_message = sqlerrm where id = v_run_id;
  raise;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_receita_lots(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id uuid;
  v_collected text;
  v_count int := 0;
  d jsonb;
  v_edle text;
  v_lote text;
  v_id text;
  v_raw_id uuid;
  v_lot jsonb;
  v_deadline text;
  v_eligible jsonb;
  v_url text := 'https://www25.receita.fazenda.gov.br/sle-sociedade/api/portal/destaques';
begin
  v_collected := to_char((p_payload->>'agora')::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00';

  insert into source_runs (source_id, status, records_seen)
  values ('receita-leiloes-sle', 'running', coalesce(jsonb_array_length(p_payload->'destaques'),0))
  returning id into v_run_id;

  for d in select * from jsonb_array_elements(p_payload->'destaques')
  loop
    v_edle := d->>'edle';
    v_lote := d->>'lote';
    v_id := replace(v_edle, '/', '-') || '-' || v_lote;
    v_deadline := to_char((d->>'dtFimProposta')::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00';
    v_eligible := case when (d->>'permitePF')::boolean then '["pf","pj"]'::jsonb else '["pj"]'::jsonb end;

    v_lot := jsonb_build_object(
      'id', v_id,
      'sourceId', 'receita-leiloes-sle',
      'edital', d->>'edital',
      'edle', v_edle,
      'lotNumber', v_lote,
      'displayNumber', d->>'numero',
      'city', d->>'cidade',
      'agency', d->>'orgao',
      'minimumBidCents', round((d->>'valor')::numeric * 100),
      'proposalDeadline', v_deadline,
      'eligiblePersonTypes', v_eligible,
      'sourceUrl', v_url,
      'collectedAt', v_collected,
      'raw', d
    );
    if (d->>'imagemDestaque') is not null then
      v_lot := v_lot || jsonb_build_object('imageUrl', d->>'imagemDestaque');
    end if;

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values ('receita-leiloes-sle', v_run_id, v_url, v_id, d, 'md5:'||md5(d::text), v_collected::timestamptz)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash, collected_at = excluded.collected_at
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, external_ids, attributes, source_ids)
    values ('auction_lot',
            'Lote '||v_lote||' - '||(d->>'cidade'),
            lower('lote '||v_lote||' '||(d->>'cidade')),
            jsonb_build_object('receitaLotId', v_id, 'edital', d->>'edital', 'edle', v_edle),
            v_lot,
            array['receita-leiloes-sle'])
    on conflict ((external_ids->>'receitaLotId')) where kind = 'auction_lot' and external_ids ? 'receitaLotId'
    do update set name = excluded.name, normalized_name = excluded.normalized_name,
                  external_ids = excluded.external_ids, attributes = excluded.attributes,
                  source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', 'receita-leiloes-sle', v_url, v_collected::timestamptz, v_raw_id,
            'Lote '||v_lote||' coletado do Sistema de Leilao Eletronico da Receita Federal.',
            '$.destaques[*]', 'md5:'||md5(d::text), 0.78)
    on conflict (raw_record_id, kind) where raw_record_id is not null
    do update set collected_at = excluded.collected_at, quote = excluded.quote,
                  content_hash = excluded.content_hash, confidence = excluded.confidence;

    v_count := v_count + 1;
  end loop;

  update source_runs set status='success', finished_at=now(), records_inserted=v_count where id=v_run_id;
  return v_count;
exception when others then
  update source_runs set status='failed', finished_at=now(), error_message=sqlerrm where id=v_run_id;
  raise;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_sancoes(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id   uuid;
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count    int := 0;
  v_item     jsonb;
  v_id       text;
  v_origem   text;
  v_nome     text;
  v_tipo     text;
  v_cnpj     text;
  v_url      text;
  v_quote    text;
  v_raw_id   uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values ('portal-transparencia-api', 'running',
          coalesce(jsonb_array_length(p_payload->'items'), 0))
  returning id into v_run_id;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    v_id    := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;

    v_origem := coalesce(v_item->>'origem', 'DESCONHECIDA');
    v_nome   := coalesce(nullif(btrim(v_item->>'nome'), ''), 'Sancionado nao informado');
    v_tipo   := coalesce(nullif(btrim(v_item->>'tipoSancao'), ''), 'Nao informado');
    v_cnpj   := nullif(btrim(v_item->>'cnpj'), '');
    v_url    := coalesce(nullif(v_item->>'sourceUrl', ''),
                  'https://portaldatransparencia.gov.br/');

    -- raw_records (upsert por source_id + external_id único)
    insert into raw_records (
      source_id, source_run_id, source_url, external_id,
      payload, content_hash, collected_at
    )
    values (
      'portal-transparencia-api', v_run_id, v_url,
      v_origem || ':' || v_id,
      coalesce(v_item->'raw', v_item),
      'md5:' || md5((coalesce(v_item->'raw', v_item))::text),
      v_collected
    )
    on conflict (source_id, external_id) where external_id is not null
    do update set
      source_run_id = excluded.source_run_id,
      payload       = excluded.payload,
      content_hash  = excluded.content_hash,
      collected_at  = excluded.collected_at
    returning id into v_raw_id;

    -- entities (upsert por sancaoId parcial)
    insert into entities (
      kind, name, normalized_name, cnpj, external_ids, attributes, source_ids
    )
    values (
      'sanction',
      left(v_nome, 400),
      lower(left(v_nome, 500)),
      v_cnpj,
      jsonb_build_object('sancaoId', v_origem || ':' || v_id),
      v_item - 'raw',
      array['portal-transparencia-api']
    )
    on conflict ((external_ids ->> 'sancaoId'))
      where kind = 'sanction' and external_ids ? 'sancaoId'
    do update set
      name           = excluded.name,
      normalized_name= excluded.normalized_name,
      cnpj           = excluded.cnpj,
      external_ids   = excluded.external_ids,
      attributes     = excluded.attributes,
      source_ids     = excluded.source_ids,
      updated_at     = now();

    -- evidence
    v_quote := left(v_nome || ' — ' || v_tipo || ' (' || v_origem || ')', 500);
    insert into evidence (
      kind, source_id, source_url, collected_at,
      raw_record_id, quote, path, content_hash, confidence
    )
    values (
      'api_payload', 'portal-transparencia-api', v_url, v_collected,
      v_raw_id, v_quote, '$[*]',
      'md5:' || md5(v_item::text),
      0.95
    )
    on conflict (raw_record_id, kind) where raw_record_id is not null
    do update set
      collected_at = excluded.collected_at,
      quote        = excluded.quote,
      content_hash = excluded.content_hash,
      confidence   = excluded.confidence;

    v_count := v_count + 1;
  end loop;

  update source_runs
    set status = 'success', finished_at = now(), records_inserted = v_count
  where id = v_run_id;

  return v_count;

exception when others then
  update source_runs
    set status = 'failed', finished_at = now(), error_message = sqlerrm
  where id = v_run_id;
  raise;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_senado(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_run_id uuid;
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count int := 0;
  v_item jsonb;
  v_id text;
  v_url text;
  v_nome text;
  v_partido text;
  v_uf text;
  v_raw_id uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values ('senado-dados-abertos', 'running', coalesce(jsonb_array_length(p_payload->'items'), 0))
  returning id into v_run_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;
    v_url := coalesce(nullif(v_item->>'urlPagina', ''), 'https://www25.senado.leg.br/web/senadores/senador/-/perfil/' || v_id);
    v_nome := coalesce(nullif(btrim(v_item->>'nome'), ''), 'Senador ' || v_id);
    v_partido := coalesce(v_item->>'partido', '');
    v_uf := coalesce(v_item->>'uf', '');

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values ('senado-dados-abertos', v_run_id, v_url, v_id,
            coalesce(v_item->'raw', v_item),
            'md5:' || md5((coalesce(v_item->'raw', v_item))::text), v_collected)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash, collected_at = excluded.collected_at
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, external_ids, attributes, source_ids)
    values ('politician',
            left(v_nome, 300),
            lower(left(v_nome || ' ' || v_partido || ' ' || v_uf, 500)),
            jsonb_build_object('codigoSenado', v_id),
            v_item,
            array['senado-dados-abertos'])
    on conflict ((external_ids ->> 'codigoSenado')) where kind = 'politician' and external_ids ? 'codigoSenado'
    do update set name = excluded.name, normalized_name = excluded.normalized_name,
                  external_ids = excluded.external_ids, attributes = excluded.attributes,
                  source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', 'senado-dados-abertos', v_url, v_collected, v_raw_id,
            left(v_nome || ' — ' || coalesce(nullif(v_partido, ''), 'sem partido') || '/' || coalesce(nullif(v_uf, ''), '--'), 500),
            '$.ListaParlamentarEmExercicio.Parlamentares.Parlamentar[*]', 'md5:' || md5(v_item::text), 0.95)
    on conflict (raw_record_id, kind) where raw_record_id is not null
    do update set collected_at = excluded.collected_at, quote = excluded.quote,
                  content_hash = excluded.content_hash, confidence = excluded.confidence;

    v_count := v_count + 1;
  end loop;

  update source_runs set status = 'success', finished_at = now(), records_inserted = v_count where id = v_run_id;
  return v_count;
exception when others then
  update source_runs set status = 'failed', finished_at = now(), error_message = sqlerrm where id = v_run_id;
  raise;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_sp_contratos(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id     uuid;
  v_source     text := coalesce(nullif(p_payload->>'sourceId',''), 'sp-capital-contratos');
  v_collected  timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count      int := 0;
  v_item       jsonb;
  v_id         text;          -- spContractId (estável: resource_id + _id)
  v_url        text;
  v_fornecedor text;
  v_objeto     text;
  v_cnpj       text;
  v_raw_id     uuid;
  v_quote      text;
begin
  INSERT INTO source_runs (source_id, status, records_seen)
  VALUES (v_source, 'running', coalesce(jsonb_array_length(p_payload->'items'), 0))
  RETURNING id INTO v_run_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  LOOP
    v_id := v_item->>'id';
    IF v_id IS NULL OR v_id = '' THEN CONTINUE; END IF;

    v_url        := coalesce(nullif(v_item->>'sourceUrl',''), 'https://dados.prefeitura.sp.gov.br/dataset/base-de-compras-e-licitacoes');
    v_fornecedor := coalesce(nullif(btrim(v_item->>'fornecedorNome'),''), 'Fornecedor não informado');
    v_objeto     := coalesce(nullif(btrim(v_item->>'objeto'),''), 'Contrato ' || v_id);
    -- CNPJ: só dígitos, só PJ (14 dígitos); CPF (11) fica NULL.
    v_cnpj       := regexp_replace(coalesce(v_item->>'fornecedorCnpj',''), '\D', '', 'g');
    IF length(v_cnpj) <> 14 THEN v_cnpj := NULL; END IF;

    INSERT INTO raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    VALUES (
      v_source, v_run_id, v_url, v_id,
      coalesce(v_item->'raw', v_item),
      'md5:' || md5((coalesce(v_item->'raw', v_item))::text),
      v_collected
    )
    ON CONFLICT (source_id, external_id) WHERE external_id IS NOT NULL
    DO UPDATE SET
      source_run_id = EXCLUDED.source_run_id,
      payload       = EXCLUDED.payload,
      content_hash  = EXCLUDED.content_hash,
      collected_at  = EXCLUDED.collected_at
    RETURNING id INTO v_raw_id;

    INSERT INTO entities (kind, name, normalized_name, cnpj, external_ids, attributes, source_ids)
    VALUES (
      'public_contract',
      left(v_fornecedor, 300),
      lower(left(v_fornecedor || ' ' || v_objeto, 500)),
      v_cnpj,
      jsonb_build_object('spContractId', v_id),
      v_item - 'raw',
      ARRAY[v_source]
    )
    ON CONFLICT ((external_ids ->> 'spContractId'))
      WHERE kind = 'public_contract' AND external_ids ? 'spContractId'
    DO UPDATE SET
      name            = EXCLUDED.name,
      normalized_name = EXCLUDED.normalized_name,
      cnpj            = EXCLUDED.cnpj,
      attributes      = EXCLUDED.attributes,
      source_ids      = EXCLUDED.source_ids,
      updated_at      = now();

    v_quote := left(
      v_fornecedor || ' | ' || v_objeto || ' | R$ ' || coalesce(v_item->>'valorTexto', v_item->>'valorGlobal', '0'),
      500
    );

    INSERT INTO evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    VALUES (
      'api_payload', v_source, v_url, v_collected, v_raw_id,
      v_quote, '$.result.records[*]',
      'md5:' || md5(v_item::text), 0.9
    )
    ON CONFLICT (raw_record_id, kind) WHERE raw_record_id IS NOT NULL
    DO UPDATE SET
      collected_at = EXCLUDED.collected_at,
      quote        = EXCLUDED.quote,
      content_hash = EXCLUDED.content_hash,
      confidence   = EXCLUDED.confidence;

    v_count := v_count + 1;
  END LOOP;

  UPDATE source_runs
  SET status='success', finished_at=now(), records_inserted=v_count
  WHERE id = v_run_id;

  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  UPDATE source_runs SET status='failed', finished_at=now(), error_message=sqlerrm WHERE id = v_run_id;
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_tce_sp(p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id      uuid;
  v_source      text := 'tce-sp';
  v_collected   timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_slug        text := nullif(btrim(p_payload->>'municipioSlug'), '');
  v_ano         text := nullif(btrim(p_payload->>'ano'), '');
  v_mes         text := nullif(btrim(p_payload->>'mes'), '');
  v_count       int := 0;
  v_item        jsonb;
  v_id          text;          -- tceSpId estável: slug:ano:mes:nr_empenho
  v_url         text;
  v_fornecedor  text;
  v_objeto      text;
  v_cnpj        text;
  v_raw_id      uuid;
  v_quote       text;
  -- lookup IBGE (resolvido UMA vez por RPC; todos itens compartilham o mesmo municipio)
  v_ibge        text;
  v_muni_name   text;
  v_attrs       jsonb;
begin
  INSERT INTO source_runs (source_id, status, records_seen)
  VALUES (v_source, 'running', coalesce(jsonb_array_length(p_payload->'items'), 0))
  RETURNING id INTO v_run_id;

  -- Resolve slug -> ibge_code + nome IBGE proper (uma vez). Sem match: NULL, mas ingere igual.
  IF v_slug IS NOT NULL THEN
    SELECT e.ibge_code,
           initcap(regexp_replace(e.normalized_name, '\s+sp$', '', 'i'))
      INTO v_ibge, v_muni_name
    FROM entities e
    WHERE e.kind = 'municipality'
      AND e.ibge_code LIKE '35%'
      AND regexp_replace(
            translate(lower(e.normalized_name),
                      'áàâãäéèêëíìîïóòôõöúùûüç',
                      'aaaaaeeeeiiiiooooouuuuc'),
            '[^a-z0-9]+', '-', 'g'
          ) = v_slug || '-sp'
    LIMIT 1;
  END IF;

  v_url := 'https://transparencia.tce.sp.gov.br/api/json/despesas/'
           || coalesce(v_slug,'') || '/' || coalesce(v_ano,'') || '/' || coalesce(v_mes,'');

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  LOOP
    v_id := v_item->>'id';
    IF v_id IS NULL OR v_id = '' THEN CONTINUE; END IF;

    v_fornecedor := coalesce(nullif(btrim(v_item->>'fornecedorNome'),''), 'Fornecedor não informado');
    v_objeto     := coalesce(nullif(btrim(v_item->>'objeto'),''), 'Empenho ' || v_id);
    -- CNPJ: só dígitos, só PJ (14 dígitos); CPF/outros -> NULL.
    v_cnpj       := regexp_replace(coalesce(v_item->>'cnpj',''), '\D', '', 'g');
    IF length(v_cnpj) <> 14 THEN v_cnpj := NULL; END IF;

    -- attributes = item normalizado (sem 'raw'); injeta municipio/codigoIbge resolvidos no DB.
    v_attrs := (v_item - 'raw')
               || jsonb_build_object(
                    'municipio',   coalesce(v_muni_name, v_item->>'municipio', v_slug),
                    'codigoIbge',  v_ibge,
                    'sourceUrl',   v_url
                  );

    INSERT INTO raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    VALUES (
      v_source, v_run_id, v_url, v_id,
      coalesce(v_item->'raw', v_item),
      'md5:' || md5((coalesce(v_item->'raw', v_item))::text),
      v_collected
    )
    ON CONFLICT (source_id, external_id) WHERE external_id IS NOT NULL
    DO UPDATE SET
      source_run_id = EXCLUDED.source_run_id,
      payload       = EXCLUDED.payload,
      content_hash  = EXCLUDED.content_hash,
      collected_at  = EXCLUDED.collected_at
    RETURNING id INTO v_raw_id;

    INSERT INTO entities (kind, name, normalized_name, cnpj, external_ids, attributes, source_ids)
    VALUES (
      'public_contract',
      left(v_fornecedor, 300),
      lower(left(v_fornecedor || ' ' || v_objeto, 500)),
      v_cnpj,
      jsonb_build_object('tceSpId', v_id),
      v_attrs,
      ARRAY[v_source]
    )
    ON CONFLICT ((external_ids ->> 'tceSpId'))
      WHERE kind = 'public_contract' AND external_ids ? 'tceSpId'
    DO UPDATE SET
      name            = EXCLUDED.name,
      normalized_name = EXCLUDED.normalized_name,
      cnpj            = EXCLUDED.cnpj,
      attributes      = EXCLUDED.attributes,
      source_ids      = EXCLUDED.source_ids,
      updated_at      = now();

    v_quote := left(
      v_fornecedor || ' | ' || v_objeto || ' | R$ ' || coalesce(v_item->>'valorTexto', (v_item->>'valorGlobal'), '0'),
      500
    );

    INSERT INTO evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    VALUES (
      'api_payload', v_source, v_url, v_collected, v_raw_id,
      v_quote, '$[*]',
      'md5:' || md5(v_item::text), 0.9
    )
    ON CONFLICT (raw_record_id, kind) WHERE raw_record_id IS NOT NULL
    DO UPDATE SET
      collected_at = EXCLUDED.collected_at,
      quote        = EXCLUDED.quote,
      content_hash = EXCLUDED.content_hash,
      confidence   = EXCLUDED.confidence;

    v_count := v_count + 1;
  END LOOP;

  UPDATE source_runs
  SET status='success', finished_at=now(), records_inserted=v_count
  WHERE id = v_run_id;

  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  UPDATE source_runs SET status='failed', finished_at=now(), error_message=sqlerrm WHERE id = v_run_id;
  RAISE;
END;
$function$;
