-- =============================================================================
-- 0022_ingest_collectors_source_runs.sql
-- =============================================================================
-- RPCs SECURITY DEFINER + linhas em `sources` + índices únicos parciais para
-- QUATRO coletores novos, todos no MESMO padrão de public.ingest_camara_votacoes:
--   source_runs (running -> success/failed) + raw_records + entities + evidence,
--   tudo idempotente por upsert. É isto que a página /sources (RPC source_health)
--   lê para mostrar status honesto: sem run em source_runs, a fonte aparece
--   "sem coleta" — então cada coletor PRECISA de uma RPC que escreva source_runs.
--
-- COLETORES COBERTOS NESTA MIGRATION (Edge Functions em supabase/functions/):
--   • ingest-senado-votacoes  -> ingest_senado_votacoes  (kind 'legislative_vote')
--       Fonte: Senado — Dados Abertos, /plenario/lista/votacao/{ano}.json
--       source_id: 'senado-dados-abertos' (JÁ existe em 0001_core_schema.sql).
--   • ingest-inpe-terrabrasilis -> ingest_terrabrasilis  (kind 'environmental_area')
--       Fonte: INPE TerraBrasilis WFS (PRODES anual + DETER alertas).
--       source_id: 'inpe-terrabrasilis' (NOVO — inserido abaixo).
--   • ingest-mapbiomas-alerta -> ingest_mapbiomas_alerta (kind 'environmental_alert')
--       Fonte: MapBiomas Alerta GraphQL (alertas de desmatamento).
--       source_id: 'mapbiomas-alerta' (NOVO — inserido abaixo).
--       OBS: a coleta EXIGE credencial MapBiomas (Vault) que ainda não temos.
--       A RPC já existe para quando a credencial chegar; sem ela, o coletor
--       devolve erro honesto e nunca grava run de sucesso.
--   • ingest-ana-hidroweb     -> ingest_ana_hidroweb     (kind 'environmental_area')
--       Fonte: ANA / HidroWeb — estações da Rede Hidrometeorológica Nacional.
--       source_id: 'ana-hidroweb' (NOVO — inserido abaixo).
--
-- POR QUE INSERIR EM `sources` PRIMEIRO
--   source_runs.source_id, raw_records.source_id e evidence.source_id são FKs
--   para sources(id) (ver 0001_core_schema.sql). Sem a linha em `sources`, a
--   primeira escrita de run estoura FK. Os três source_ids novos são criados aqui
--   com ON CONFLICT DO UPDATE (idempotente). O 'senado-dados-abertos' já existe.
--
-- KINDS
--   entities.kind é TEXT sem CHECK — o projeto já usa kinds além da lista estrita
--   de packages/domain (ex.: 'legislative_vote', 'environmental_alert'). Aqui:
--     - votações  -> 'legislative_vote'  (idêntico a ingest_camara_votacoes)
--     - PRODES/DETER e estações ANA -> 'environmental_area' (EnvironmentalAreaEntity
--       do domínio, com areaType 'deforestation' | 'water_risk' em attributes)
--     - MapBiomas Alerta -> 'environmental_alert' (mesmo kind dos focos do INPE,
--       pois é um ALERTA pontual datado, não um polígono consolidado anual)
--
-- IDEMPOTÊNCIA
--   CREATE OR REPLACE + CREATE UNIQUE INDEX IF NOT EXISTS + ON CONFLICT DO UPDATE.
--   Seguro reaplicar. Rodar o coletor 2x não duplica (upsert por chave natural).
--
-- SEGURANÇA
--   Todas as RPCs: SECURITY DEFINER, search_path fixo 'public', e REVOKE EXECUTE
--   de public/anon/authenticated (só o service_role da Edge de ingestão grava na
--   base "oficial"; a publishable key é pública e não pode injetar dado forjado).
--
-- COMO APLICAR (NÃO aplicar como parte deste PR — etapa do dono):
--   Supabase MCP apply_migration (name: 0022_ingest_collectors_source_runs) OU
--   supabase db push. Requer migrations anteriores aplicadas.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Linhas novas em `sources` (FK de source_runs/raw_records/evidence).
-- 'senado-dados-abertos' NÃO está aqui: já existe em 0001_core_schema.sql.
-- ─────────────────────────────────────────────────────────────────────────────
insert into sources (
  id, name, owner, source_url, docs_url, status, access_kind,
  reliability, modules, refresh_cadence, commercial_risk, notes
)
values
  (
    'inpe-terrabrasilis',
    'INPE TerraBrasilis — PRODES & DETER (WFS)',
    'Instituto Nacional de Pesquisas Espaciais',
    'https://terrabrasilis.dpi.inpe.br/',
    'https://terrabrasilis.dpi.inpe.br/tag/wfs/',
    'integrating',
    'open',
    'official_stable',
    array['ambiental','municipios'],
    'daily',
    'low',
    'WFS público (geoserver/ows), sem autenticação. PRODES (desmatamento anual consolidado) e DETER (alertas quase em tempo real). Paginação por startIndex/count, outputFormat=application/json. Layers variam por bioma.'
  ),
  (
    'mapbiomas-alerta',
    'MapBiomas Alerta — Alertas de desmatamento',
    'MapBiomas',
    'https://plataforma.alerta.mapbiomas.org/',
    'https://plataforma.alerta.mapbiomas.org/api',
    'paid_or_credentialed',
    'credentialed',
    'complementary',
    array['ambiental'],
    'weekly',
    'medium',
    'API GraphQL (/api/v2/graphql). Atualização semanal. Consulta de alertas EXIGE login (mutation signIn -> token). Credencial MapBiomas ainda NÃO provisionada no Vault: coletor pronto, porém bloqueado até existir MAPBIOMAS_EMAIL/MAPBIOMAS_PASSWORD ou MAPBIOMAS_TOKEN.'
  ),
  (
    'ana-hidroweb',
    'ANA / HidroWeb — Rede Hidrometeorológica Nacional',
    'Agência Nacional de Águas e Saneamento Básico',
    'https://www.snirh.gov.br/hidroweb/',
    'https://www.snirh.gov.br/hidroweb/serieshistoricas',
    'fragile_operational',
    'open',
    'official_fragile',
    array['ambiental','municipios'],
    'daily',
    'low',
    'Web service legado SOAP (telemetriaws1.ana.gov.br/serviceana.asmx), aberto e sem chave, mas DESCONTINUADO — extensão final até 30/06/2026 em base secundária. O novo Hidro_Webservice REST EXIGE solicitar acesso por e-mail (hidro@ana.gov.br): credencial que ainda NÃO temos. Tratar como frágil; o coletor já tem scaffold do REST novo.'
  )
