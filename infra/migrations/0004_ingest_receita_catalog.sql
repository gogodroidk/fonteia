-- 0004_ingest_receita_catalog.sql
-- Ingestão do CATÁLOGO COMPLETO da Receita (todos os editais/lotes, não só destaques).
--
-- A Edge Function `ingest-receita-catalog` normaliza os lotes (com valorAvaliacaoCents,
-- category, imageUrls etc.) e chama esta função, que faz upsert idempotente em
-- raw_records/entities/evidence — MESMOS alvos de conflito da ingest_receita_lots, então
-- destaque e catálogo convergem no mesmo lote (id = edle-nrAtribuido).
--
-- SECURITY DEFINER, sem EXECUTE para anon/authenticated (mesma postura de segurança do 0003).

create or replace function public.ingest_receita_catalog(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run_id uuid;
  v_collected timestamptz := coalesce((p_payload->>'collectedAt')::timestamptz, now());
  v_count int := 0;
  v_lot jsonb;
  v_id text;
  v_raw_id uuid;
  v_url text;
begin
  insert into source_runs (source_id, status, records_seen)
  values ('receita-leiloes-sle', 'running', coalesce(jsonb_array_length(p_payload->'lots'), 0))
  returning id into v_run_id;

  for v_lot in select * from jsonb_array_elements(p_payload->'lots')
  loop
    v_id := v_lot->>'id';
    v_url := coalesce(v_lot->>'sourceUrl', 'https://www25.receita.fazenda.gov.br/sle-sociedade/portal');

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values ('receita-leiloes-sle', v_run_id, v_url, v_id,
            coalesce(v_lot->'raw', v_lot),
            'md5:'||md5((coalesce(v_lot->'raw', v_lot))::text), v_collected)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash, collected_at = excluded.collected_at
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, external_ids, attributes, source_ids)
    values ('auction_lot',
            'Lote '||(v_lot->>'displayNumber')||' - '||coalesce(v_lot->>'category', v_lot->>'city'),
            lower('lote '||(v_lot->>'displayNumber')||' '||coalesce(v_lot->>'category','')||' '||coalesce(v_lot->>'city','')),
            jsonb_build_object('receitaLotId', v_id, 'edital', v_lot->>'edital', 'edle', v_lot->>'edle'),
            v_lot,
            array['receita-leiloes-sle'])
    on conflict ((external_ids->>'receitaLotId')) where kind = 'auction_lot' and external_ids ? 'receitaLotId'
    do update set name = excluded.name, normalized_name = excluded.normalized_name,
                  external_ids = excluded.external_ids, attributes = excluded.attributes,
                  source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', 'receita-leiloes-sle', v_url, v_collected, v_raw_id,
            'Lote '||(v_lot->>'displayNumber')||' do edital '||(v_lot->>'edital')||' (Receita Federal SLE).',
            '$.listaLotes[*]', 'md5:'||md5(v_lot::text), 0.8)
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

revoke execute on function public.ingest_receita_catalog(jsonb) from public, anon, authenticated;
