-- 0020_ingest_rpcs_cnpj_alfanumerico.sql
--
-- MOTIVO: IN RFB 2.229/2026 — vigência 01/07/2026.
-- A partir dessa data os 12 primeiros dígitos do CNPJ passam a ser [0-9A-Z].
-- As RPCs de ingestão abaixo usavam:
--   regexp_replace(coalesce(<campo_cnpj>, ''), '\D', '', 'g')
-- que remove qualquer caractere não-dígito — apagando letras de CNPJs
-- alfanuméricos e truncando os 14 chars para menos de 14, fazendo o check
-- de comprimento zerar o campo (cnpj ficaria NULL para toda PJ alfanumérica).
--
-- SOLUÇÃO: trocar pelo helper public.sanitize_cnpj(text) criado em 0018, que
-- remove APENAS a máscara ([.\-/ ]) e faz UPPERCASE, preservando letras.
-- O check `IF length(v_cnpj) <> 14 THEN v_cnpj := NULL` permanece intacto:
-- ele continua válido para 14 caracteres alfanuméricos.
--
-- FONTE DAS DEFINIÇÕES VIGENTES (antes desta migration):
--   ingest_ckan          -> 0011_ingest_ckan.sql        (0099 não redefine)
--   ingest_siconfi       -> 0015_ingest_rpcs_fiscal_transfer_queimadas.sql (0099 não redefine)
--   ingest_transferegov  -> 0015_ingest_rpcs_fiscal_transfer_queimadas.sql (0099 não redefine)
--   ingest_pncp_contratos-> 0099_baseline_existing_rpcs.sql linha 1068
--   ingest_sp_contratos  -> 0099_baseline_existing_rpcs.sql linha 1608
--   ingest_tce_sp        -> 0099_baseline_existing_rpcs.sql linha 1711
--
-- NÃO APLICAR sem revisão de release-manager + security-reviewer.
-- Aplicação: Supabase MCP apply_migration.


-- =============================================================================
-- 1. public.ingest_ckan(jsonb)
--    Definição vigente: 0011_ingest_ckan.sql
--    Alteração: linha que atribuía v_cnpj via regexp_replace \D.
-- =============================================================================

create or replace function public.ingest_ckan(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run_id    uuid;
  v_source    text := coalesce(nullif(p_payload->>'sourceId',''), 'ckan');
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count     int := 0;
  v_item      jsonb;
  v_id        text;
  v_kind      text;
  v_name      text;
  v_cnpj      text;
  v_url       text;
  v_hash      text;
  v_raw_id    uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values (v_source, 'running', coalesce(jsonb_array_length(p_payload->'items'), 0))
  returning id into v_run_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb))
  loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;
    v_kind := nullif(btrim(v_item->>'kind'), '');
    if v_kind is null then continue; end if;
    v_name := coalesce(nullif(btrim(v_item->>'name'), ''), 'Registro ' || v_id);
    v_cnpj := public.sanitize_cnpj(coalesce(v_item->>'cnpj',''));
    if length(v_cnpj) <> 14 then v_cnpj := null; end if;
    v_url := coalesce(nullif(v_item->>'sourceUrl',''), 'https://dados.gov.br');
    v_hash := coalesce(nullif(v_item->>'contentHash',''), 'md5:' || md5((coalesce(v_item->'raw', v_item))::text));

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values (v_source, v_run_id, v_url, v_id, coalesce(v_item->'raw', v_item), v_hash, v_collected)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash, collected_at = excluded.collected_at
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, cnpj, external_ids, attributes, source_ids)
    values (
      v_kind,
      left(v_name, 300),
      lower(left(v_name, 500)),
      v_cnpj,
      coalesce(v_item->'externalIds', '{}'::jsonb) || jsonb_build_object('ckanId', v_id),
      coalesce(v_item->'attributes', v_item - 'raw'),
      array[v_source]
    )
    on conflict ((external_ids->>'ckanId')) where external_ids ? 'ckanId'
    do update set kind = excluded.kind, name = excluded.name, normalized_name = excluded.normalized_name,
                  cnpj = excluded.cnpj, attributes = excluded.attributes, source_ids = excluded.source_ids,
                  updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', v_source, v_url, v_collected, v_raw_id,
            left(v_name, 500), '$.result.records[*]', v_hash, 0.8)
    on conflict (raw_record_id, kind) where raw_record_id is not null
    do update set collected_at = excluded.collected_at, quote = excluded.quote,
                  content_hash = excluded.content_hash, confidence = excluded.confidence;

    v_count := v_count + 1;
  end loop;

  update source_runs set status='success', finished_at=now(), records_inserted=v_count where id = v_run_id;
  return v_count;
exception when others then
  update source_runs set status='failed', finished_at=now(), error_message=sqlerrm where id = v_run_id;
  raise;
end;
$function$;


-- =============================================================================
-- 2. public.ingest_siconfi(jsonb)
--    Definição vigente: 0015_ingest_rpcs_fiscal_transfer_queimadas.sql
--    Alteração: v_cnpj := nullif(regexp_replace(..., '\D', ...), '') ->
--               v_cnpj := nullif(public.sanitize_cnpj(coalesce(...,'')), '')
-- =============================================================================