on conflict (id) do update set
  name            = excluded.name,
  owner           = excluded.owner,
  source_url      = excluded.source_url,
  docs_url        = excluded.docs_url,
  status          = excluded.status,
  access_kind     = excluded.access_kind,
  reliability     = excluded.reliability,
  modules         = excluded.modules,
  refresh_cadence = excluded.refresh_cadence,
  commercial_risk = excluded.commercial_risk,
  notes           = excluded.notes,
  updated_at      = now();

-- =============================================================================
-- 1) SENADO — VOTAÇÕES NOMINAIS  (kind 'legislative_vote')
--    Espelha ingest_camara_votacoes; chave estável = senadoVotacaoId.
--    Convive com as votações da Câmara (mesma kind, chave diferente).
-- =============================================================================
create unique index if not exists idx_entities_senado_votacao_unique
  on public.entities (((external_ids ->> 'senadoVotacaoId')))
  where kind = 'legislative_vote' and external_ids ? 'senadoVotacaoId';

create or replace function public.ingest_senado_votacoes(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run_id    uuid;
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count     int := 0;
  v_item      jsonb;
  v_id        text;
  v_desc      text;
  v_sigla     text;
  v_data      text;
  v_url       text;
  v_resultado text;
  v_quote     text;
  v_raw_id    uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values ('senado-dados-abertos', 'running',
          coalesce(jsonb_array_length(p_payload->'items'), 0))
  returning id into v_run_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb))
  loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;

    v_desc      := coalesce(v_item->>'descricao', 'Votação');
    v_sigla     := coalesce(v_item->>'siglaMateria', v_item->>'siglaCasa', 'Senado');
    v_data      := coalesce(v_item->>'data', '');
    v_resultado := nullif(v_item->>'resultado', '');
    v_url       := coalesce(
                     nullif(v_item->>'sourceUrl',''),
                     'https://legis.senado.leg.br/dadosabertos/plenario/votacao/' || v_id
                   );

    v_quote := left(
      v_sigla || ' — ' || v_desc
      || coalesce(' | Resultado: ' || v_resultado, '')
      || coalesce(' | Data: ' || nullif(v_data,''), ''),
      500
    );

    insert into raw_records (
      source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at
    )
    values (
      'senado-dados-abertos', v_run_id, v_url, v_id,
      coalesce(v_item->'raw', v_item),
      coalesce(nullif(v_item->>'contentHash',''),
               'sha256:'||encode(digest((coalesce(v_item->'raw', v_item))::text, 'sha256'), 'hex')),
      v_collected
    )
    on conflict (source_id, external_id) where external_id is not null
    do update set
      source_run_id = excluded.source_run_id,
      payload       = excluded.payload,
      content_hash  = excluded.content_hash,
      collected_at  = case
        when raw_records.content_hash != excluded.content_hash
          then excluded.collected_at
        else raw_records.collected_at
      end
    returning id into v_raw_id;

    insert into entities (
      kind, name, normalized_name, cnpj, external_ids, attributes, source_ids
    )
    values (
      'legislative_vote',
      left(v_sigla || ': ' || v_desc, 300),
      lower(left(v_desc || ' ' || v_sigla, 500)),
      null,
      jsonb_build_object(
        'senadoVotacaoId', v_id,
        'codigoSessao',    v_item->>'codigoSessao',
        'codigoMateria',   v_item->>'codigoMateria'
      ),
      coalesce(v_item->'attributes', v_item - 'raw'),
      array['senado-dados-abertos']
    )
    on conflict ((external_ids ->> 'senadoVotacaoId'))
      where kind = 'legislative_vote' and external_ids ? 'senadoVotacaoId'
    do update set
      name            = excluded.name,
      normalized_name = excluded.normalized_name,
      external_ids    = excluded.external_ids,
      attributes      = excluded.attributes,
      source_ids      = excluded.source_ids,
      updated_at      = now();

    insert into evidence (
      kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence
    )
    values (
      'api_payload', 'senado-dados-abertos', v_url, v_collected, v_raw_id,
      v_quote, '$.ListaVotacoes.Votacoes.Votacao[*]',
      'sha256:'||encode(digest((coalesce(v_item->'raw', v_item))::text, 'sha256'), 'hex'),
      0.95
    )
    on conflict (raw_record_id, kind) where raw_record_id is not null
    do update set
      quote        = excluded.quote,
      content_hash = excluded.content_hash,
      confidence   = excluded.confidence,
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

