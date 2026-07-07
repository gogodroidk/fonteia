-- =============================================================================
-- 0037_ingest_querido_diario.sql
-- =============================================================================
-- RPC de ingestão do Querido Diário (Open Knowledge Brasil) — acervo público de
-- diários oficiais MUNICIPAIS em texto. Cobre a long-tail de licitações
-- municipais que não passam pelo PNCP.
--
-- Por que uma RPC dedicada (não reaproveitar ingest_pncp):
--   ingest_pncp faz upsert pela chave natural `external_ids->>'numeroControlePNCP'`,
--   que não existe no Querido Diário. Aqui a chave natural é a OCORRÊNCIA
--   (diário × termo de busca): `territory_id + date + edition + termo`, já
--   resolvida no conector em packages/sources/src/connectors/querido-diario.ts
--   (ver `opportunityId`) e replicada inline na Edge Function
--   supabase/functions/ingest-querido-diario/index.ts como `item.id` (formato
--   "qd-<hash>"). O upsert é por esse `id`.
--
-- kind = 'bidding_opportunity' (mesmo kind do PNCP) — decisão: o Querido Diário
-- não é uma fonte estrutural diferente de "licitação", é outro CANAL para o
-- mesmo tipo de entidade. Reaproveitar o kind evita fragmentar buscas/filtros no
-- produto (o módulo "licitações" já filtra por kind='bidding_opportunity').
-- A distinção de origem/fonte vive em `attributes.origem = 'querido-diario'`
-- (vs. implícito "pncp" nos registros vindos de ingest_pncp/ingest_pncp_contratos)
-- e em `source_ids = array['querido-diario']`. Isso preserva rastreabilidade sem
-- exigir um novo EntityKind nem migração de schema adicional.
--
-- IMPORTANTE — natureza do dado: diferente do PNCP (JSON estruturado oficial),
-- o Querido Diário devolve TEXTO de diário oficial com um trecho (excerpt) que
-- CASOU com um termo de busca ("pregão eletrônico", "dispensa de licitação" etc).
-- Não há objeto/valor/data-limite estruturados — o produto deve tratar estes
-- registros como "indício textual de oportunidade", nunca como edital
-- confirmado. `attributes.confianca = 'indicio_textual'` marca isso
-- explicitamente para o front não prometer o que a fonte não garante.
--
-- Idempotência: rodar a mesma busca 2x não duplica — upsert por
-- `external_ids->>'queridoDiarioId'` (índice único parcial abaixo).
--
-- POR QUE INSERIR EM `sources` PRIMEIRO: source_runs.source_id, raw_records.source_id
-- e evidence.source_id são FKs para sources(id) (0001_core_schema.sql). Sem a linha
-- abaixo, a primeira escrita de run estoura FK — mesmo padrão de 0022.
-- =============================================================================

INSERT INTO sources (
  id, name, owner, source_url, docs_url, status, access_kind,
  reliability, modules, refresh_cadence, commercial_risk, notes
)
VALUES (
  'querido-diario',
  'Querido Diário - Open Knowledge Brasil',
  'Open Knowledge Brasil (OKBR)',
  'https://queridodiario.ok.org.br',
  'https://docs.queridodiario.ok.org.br/pt-br/latest/utilizando/api-publica.html',
  'connected',
  'open',
  'complementary',
  ARRAY['licitacoes','municipios'],
  'daily',
  'low',
  'Acervo publico de diarios oficiais MUNICIPAIS em texto (nao API estruturada de licitacao). API real: https://api.queridodiario.ok.org.br/gazettes (o host queridodiario.ok.org.br fica atras de desafio Cloudflare e nao serve para fetch programatico). Busca full-text por termos de licitacao ("pregao", "dispensa de licitacao" etc); cada ocorrencia (diario x termo) e um indicio textual, nao um edital estruturado. Cobre a long-tail de prefeituras que nao publicam no PNCP.'
)
ON CONFLICT (id) DO UPDATE SET
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

CREATE OR REPLACE FUNCTION public.ingest_querido_diario(p_payload jsonb)
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
  v_municipio text;
  v_uf text;
  v_termo text;
  v_trecho text;
  v_raw_id uuid;
begin
  insert into source_runs (source_id, status, records_seen)
  values ('querido-diario', 'running', coalesce(jsonb_array_length(p_payload->'items'), 0))
  returning id into v_run_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;
    v_url := coalesce(nullif(v_item->>'sourceUrl', ''), 'https://queridodiario.ok.org.br');
    v_municipio := coalesce(nullif(btrim(v_item->>'municipio'), ''), 'Município não informado');
    v_uf := coalesce(v_item->>'uf', '');
    v_termo := coalesce(v_item->>'termo', '');
    v_trecho := coalesce(v_item->>'trecho', '');

    insert into raw_records (source_id, source_run_id, source_url, external_id, payload, content_hash, collected_at)
    values ('querido-diario', v_run_id, v_url, v_id,
            coalesce(v_item->'raw', v_item),
            'md5:' || md5((coalesce(v_item->'raw', v_item))::text), v_collected)
    on conflict (source_id, external_id) where external_id is not null
    do update set source_run_id = excluded.source_run_id, payload = excluded.payload,
                  content_hash = excluded.content_hash, collected_at = excluded.collected_at
    returning id into v_raw_id;

    insert into entities (kind, name, normalized_name, ibge_code, external_ids, attributes, source_ids)
    values ('bidding_opportunity',
            left('Diário Oficial - ' || v_municipio || '/' || v_uf || ' - ' || v_termo, 300),
            lower(left(v_municipio || ' ' || v_uf || ' ' || v_termo || ' ' || v_trecho, 500)),
            nullif(v_item->>'ibgeCode', ''),
            jsonb_build_object('queridoDiarioId', v_id),
            v_item || jsonb_build_object('origem', 'querido-diario', 'confianca', 'indicio_textual'),
            array['querido-diario'])
    on conflict ((external_ids ->> 'queridoDiarioId')) where kind = 'bidding_opportunity' and external_ids ? 'queridoDiarioId'
    do update set name = excluded.name, normalized_name = excluded.normalized_name,
                  ibge_code = excluded.ibge_code,
                  external_ids = excluded.external_ids, attributes = excluded.attributes,
                  source_ids = excluded.source_ids, updated_at = now();

    insert into evidence (kind, source_id, source_url, collected_at, raw_record_id, quote, path, content_hash, confidence)
    values ('api_payload', 'querido-diario', v_url, v_collected, v_raw_id,
            left('Diário de ' || v_municipio || '/' || v_uf || ' (edição ' || coalesce(v_item->>'edicao', 's/n') ||
                 ') menciona "' || v_termo || '": ' || v_trecho, 500),
            '$.gazettes[*]', 'md5:' || md5(v_item::text),
            -- confiança mais baixa que fontes estruturadas (PNCP=0.9): é texto
            -- livre que casou com um termo de busca, não um campo estruturado.
            0.6)
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

-- Índice único parcial: upsert idempotente por queridoDiarioId (mesmo padrão de
-- idx_entities_auction_lot_receita_unique em 0001, aplicado a bidding_opportunity
-- vindo do Querido Diário).
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_bidding_opportunity_querido_diario_unique
  ON entities((external_ids->>'queridoDiarioId'))
  WHERE kind = 'bidding_opportunity' AND external_ids ? 'queridoDiarioId';

-- Mesma política de least-privilege das demais RPCs de ingestão (0017/0024):
-- só o service_role (usado pela Edge Function) pode executar.
REVOKE EXECUTE ON FUNCTION public.ingest_querido_diario(jsonb) FROM public, anon, authenticated;
