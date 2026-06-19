-- 0011_ingest_ckan.sql
-- RPC de ingestão genérica CKAN (dados.gov.br / Prefeitura SP), espelhando
-- ingest_sp_contratos: source_runs + raw_records + entities + evidence, idempotente
-- por hash, SECURITY DEFINER. A Edge Function ingest-ckan chama esta RPC com o
-- payload { collectedAt, sourceId, portal, dataset, resourceId, items[] }.
-- O d1-bridge /migrate espelha entities (Postgres) -> Cloudflare D1.

-- Índice único parcial para o upsert de entities por ckanId.
create unique index if not exists entities_ckan_id_uidx
  on public.entities ((external_ids->>'ckanId'))
  where external_ids ? 'ckanId';

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
    v_cnpj := regexp_replace(coalesce(v_item->>'cnpj',''), '\D', '', 'g');
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

revoke execute on function public.ingest_ckan(jsonb) from public, anon, authenticated;