revoke execute on function public.ingest_senado_votacoes(jsonb) from public, anon, authenticated;

-- =============================================================================
-- 2) INPE TerraBrasilis — PRODES & DETER  (kind 'environmental_area')
--    Chave estável = terrabrasilisId ("<dataset>:<gid>"). attributes.areaType
--    = 'deforestation'. cnpj sempre null; ibge_code quando o layer trouxer.
-- =============================================================================
create unique index if not exists idx_entities_terrabrasilis_unique
  on public.entities (((external_ids ->> 'terrabrasilisId')))
  where kind = 'environmental_area' and external_ids ? 'terrabrasilisId';

create or replace function public.ingest_terrabrasilis(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run_id    uuid;
  v_source    text := 'inpe-terrabrasilis';
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count     int := 0;
  v_item      jsonb;
  v_id        text;
  v_name      text;
  v_ibge      text;
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
    v_name := coalesce(nullif(btrim(v_item->>'name'),''), 'Polígono de desmatamento ' || v_id);
    v_ibge := nullif(regexp_replace(coalesce(v_item->>'ibgeCode',''), '\D', '', 'g'), '');
    if v_ibge is not null and length(v_ibge) <> 7 then v_ibge := null; end if;
    v_url := coalesce(nullif(v_item->>'sourceUrl',''), 'https://terrabrasilis.dpi.inpe.br/');
    v_hash := coalesce(nullif(v_item->>'contentHash',''),
                       'sha256:'||encode(digest((coalesce(v_item->'raw', v_item))::text, 'sha256'), 'hex'));

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values (v_source, v_run_id, v_url, v_id, coalesce(v_item->'raw', v_item), v_hash, v_collected)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash,
                  collected_at = case
                    when raw_records.content_hash != excluded.content_hash
                      then excluded.collected_at else raw_records.collected_at end
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, cnpj, ibge_code, external_ids, attributes, source_ids)
    values (
      'environmental_area',
      left(v_name, 300),
      lower(left(v_name, 500)),
      null,
      v_ibge,
      coalesce(v_item->'externalIds','{}'::jsonb) || jsonb_build_object('terrabrasilisId', v_id),
      coalesce(v_item->'attributes', v_item - 'raw'),
      array[v_source]
    )
    on conflict ((external_ids->>'terrabrasilisId'))
      where kind = 'environmental_area' and external_ids ? 'terrabrasilisId'
    do update set kind = excluded.kind, name = excluded.name, normalized_name = excluded.normalized_name,
                  ibge_code = excluded.ibge_code, attributes = excluded.attributes,
                  source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', v_source, v_url, v_collected, v_raw_id,
            left(v_name, 500), '$.features[*]', v_hash, 0.9)
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