create or replace function public.ingest_siconfi(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_item jsonb; v_n int := 0; v_id text; v_name text; v_cnpj text;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;
    v_name := coalesce(nullif(btrim(v_item->>'name'),''), 'Ente nao informado');
    v_cnpj := nullif(public.sanitize_cnpj(coalesce(v_item->>'cnpj','')), '');
    insert into public.entities (kind, name, normalized_name, cnpj, external_ids, attributes, source_ids)
    values ('fiscal_report', left(v_name,400), lower(left(v_name,500)), v_cnpj,
            jsonb_build_object('siconfiId', v_id), v_item - 'raw', array['tesouro-siconfi'])
    on conflict ((external_ids->>'siconfiId')) where kind='fiscal_report' and external_ids ? 'siconfiId'
    do update set name=excluded.name, normalized_name=excluded.normalized_name, cnpj=excluded.cnpj,
                  attributes=excluded.attributes, source_ids=excluded.source_ids, updated_at=now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;


-- =============================================================================
-- 3. public.ingest_transferegov(jsonb)
--    Definição vigente: 0015_ingest_rpcs_fiscal_transfer_queimadas.sql
--    Alteração: v_cnpj := nullif(regexp_replace(..., '\D', ...), '') ->
--               v_cnpj := nullif(public.sanitize_cnpj(coalesce(...,'')), '')
-- =============================================================================

create or replace function public.ingest_transferegov(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_item jsonb; v_n int := 0; v_id text; v_name text; v_cnpj text;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;
    v_name := coalesce(nullif(btrim(v_item->>'nome'),''), nullif(btrim(v_item->>'name'),''), 'Repasse federal');
    v_cnpj := nullif(public.sanitize_cnpj(coalesce(v_item->>'cnpj','')), '');
    insert into public.entities (kind, name, normalized_name, cnpj, external_ids, attributes, source_ids)
    values ('federal_transfer', left(v_name,400), lower(left(v_name,500)), v_cnpj,
            jsonb_build_object('transferegovId', v_id), v_item - 'raw', array['transferegov-dados-abertos'])
    on conflict ((external_ids->>'transferegovId')) where kind='federal_transfer' and external_ids ? 'transferegovId'
    do update set name=excluded.name, normalized_name=excluded.normalized_name, cnpj=excluded.cnpj,
                  attributes=excluded.attributes, source_ids=excluded.source_ids, updated_at=now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;


-- =============================================================================
-- 4. public.ingest_pncp_contratos(jsonb)
--    Definição vigente: 0099_baseline_existing_rpcs.sql linha 1068
--    Alteração: v_cnpj := regexp_replace(coalesce(v_item->>'fornecedorCnpj', ''), '\D', '', 'g') ->
--               v_cnpj := public.sanitize_cnpj(coalesce(v_item->>'fornecedorCnpj', ''))
-- =============================================================================

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
    -- CNPJ: preserva alfanumérico (IN RFB 2.229/2026); só PJ (14 chars).
    v_cnpj       := public.sanitize_cnpj(coalesce(v_item->>'fornecedorCnpj', ''));
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


-- =============================================================================
-- 5. public.ingest_sp_contratos(jsonb)
--    Definição vigente: 0099_baseline_existing_rpcs.sql linha 1608
--    Alteração: v_cnpj := regexp_replace(coalesce(v_item->>'fornecedorCnpj',''), '\D', '', 'g') ->
--               v_cnpj := public.sanitize_cnpj(coalesce(v_item->>'fornecedorCnpj',''))
-- =============================================================================

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
    -- CNPJ: preserva alfanumérico (IN RFB 2.229/2026); só PJ (14 chars); CPF (11) fica NULL.
    v_cnpj       := public.sanitize_cnpj(coalesce(v_item->>'fornecedorCnpj',''));
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


-- =============================================================================
-- 6. public.ingest_tce_sp(jsonb)
--    Definição vigente: 0099_baseline_existing_rpcs.sql linha 1711
--    Alteração: v_cnpj := regexp_replace(coalesce(v_item->>'cnpj',''), '\D', '', 'g') ->
--               v_cnpj := public.sanitize_cnpj(coalesce(v_item->>'cnpj',''))
-- =============================================================================

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
    -- CNPJ: preserva alfanumérico (IN RFB 2.229/2026); só PJ (14 chars); CPF/outros -> NULL.
    v_cnpj       := public.sanitize_cnpj(coalesce(v_item->>'cnpj',''));
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


-- =============================================================================
-- DEFESA EM PROFUNDIDADE — REVOKE / GRANT
-- Consistente com 0017_harden_revoke_definer_grants.sql e o bloco DO $$ de 0099.
-- Todas as funções acima devem ser executáveis APENAS por service_role.
-- =============================================================================

revoke execute on function public.ingest_ckan(jsonb)           from public, anon, authenticated;
revoke execute on function public.ingest_siconfi(jsonb)        from public, anon, authenticated;
revoke execute on function public.ingest_transferegov(jsonb)   from public, anon, authenticated;
revoke execute on function public.ingest_pncp_contratos(jsonb) from public, anon, authenticated;
revoke execute on function public.ingest_sp_contratos(jsonb)   from public, anon, authenticated;
revoke execute on function public.ingest_tce_sp(jsonb)         from public, anon, authenticated;

grant execute on function public.ingest_ckan(jsonb)           to service_role;
grant execute on function public.ingest_siconfi(jsonb)        to service_role;
grant execute on function public.ingest_transferegov(jsonb)   to service_role;
grant execute on function public.ingest_pncp_contratos(jsonb) to service_role;
grant execute on function public.ingest_sp_contratos(jsonb)   to service_role;
grant execute on function public.ingest_tce_sp(jsonb)         to service_role;
