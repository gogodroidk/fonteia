-- Migration: 0012_ingest_camara_despesas
--
-- RPC public.ingest_camara_despesas(p_payload jsonb) para o modulo Camara dos Deputados.
-- Espelha EXATAMENTE o padrao de public.ingest_inpi (marcas):
--   source_runs (running -> success/failed) + raw_records + entities + evidence,
--   tudo idempotente por upsert. Aqui a chave estavel e o CODIGO DO DOCUMENTO
--   CEAP (codDocumento), gravado em external_ids->>'codDocumento'.
--
-- Fonte: Dados Abertos da Camara dos Deputados — API REST de cotas parlamentares:
--   https://dadosabertos.camara.leg.br/api/v2/deputados/{id}/despesas
-- A Edge Function ingest-camara-despesas coleta despesas CEAP por deputado e
-- chama esta RPC em lotes com { collectedAt, items: [...] }.
--
-- Formato de cada item (vindo da Edge Function ingest-camara-despesas):
--   {
--     "id": "7654321",                     -- = codDocumento (identificador unico do documento)
--     "sourceId": "camara-dados-abertos",
--     "deputadoId": "204554",              -- id do deputado na API
--     "deputadoNome": "FULANO DE TAL",     -- nome parlamentar
--     "partido": "PL",
--     "uf": "SP",
--     "tipo": "COMBUSTÍVEIS E LUBRIFICANTES.",
--     "fornecedor": "AUTO POSTO EXEMPLO LTDA",
--     "cnpjFornecedor": "12345678000190", -- OPCIONAL: null quando pessoa fisica ou ausente
--     "valorDocumento": 250.00,
--     "valorLiquido": 250.00,
--     "valorGlosa": 0.00,
--     "dataDocumento": "2024-03-15T00:00:00",
--     "ano": 2024,
--     "mes": 3,
--     "urlDocumento": "https://...",       -- URL do comprovante (pode ser vazia)
--     "numDocumento": "000123",
--     "numRessarcimento": "",
--     ...
--   }
--
-- Campos armazenados em entities.attributes: o item completo (v_item).
-- Campos indexados em entities.external_ids: codDocumento, deputadoId, ano, mes.
--
-- Pre-requisito: a fonte 'camara-dados-abertos' ja existe em `sources`
-- (inserida em 0001_core_schema.sql), satisfazendo a FK de source_runs/raw_records.
-- NAO reinsira — apenas referenciada aqui como source_id.
--
-- CREATE OR REPLACE: seguro rodar multiplas vezes (idempotente).

-- Indice unico parcial p/ o upsert idempotente da despesa (mesma convencao dos
-- demais kinds: idx_entities_<kind>_<key>_unique sobre external_ids->>'<key>').
create unique index if not exists idx_entities_parliamentary_expense_unique
  on public.entities (((external_ids ->> 'codDocumento')))
  where kind = 'parliamentary_expense' and external_ids ? 'codDocumento';

create or replace function public.ingest_camara_despesas(p_payload jsonb)
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
  v_deputado    text;
  v_tipo        text;
  v_fornecedor  text;
  v_partido     text;
  v_uf          text;
  v_url         text;
  v_raw_id      uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values (
    'camara-dados-abertos',
    'running',
    coalesce(jsonb_array_length(p_payload->'items'), 0)
  )
  returning id into v_run_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;

    v_deputado   := coalesce(nullif(btrim(v_item->>'deputadoNome'), ''), 'Deputado desconhecido');
    v_tipo       := coalesce(nullif(btrim(v_item->>'tipo'), ''), '');
    v_fornecedor := coalesce(nullif(btrim(v_item->>'fornecedor'), ''), '');
    v_partido    := coalesce(v_item->>'partido', '');
    v_uf         := coalesce(v_item->>'uf', '');
    v_url        := coalesce(
                      nullif(v_item->>'urlDocumento', ''),
                      'https://dadosabertos.camara.leg.br/api/v2/deputados/'
                    );

    -- Upsert do raw record (idempotente por (source_id, external_id)).
    insert into raw_records (
      source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at
    )
    values (
      'camara-dados-abertos', v_run_id, v_url, v_id,
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

    -- Upsert da entidade canonica (kind='parliamentary_expense').
    -- name = deputadoNome — tipo; cnpj so quando cnpjFornecedor presente e non-empty.
    insert into entities (
      kind, name, normalized_name, cnpj, external_ids, attributes, source_ids
    )
    values (
      'parliamentary_expense',
      left(v_deputado || ' — ' || v_tipo, 300),
      lower(left(v_deputado || ' ' || v_tipo || ' ' || v_fornecedor || ' ' || v_uf, 500)),
      nullif(v_item->>'cnpjFornecedor', ''),
      jsonb_build_object(
        'codDocumento', v_id,
        'deputadoId',   v_item->>'deputadoId',
        'ano',          v_item->>'ano',
        'mes',          v_item->>'mes'
      ),
      v_item,
      array['camara-dados-abertos']
    )
    on conflict ((external_ids ->> 'codDocumento'))
      where kind = 'parliamentary_expense' and external_ids ? 'codDocumento'
    do update set
      name            = excluded.name,
      normalized_name = excluded.normalized_name,
      cnpj            = excluded.cnpj,
      external_ids    = excluded.external_ids,
      attributes      = excluded.attributes,
      source_ids      = excluded.source_ids,
      updated_at      = now();

    -- Upsert da evidencia (rastreabilidade do documento de despesa CEAP).
    insert into evidence (
      kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence
    )
    values (
      'api_payload', 'camara-dados-abertos', v_url, v_collected, v_raw_id,
      left(
        'Despesa CEAP: ' || v_tipo ||
        ' de ' || v_deputado ||
        ' (' || v_partido || '/' || v_uf || ')' ||
        ' — fornecedor: ' || v_fornecedor ||
        ' — valor: R$ ' || coalesce((v_item->>'valorDocumento'), '?'),
        500
      ),
      '$.items[*]',
      'sha256:'||encode(digest(v_item::text, 'sha256'), 'hex'),
      0.95
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
-- publica e nao pode injetar despesas falsas na base "oficial".
revoke execute on function public.ingest_camara_despesas(jsonb) from public, anon, authenticated;