revoke execute on function public.ingest_terrabrasilis(jsonb) from public, anon, authenticated;

-- =============================================================================
-- 3) MapBiomas Alerta  (kind 'environmental_alert')
--    Chave estável = mapbiomasAlertId. cnpj sempre null; ibge_code quando vier.
--    COLETA BLOQUEADA por credencial MapBiomas (ver header) — a RPC existe para
--    quando a credencial chegar; sem ela o coletor nem chama esta função.
-- =============================================================================
create unique index if not exists idx_entities_mapbiomas_alerta_unique
  on public.entities (((external_ids ->> 'mapbiomasAlertId')))
  where kind = 'environmental_alert' and external_ids ? 'mapbiomasAlertId';

create or replace function public.ingest_mapbiomas_alerta(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run_id    uuid;
  v_source    text := 'mapbiomas-alerta';
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count     int := 0;
  v_item      jsonb;
  v_id        text;
  v_name      text;
  v_ibge      text;
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
    v_name := coalesce(nullif(btrim(v_item->>'name'),''), 'Alerta MapBiomas ' || v_id);
    v_ibge := nullif(regexp_replace(coalesce(v_item->>'ibgeCode',''), '\D', '', 'g'), '');
    if v_ibge is not null and length(v_ibge) <> 7 then v_ibge := null; end if;
    v_url := coalesce(nullif(v_item->>'sourceUrl',''), 'https://plataforma.alerta.mapbiomas.org/');
    v_hash := coalesce(nullif(v_item->>'contentHash',''),
                       'sha256:'||encode(digest((coalesce(v_item->'raw', v_item))::text, 'sha256'), 'hex'));

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values (v_source, v_run_id, v_url, v_id, coalesce(v_item->'raw', v_item), v_hash, v_collected)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash,
                  collected_at = case
                    when raw_records.content_hash != excluded.content_hash
                      then excluded.collected_at else raw_records.collected_at end
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, cnpj, ibge_code, external_ids, attributes, source_ids)
    values (
      'environmental_alert',
      left(v_name, 300),
      lower(left(v_name, 500)),
      null,
      v_ibge,
      coalesce(v_item->'externalIds','{}'::jsonb) || jsonb_build_object('mapbiomasAlertId', v_id),
      coalesce(v_item->'attributes', v_item - 'raw'),
      array[v_source]
    )
    on conflict ((external_ids->>'mapbiomasAlertId'))
      where kind = 'environmental_alert' and external_ids ? 'mapbiomasAlertId'
    do update set kind = excluded.kind, name = excluded.name, normalized_name = excluded.normalized_name,
                  ibge_code = excluded.ibge_code, attributes = excluded.attributes,
                  source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', v_source, v_url, v_collected, v_raw_id,
            left(v_name, 500), '$.data.alerts.collection[*]', v_hash, 0.85)
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

