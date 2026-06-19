-- Migration: 0014_ingest_camara_votacoes
--
-- RPC public.ingest_camara_votacoes(p_payload jsonb) para o modulo Câmara dos Deputados.
-- Espelha EXATAMENTE o padrao de public.ingest_inpi (marcas INPI):
--   source_runs (running -> success/failed) + raw_records + entities + evidence,
--   tudo idempotente por upsert. A chave estavel e o votacaoId (ex.: "2473873-65"),
--   gravado em external_ids->>'votacaoId'.
--
-- Fonte: Câmara Dados Abertos — API REST de votacoes:
--   https://dadosabertos.camara.leg.br/api/v2/votacoes
-- A Edge Function ingest-camara-votacoes chama o endpoint paginado e
-- chama esta RPC em lotes com { collectedAt, items: [...] }.
--
-- Formato de cada item (vindo da Edge Function):
--   {
--     "id": "2473873-65",             -- votacaoId (chave estavel)
--     "data": "2024-11-20",
--     "dataHoraRegistro": "2024-11-20T14:32:00",
--     "descricao": "Em votação o requerimento...",
--     "siglaOrgao": "PLEN",
--     "idOrgao": "180",
--     "idEvento": "1234567",
--     "aprovacao": true,              -- boolean ou null
--     "placarSim": 312,
--     "placarNao": 98,
--     "placarAbstencoes": 5,
--     "tipoVotacao": "Nominal",
--     "urlRegistro": "https://dadosabertos.camara.leg.br/api/v2/votacoes/2473873-65",
--     "proposicao": {
--       "id": 987654,
--       "siglaTipo": "PL",
--       "numero": "1234",
--       "ano": "2024",
--       "ementa": "Altera a Lei..."
--     },
--     "votos": [...]                  -- array jsonb, pode ser []
--   }
--
-- kind = 'legislative_vote'
-- Idempotencia por votacaoId (external_ids->>'votacaoId').
--
-- Pre-requisito: a fonte 'camara-dados-abertos' ja existe em `sources`
-- (inserida em 0001_core_schema.sql), satisfazendo a FK de source_runs/raw_records.
--
-- CREATE OR REPLACE: seguro rodar multiplas vezes.

-- Indice unico parcial p/ o upsert idempotente da votacao (mesma convencao dos
-- demais kinds: idx_entities_<kind>_unique sobre external_ids->>'<key>').
create unique index if not exists idx_entities_legislative_vote_unique
  on public.entities (((external_ids ->> 'votacaoId')))
  where kind = 'legislative_vote' and external_ids ? 'votacaoId';

create or replace function public.ingest_camara_votacoes(p_payload jsonb)
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
  v_descricao   text;
  v_orgao       text;
  v_tipo        text;
  v_url         text;
  v_aprovacao   boolean;
  v_proposicao  jsonb;
  v_resultado   text;
  v_quote       text;
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

    v_descricao  := v_item->>'descricao';
    v_orgao      := coalesce(v_item->>'siglaOrgao', '');
    v_tipo       := coalesce(v_item->>'tipoVotacao', '');
    v_url        := coalesce(
                      nullif(v_item->>'urlRegistro', ''),
                      'https://dadosabertos.camara.leg.br/api/v2/votacoes/' || v_id
                    );
    v_aprovacao  := (v_item->>'aprovacao')::boolean;
    v_proposicao := v_item->'proposicao';

    -- Calcula o resultado textual antes de montar a quote (evita boolean em interpolacao).
    v_resultado := case
      when v_aprovacao is null then null
      when v_aprovacao         then 'Aprovado'
      else                          'Rejeitado'
    end;

    -- Monta a quote completa em variavel intermediaria.
    v_quote := left(
      v_orgao || ' — ' || coalesce(v_descricao, 'Votação')
      || coalesce(
           ' (Proposição: '
           || (v_proposicao->>'siglaTipo') || ' '
           || (v_proposicao->>'numero') || '/'
           || (v_proposicao->>'ano') || ')',
           ''
         )
      || coalesce(' | Resultado: ' || v_resultado, ''),
      500
    );

    -- Upsert do raw record (idempotente por (source_id, external_id)).
    insert into raw_records (
      source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at
    )
    values (
      'camara-dados-abertos', v_run_id, v_url, v_id,
      v_item,
      'sha256:'||encode(digest(v_item::text, 'sha256'), 'hex'),
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

    -- Upsert da entidade canonica (kind='legislative_vote').
    -- name = siglaOrgao + descricao; cnpj sempre null (votacoes nao tem CNPJ).
    insert into entities (
      kind, name, normalized_name, cnpj, external_ids, attributes, source_ids
    )
    values (
      'legislative_vote',
      left(v_orgao || ': ' || coalesce(v_descricao, 'Votação'), 300),
      lower(left(
        coalesce(v_descricao, '') || ' ' || v_orgao || ' ' || v_tipo,
        500
      )),
      null,
      jsonb_build_object(
        'votacaoId', v_id,
        'idOrgao',   v_item->>'idOrgao',
        'idEvento',  v_item->>'idEvento'
      ),
      v_item,
      array['camara-dados-abertos']
    )
    on conflict ((external_ids ->> 'votacaoId'))
      where kind = 'legislative_vote' and external_ids ? 'votacaoId'
    do update set
      name            = excluded.name,
      normalized_name = excluded.normalized_name,
      cnpj            = excluded.cnpj,
      external_ids    = excluded.external_ids,
      attributes      = excluded.attributes,
      source_ids      = excluded.source_ids,
      updated_at      = now();

    -- Upsert da evidencia (rastreabilidade da votacao registrada na Camara).
    insert into evidence (
      kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence
    )
    values (
      'api_payload', 'camara-dados-abertos', v_url, v_collected, v_raw_id,
      v_quote,
      '$.votacoes[*]',
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
-- publica e nao pode injetar votacoes falsas na base "oficial".
revoke execute on function public.ingest_camara_votacoes(jsonb) from public, anon, authenticated;
