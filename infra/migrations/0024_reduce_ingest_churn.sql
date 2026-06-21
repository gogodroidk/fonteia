-- =============================================================================
-- 0024_reduce_ingest_churn.sql  —  Reduz CHURN de UPDATE nas RPCs de ingestão
--                                  mais quentes (tabela entities). NÃO aplicado.
-- =============================================================================
-- ⚠️  ESTA MIGRATION AINDA NÃO FOI APLICADA. Está versionada para revisão. Aplicar
--     via Supabase MCP apply_migration (name: 0024_reduce_ingest_churn) OU
--     `supabase db push`, DEPOIS de 0099/0013/0020/0022 (as versões canônicas das
--     RPCs que esta migration substitui).
--
-- PROBLEMA (causa raiz da saturação do autovacuum)
--   As RPCs ingest_* fazem, por item, um upsert na canônica `entities`:
--
--       INSERT INTO entities (...) VALUES (...)
--       ON CONFLICT ((external_ids->>'<chave>')) WHERE kind='<k>' ...
--       DO UPDATE SET <colunas> = EXCLUDED.<colunas>, updated_at = now();
--
--   O DO UPDATE roda SEMPRE que a chave já existe — mesmo quando NENHUMA coluna
--   mudou (re-ingestão da mesma janela, cron repetido, reprocessamento). Em
--   Postgres, todo UPDATE cria uma TUPLA MORTA (MVCC): a linha velha vira lixo a
--   ser recolhido pelo autovacuum. Com ~217k entidades re-ingeridas com
--   frequência, isso gera dead tuples em massa → autovacuum não acompanha →
--   bloat + saturação (o incidente observado). E ainda toca todo índice da linha
--   (inclui o HNSW de embedding da 0023, caríssimo de manter).
--
-- CORREÇÃO ("só atualiza se mudou")
--   Adiciona um predicado ao DO UPDATE comparando a linha existente (qualificada
--   pelo nome da tabela) com a proposta (EXCLUDED) via IS DISTINCT FROM, coluna a
--   coluna, exatamente nas colunas que cada RPC já escrevia. Se TODAS forem
--   iguais, o UPDATE NÃO ocorre — zero tupla morta, zero escrita de índice,
--   `updated_at` preservado (passa a significar "última vez que algo mudou de
--   fato", não "última vez que o cron rodou"). IS DISTINCT FROM trata NULL com
--   segurança (NULL IS DISTINCT FROM NULL = false; NULL vs valor = true), o que
--   importa para cnpj/ibge_code/colunas opcionais. attributes/external_ids são
--   JSONB e source_ids é text[]: IS DISTINCT FROM compara ambos por valor.
--
--   IMPORTANTE: o INSERT continua idempotente por chave natural (mesma cláusula
--   ON CONFLICT). Esta migration NÃO muda chaves, colunas, kinds, nem a lógica de
--   raw_records/evidence (que já preservam collected_at quando o hash não muda).
--   Só evita o UPDATE no-op de `entities`. Reaplicar é seguro (CREATE OR REPLACE).
--
--   Efeito colateral benigno: o RETURNING das RPCs não muda (continuam contando
--   v_count por item processado). source_runs.records_inserted permanece = itens
--   vistos; a métrica de "quantas linhas realmente mudaram" não era exposta antes
--   e segue não sendo — mantivemos o comportamento para não quebrar a página
--   /sources. (Quem quiser distinguir pode olhar updated_at, que agora é fiel.)
--
-- RPCs ALTERADAS (as 5 de MAIOR volume de entities neste produto) e por quê:
--   1. ingest_pncp_contratos  (kind 'public_contract')   — maior volume (contratos
--      federais reprocessados); guarda em name/normalized_name/cnpj/attributes/
--      source_ids.
--   2. ingest_pncp            (kind 'bidding_opportunity')— licitações reabertas a
--      cada coleta; guarda + ibge_code/external_ids.
--   3. ingest_sancoes         (kind 'sanction')           — Portal da Transparência
--      reprocessa o catálogo inteiro; guarda + external_ids.
--   4. ingest_cnj             (kind 'legal_process')      — DataJud reingere janelas
--      sobrepostas; guarda em name/normalized_name/attributes/source_ids.
--   5. ingest_brasilapi_cnpj  (kind 'company')            — cache de CNPJ reconsultado
--      (force/backfill); guarda + ibge_code/external_ids. (espelha o D1, que já é
--      INSERT OR REPLACE — sem MVCC lá).
--
-- DELIBERADAMENTE NÃO ALTERADAS nesta migration (baixo volume / append-mostly,
--   churn desprezível; manter o diff pequeno e revisável):
--   ingest_municipios, ingest_orgaos, ingest_politica, ingest_senado,
--   ingest_receita_*, ingest_inpi, ingest_juridico, ingest_ambiental,
--   ingest_sp_contratos, ingest_tce_sp, ingest_camara_* e os coletores da 0022
--   (senado_votacoes / terrabrasilis / mapbiomas_alerta / ana_hidroweb). O mesmo
--   padrão de guarda pode ser estendido a eles depois, se o volume justificar.
--
-- SEGURANÇA: cada função abaixo é reproduzida IDÊNTICA à versão canônica (mesma
--   assinatura, SECURITY DEFINER, search_path fixo 'public', mesmo corpo), com a
--   ÚNICA mudança sendo o predicado WHERE no DO UPDATE de `entities`. Os REVOKEs
--   já vigentes (0017/0099) permanecem válidos para estas funções (CREATE OR
--   REPLACE preserva grants); reafirmamos os REVOKEs ao final por garantia.
-- =============================================================================


-- =============================================================================
-- 1) ingest_pncp_contratos  (kind 'public_contract')  — maior volume
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
      updated_at       = now()
    -- "só atualiza se mudou": evita tupla morta quando nada mudou (anti-churn).
    WHERE entities.name            IS DISTINCT FROM EXCLUDED.name
       OR entities.normalized_name IS DISTINCT FROM EXCLUDED.normalized_name
       OR entities.cnpj            IS DISTINCT FROM EXCLUDED.cnpj
       OR entities.attributes      IS DISTINCT FROM EXCLUDED.attributes
       OR entities.source_ids      IS DISTINCT FROM EXCLUDED.source_ids;

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

