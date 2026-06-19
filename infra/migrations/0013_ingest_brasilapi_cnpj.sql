-- Migration: 0013_ingest_brasilapi_cnpj
--
-- RPC public.ingest_brasilapi_cnpj(p_payload jsonb) para enriquecimento de CNPJ
-- via BrasilAPI (https://brasilapi.com.br/api/cnpj/v1/).
-- Espelha EXATAMENTE o padrao de public.ingest_inpi (marcas):
--   source_runs (running -> success/failed) + raw_records + entities + evidence,
--   tudo idempotente por upsert. Aqui a chave estavel e o CNPJ (14 digitos),
--   gravado em entities.cnpj e em external_ids->>'cnpj'.
--
-- Fonte: BrasilAPI — API open-source mantida pela comunidade brasileira.
--   Endpoint: https://brasilapi.com.br/api/cnpj/v1/{cnpj}
--   Docs: https://brasilapi.com.br/docs
--   Sem autenticacao, sem chave de API. Rate limit nao documentado: usar 800ms
--   entre consultas para nao ser bloqueado.
--
-- Formato de cada item (vindo da Edge Function que chama esta RPC em lotes):
--   {
--     "id": "12345678000195",        -- CNPJ com 14 digitos (sem pontuacao)
--     "cnpj": "12345678000195",
--     "razaoSocial": "EMPRESA LTDA",
--     "nomeFantasia": "EMPRESA",
--     "uf": "SP",
--     "municipio": "SAO PAULO",
--     "codigoIbge": "3550308",
--     "situacaoCadastral": "ATIVA",
--     "cnaePrincipal": {"codigo": "6201500", "descricao": "Desenvolvimento de programas"},
--     "cnaesSecundarios": [...],
--     "capitalSocial": 100000,
--     "simples": true,
--     "mei": false,
--     "qsa": [...],
--     "dataInicioAtividade": "2010-05-15",
--     "naturezaJuridica": "206-2"
--   }
--
-- Campos gravados em attributes: item completo (v_item), incluindo cnaePrincipal,
--   cnaesSecundarios, capitalSocial, simples, mei, qsa, dataInicioAtividade,
--   naturezaJuridica e todos os demais campos retornados pela API.
--
-- Idempotencia: upsert em entities por cnpj usando indice parcial unico
--   idx_entities_company_cnpj_unique (criado abaixo), com kind='company'.
--
-- Confianca (confidence = 0.85): BrasilAPI e uma fonte comunitaria que espelha
--   dados da Receita Federal, mas nao e uma fonte oficial direta. O nivel 0.85
--   reflete confiabilidade alta, porem inferior a uma consulta direta a Receita.
--
-- Pre-requisito: a fonte 'brasilapi' deve existir em `sources`
--   (inserida pelo bloco INSERT abaixo), satisfazendo a FK de source_runs/raw_records.
--
-- CREATE OR REPLACE: seguro rodar multiplas vezes.

-- Upsert da nova source 'brasilapi' (nao existe em 0001_core_schema.sql).
insert into sources (
  id, name, owner, source_url, docs_url, status, access_kind,
  reliability, modules, refresh_cadence, commercial_risk, notes
)
values (
  'brasilapi',
  'BrasilAPI — Enriquecimento CNPJ',
  'BrasilAPI (Open Source)',
  'https://brasilapi.com.br/api/cnpj/v1/',
  'https://brasilapi.com.br/docs',
  'connected',
  'open',
  'community_stable',
  ARRAY['empresas','licitacoes','juridico','municipios'],
  'realtime',
  'low',
  'API gratuita open-source mantida pela comunidade. CNPJ, bancos, CEP, cambio e mais. Sem chave, sem autenticacao. Rate limit nao documentado: usar 800ms entre consultas.'
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

-- Indice unico parcial p/ o upsert idempotente da empresa por CNPJ
-- (mesma convencao dos demais kinds; aqui usamos a coluna cnpj nativa de entities).
create unique index if not exists idx_entities_company_cnpj_unique
  on public.entities (cnpj)
  where kind = 'company' and cnpj is not null;

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
      updated_at      = now();

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