revoke execute on function public.ingest_mapbiomas_alerta(jsonb) from public, anon, authenticated;

-- =============================================================================
-- 4) ANA / HidroWeb — estações  (kind 'environmental_area', areaType 'water_risk')
--    Chave estável = anaEstacaoId (código da estação). cnpj null; ibge_code quando
--    a estação trouxer o município. Fonte frágil (SOAP legado sunset 30/06/2026).
-- =============================================================================
create unique index if not exists idx_entities_ana_hidroweb_unique
  on public.entities (((external_ids ->> 'anaEstacaoId')))
  where kind = 'environmental_area' and external_ids ? 'anaEstacaoId';

create or replace function public.ingest_ana_hidroweb(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run_id    uuid;
  v_source    text := 'ana-hidroweb';
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count     int := 0;
  v_item      jsonb;
  v_id        text;
  v_name      text;
  v_ibge      text;
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
    v_name := coalesce(nullif(btrim(v_item->>'name'),''), 'Estação ANA ' || v_id);
    v_ibge := nullif(regexp_replace(coalesce(v_item->>'ibgeCode',''), '\D', '', 'g'), '');
    if v_ibge is not null and length(v_ibge) <> 7 then v_ibge := null; end if;
    v_url := coalesce(nullif(v_item->>'sourceUrl',''), 'https://www.snirh.gov.br/hidroweb/');
    v_hash := coalesce(nullif(v_item->>'contentHash',''),
                       'sha256:'||encode(digest((coalesce(v_item->'raw', v_item))::text, 'sha256'), 'hex'));

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values (v_source, v_run_id, v_url, v_id, coalesce(v_item->'raw', v_item), v_hash, v_collected)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash,
                  collected_at = case
                    when raw_records.content_hash != excluded.content_hash
                      then excluded.collected_at else raw_records.collected_at end
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, cnpj, ibge_code, external_ids, attributes, source_ids)
    values (
      'environmental_area',
      left(v_name, 300),
      lower(left(v_name, 500)),
      null,
      v_ibge,
      coalesce(v_item->'externalIds','{}'::jsonb) || jsonb_build_object('anaEstacaoId', v_id),
      coalesce(v_item->'attributes', v_item - 'raw'),
      array[v_source]
    )
    on conflict ((external_ids->>'anaEstacaoId'))
      where kind = 'environmental_area' and external_ids ? 'anaEstacaoId'
    do update set kind = excluded.kind, name = excluded.name, normalized_name = excluded.normalized_name,
                  ibge_code = excluded.ibge_code, attributes = excluded.attributes,
                  source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', v_source, v_url, v_collected, v_raw_id,
            left(v_name, 500), '$.DataTable.diffgram.NewDataSet.Table[*]', v_hash, 0.85)
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

revoke execute on function public.ingest_ana_hidroweb(jsonb) from public, anon, authenticated;