revoke execute on function public.ingest_pncp_contratos(jsonb) from public, anon, authenticated;


-- =============================================================================
-- 2) ingest_pncp  (kind 'bidding_opportunity')
-- =============================================================================
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
                  source_ids = excluded.source_ids, updated_at = now()
    -- "só atualiza se mudou": evita tupla morta no re-processamento (anti-churn).
    where entities.name            is distinct from excluded.name
       or entities.normalized_name is distinct from excluded.normalized_name
       or entities.cnpj            is distinct from excluded.cnpj
       or entities.ibge_code       is distinct from excluded.ibge_code
       or entities.external_ids    is distinct from excluded.external_ids
       or entities.attributes      is distinct from excluded.attributes
       or entities.source_ids      is distinct from excluded.source_ids;

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

revoke execute on function public.ingest_pncp(jsonb) from public, anon, authenticated;


-- =============================================================================
-- 3) ingest_sancoes  (kind 'sanction')
-- =============================================================================
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
      updated_at     = now()
    -- "só atualiza se mudou": evita tupla morta quando o catálogo reprocessa
    -- sanções idênticas (anti-churn).
    where entities.name            is distinct from excluded.name
       or entities.normalized_name is distinct from excluded.normalized_name
       or entities.cnpj            is distinct from excluded.cnpj
       or entities.external_ids    is distinct from excluded.external_ids
       or entities.attributes      is distinct from excluded.attributes
       or entities.source_ids      is distinct from excluded.source_ids;

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

revoke execute on function public.ingest_sancoes(jsonb) from public, anon, authenticated;


-- =============================================================================
-- 4) ingest_cnj  (kind 'legal_process')
-- =============================================================================
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
          updated_at       = now()
    -- "só atualiza se mudou": janelas sobrepostas do DataJud não geram tupla
    -- morta quando o processo não mudou (anti-churn).
    WHERE entities.name            IS DISTINCT FROM EXCLUDED.name
       OR entities.normalized_name IS DISTINCT FROM EXCLUDED.normalized_name
       OR entities.attributes      IS DISTINCT FROM EXCLUDED.attributes
       OR entities.source_ids      IS DISTINCT FROM EXCLUDED.source_ids;

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

revoke execute on function public.ingest_cnj(jsonb) from public, anon, authenticated;


