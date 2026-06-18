-- Migration: 0010_ingest_inpi
--
-- RPC public.ingest_inpi(p_payload jsonb) para o modulo INPI (marcas).
-- Espelha EXATAMENTE o padrao de public.ingest_ambiental (autos de infracao):
--   source_runs (running -> success/failed) + raw_records + entities + evidence,
--   tudo idempotente por upsert. Aqui a chave estavel e o NUMERO DO PROCESSO do
--   INPI (9 digitos), gravado em external_ids->>'processNumber'.
--
-- Fonte: RPI (Revista da Propriedade Industrial) — XML de marcas, semanal:
--   https://revistas.inpi.gov.br/txt/RM<NUMERO>.zip
-- A Edge Function ingest-inpi faz streaming via HTTP Range, parseia o XML e
-- chama esta RPC em lotes com { collectedAt, revista, items: [...] }.
--
-- Formato de cada item (vindo da Edge Function ingest-inpi):
--   {
--     "id": "936904577",                -- = processNumber (9 digitos)
--     "sourceId": "inpi-dados-abertos",
--     "processNumber": "936904577",
--     "nome": "GRUPO AGROPARANA",        -- elemento nominativo da marca
--     "niceClasses": ["29"],
--     "status": "Concessao de registro", -- despacho da semana ou status da classe
--     "titularNome": "AGROPECUARIA NELORE PARANA LTDA.",
--     "titularCnpj": "12345678000190",  -- OPCIONAL: so quando extraivel do nome
--     "titularUf": "SP",
--     "apresentacao": "Nominativa",
--     "natureza": "Produtos e/ou Servico",
--     "despachoCodigo": "IPAS158",
--     "despachoNome": "Concessao de registro",
--     "dataDeposito": "2024-11-05T00:00:00-03:00",
--     "revista": 2893,
--     ...
--   }
--
-- IMPORTANTE (honesto): o XML da RPI NAO traz CPF/CNPJ estruturado do titular.
-- entities.cnpj so e preenchido quando a Edge conseguiu extrair 14 digitos do
-- proprio nome do titular (caso MEI/EI). Caso contrario, cnpj fica NULL e a
-- marca segue buscavel por nome/processo no front.
--
-- Pre-requisito: a fonte 'inpi-dados-abertos' ja existe em `sources`
-- (inserida em 0001_core_schema.sql), satisfazendo a FK de source_runs/raw_records.
--
-- CREATE OR REPLACE: seguro rodar multiplas vezes.

-- Indice unico parcial p/ o upsert idempotente da marca (mesma convencao dos
-- demais kinds: idx_entities_<kind>_<key>_unique sobre external_ids->>'<key>').
create unique index if not exists idx_entities_trademark_inpi_unique
  on public.entities (((external_ids ->> 'processNumber')))
  where kind = 'trademark' and external_ids ? 'processNumber';

create or replace function public.ingest_inpi(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run_id      uuid;
  v_collected   timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count       int := 0;
  v_item        jsonb;
  v_id          text;
  v_nome        text;
  v_titular     text;
  v_uf          text;
  v_status      text;
  v_url         text;
  v_raw_id      uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values (
    'inpi-dados-abertos',
    'running',
    coalesce(jsonb_array_length(p_payload->'items'), 0)
  )
  returning id into v_run_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;

    v_nome    := coalesce(nullif(btrim(v_item->>'nome'), ''), 'Marca sem elemento nominativo');
    v_titular := coalesce(nullif(btrim(v_item->>'titularNome'), ''), '');
    v_uf      := coalesce(v_item->>'titularUf', '');
    v_status  := coalesce(v_item->>'status', '');
    v_url     := 'https://revistas.inpi.gov.br/rpi/';

    -- Upsert do raw record (idempotente por (source_id, external_id)).
    insert into raw_records (
      source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at
    )
    values (
      'inpi-dados-abertos', v_run_id, v_url, v_id,
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

    -- Upsert da entidade canonica (kind='trademark').
    -- name = elemento nominativo da marca; cnpj so quando extraido do nome do titular.
    insert into entities (
      kind, name, normalized_name, cnpj, external_ids, attributes, source_ids
    )
    values (
      'trademark',
      left(v_nome, 300),
      lower(left(v_nome || ' ' || v_titular || ' ' || v_uf, 500)),
      nullif(v_item->>'titularCnpj', ''),
      jsonb_build_object('processNumber', v_id),
      v_item,
      array['inpi-dados-abertos']
    )
    on conflict ((external_ids ->> 'processNumber'))
      where kind = 'trademark' and external_ids ? 'processNumber'
    do update set
      name            = excluded.name,
      normalized_name = excluded.normalized_name,
      cnpj            = excluded.cnpj,
      external_ids    = excluded.external_ids,
      attributes      = excluded.attributes,
      source_ids      = excluded.source_ids,
      updated_at      = now();

    -- Upsert da evidencia (rastreabilidade da movimentacao publicada na RPI).
    insert into evidence (
      kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence
    )
    values (
      'api_payload', 'inpi-dados-abertos', v_url, v_collected, v_raw_id,
      left(
        'Marca ' || v_id || ' (' || v_nome || ')' ||
        coalesce(' — titular ' || nullif(v_titular, ''), '') ||
        coalesce(': ' || nullif(v_status, ''), '') ||
        ' (RPI/INPI nº ' || coalesce(p_payload->>'revista', '?') || ').',
        500
      ),
      '$.revista.processo[*]',
      'sha256:'||encode(digest(v_item::text, 'sha256'), 'hex'),
      0.9
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
-- publica e nao pode injetar marcas falsas na base "oficial".
revoke execute on function public.ingest_inpi(jsonb) from public, anon, authenticated;