-- =============================================================================
-- 5) ingest_brasilapi_cnpj  (kind 'company')
--    Espelha o D1 (INSERT OR REPLACE, sem MVCC). Aqui evitamos a tupla morta no
--    Postgres quando o CNPJ é reconsultado (?force/backfill) sem mudança.
-- =============================================================================
create or replace function public.ingest_brasilapi_cnpj(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run_id     uuid;
  v_collected  timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count      int := 0;
  v_item       jsonb;
  v_cnpj       text;
  v_razao      text;
  v_fantasia   text;
  v_municipio  text;
  v_uf         text;
  v_situacao   text;
  v_ibge       text;
  v_source_url text;
  v_raw_id     uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values (
    'brasilapi',
    'running',
    coalesce(jsonb_array_length(p_payload->'items'), 0)
  )
  returning id into v_run_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    v_cnpj := coalesce(v_item->>'cnpj', v_item->>'id');
    if v_cnpj is null or v_cnpj = '' then continue; end if;

    v_razao     := coalesce(nullif(btrim(v_item->>'razaoSocial'), ''), 'Empresa nao identificada');
    v_fantasia  := coalesce(nullif(btrim(v_item->>'nomeFantasia'), ''), '');
    v_municipio := coalesce(v_item->>'municipio', '');
    v_uf        := coalesce(v_item->>'uf', '');
    v_situacao  := coalesce(v_item->>'situacaoCadastral', '');
    v_ibge      := coalesce(v_item->>'codigoIbge', '');
    v_source_url := 'https://brasilapi.com.br/api/cnpj/v1/' || v_cnpj;

    -- Upsert do raw record (idempotente por (source_id, external_id)).
    insert into raw_records (
      source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at
    )
    values (
      'brasilapi', v_run_id, v_source_url, v_cnpj,
      coalesce(v_item->'raw', v_item),
      'sha256:'||encode(digest((coalesce(v_item->'raw', v_item))::text, 'sha256'), 'hex'),
      v_collected
    )
    on conflict (source_id, external_id) where external_id is not null
    do update set
      source_run_id = excluded.source_run_id,
      payload       = excluded.payload,
      content_hash  = excluded.content_hash,
      -- Preserva collected_at quando o conteudo nao mudou (traceability).
      collected_at  = case
        when raw_records.content_hash != excluded.content_hash
          then excluded.collected_at
        else raw_records.collected_at
      end
    returning id into v_raw_id;

    -- Upsert da entidade canonica (kind='company').
    -- name = razaoSocial; cnpj = chave estavel de 14 digitos.
    -- normalized_name combina razaoSocial + nomeFantasia + municipio + uf (truncado em 500).
    -- ibge_code = codigoIbge para referencias geograficas.
    -- attributes = item completo incluindo cnaes, qsa, capitalSocial, simples, mei, etc.
    insert into entities (
      kind, name, normalized_name, cnpj, ibge_code, external_ids, attributes, source_ids
    )
    values (
      'company',
      left(v_razao, 300),
      left(lower(v_razao || ' ' || v_fantasia || ' ' || v_municipio || ' ' || v_uf), 500),
      v_cnpj,
      nullif(v_ibge, ''),
      jsonb_build_object('cnpj', v_cnpj),
      v_item,
      array['brasilapi']
    )
    on conflict (cnpj) where kind = 'company' and cnpj is not null
    do update set
      name            = excluded.name,
      normalized_name = excluded.normalized_name,
      ibge_code       = excluded.ibge_code,
      external_ids    = excluded.external_ids,
      attributes      = excluded.attributes,
      source_ids      = excluded.source_ids,
      updated_at      = now()
    -- "só atualiza se mudou": CNPJ reconsultado sem mudança não gera tupla morta
    -- (anti-churn). Os campos derivados (name/normalized_name) saem de attributes,
    -- então comparar attributes já cobriria-os; explicitamos todos por clareza.
    where entities.name            is distinct from excluded.name
       or entities.normalized_name is distinct from excluded.normalized_name
       or entities.ibge_code       is distinct from excluded.ibge_code
       or entities.external_ids    is distinct from excluded.external_ids
       or entities.attributes      is distinct from excluded.attributes
       or entities.source_ids      is distinct from excluded.source_ids;

    -- Upsert da evidencia (rastreabilidade da consulta a BrasilAPI).
    -- confidence = 0.85: fonte comunitaria confiavel, nao oficial direto da Receita.
    insert into evidence (
      kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence
    )
    values (
      'api_payload', 'brasilapi', v_source_url, v_collected, v_raw_id,
      left(
        v_razao ||
        coalesce(nullif(' (' || v_fantasia || ')', ' ()'), '') ||
        ' — CNPJ ' || v_cnpj ||
        ' — situacao: ' || coalesce(nullif(v_situacao, ''), 'nao informada'),
        500
      ),
      '$.cnpj',
      'sha256:'||encode(digest(v_item::text, 'sha256'), 'hex'),
      0.85
    )
    on conflict (raw_record_id, kind) where raw_record_id is not null
    do update set
      quote        = excluded.quote,
      content_hash = excluded.content_hash,
      confidence   = excluded.confidence,
      -- So avanca collected_at quando a evidencia mudou de fato.
      collected_at = case
        when evidence.content_hash != excluded.content_hash
          then excluded.collected_at
        else evidence.collected_at
      end;

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

-- Apenas service_role (Edge de ingestao) pode executar — a publishable key e
-- publica e nao pode injetar registros de empresas na base "oficial".
revoke execute on function public.ingest_brasilapi_cnpj(jsonb) from public, anon, authenticated;
