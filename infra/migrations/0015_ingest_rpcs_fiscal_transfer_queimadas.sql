-- 0015_ingest_rpcs_fiscal_transfer_queimadas.sql
--
-- RPCs SECURITY DEFINER + índices únicos parciais para três coletores novos:
--   • Tesouro / SICONFI        -> kind = 'fiscal_report'       (ingest_siconfi)
--   • Transferegov / +Brasil   -> kind = 'federal_transfer'    (ingest_transferegov)
--   • INPE / Programa Queimadas-> kind = 'environmental_alert' (ingest_inpe_queimadas)
--
-- Estas funções já haviam sido aplicadas via MCP; este arquivo versiona o estado
-- no repositório (fonte da verdade). Tudo é idempotente (CREATE OR REPLACE /
-- CREATE UNIQUE INDEX IF NOT EXISTS), seguro para reaplicar.
--
-- NOVIDADE nesta versão: ingest_inpe_queimadas passa a fazer MERGE ADITIVO entre
-- janelas de byte-offset. O CSV mensal do INPE em meses de pico chega a ~400 MB
-- e NÃO cabe numa única invocação de Edge Function (150s); cada invocação agrega
-- apenas a sua janela. Para que o total por município/mês fique correto, a RPC
-- soma os parciais de cada janela (totalFocos, frpSum, frpCount, histograma de
-- biomas) e só então deriva frpMedio/frpTotal/bioma-dominante. A lista `windows`
-- registra as janelas já mescladas: reprocessar a mesma janela é ignorado
-- (idempotência), evitando dupla-contagem.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tesouro / SICONFI — relatórios fiscais (DCA por ente)
-- ─────────────────────────────────────────────────────────────────────────────
create unique index if not exists entities_siconfi_uidx
  on public.entities (((external_ids ->> 'siconfiId')))
  where kind = 'fiscal_report' and external_ids ? 'siconfiId';

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
    v_cnpj := nullif(regexp_replace(coalesce(v_item->>'cnpj',''), '\D', '', 'g'), '');
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Transferegov / +Brasil — transferências federais (FAF + TED)
-- ─────────────────────────────────────────────────────────────────────────────
create unique index if not exists entities_transferegov_uidx
  on public.entities (((external_ids ->> 'transferegovId')))
  where kind = 'federal_transfer' and external_ids ? 'transferegovId';

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
    v_cnpj := nullif(regexp_replace(coalesce(v_item->>'cnpj',''), '\D', '', 'g'), '');
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

-- ─────────────────────────────────────────────────────────────────────────────
-- INPE / Programa Queimadas — focos de incêndio (merge aditivo entre janelas)
-- ─────────────────────────────────────────────────────────────────────────────
create unique index if not exists entities_queimadas_uidx
  on public.entities (((external_ids ->> 'queimadasId')))
  where kind = 'environmental_alert' and external_ids ? 'queimadasId';

create or replace function public.ingest_inpe_queimadas(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item      jsonb;
  v_n         int := 0;
  v_id        text;
  v_name      text;
  v_wkey      text;
  v_exist     jsonb;       -- attributes existentes (NULL se for a 1ª janela)
  v_windows   jsonb;       -- janelas já mescladas
  v_biomas    jsonb;       -- histograma bioma -> contagem (acumulado)
  v_total     numeric;
  v_frpsum    numeric;
  v_frpcount  numeric;
  v_maxrisco  numeric;
  v_maxdias   numeric;
  v_bioma_dom text;
  v_bioma_max numeric;
  v_k         text;
  v_vtext     text;
  v_attr      jsonb;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    v_id := v_item->>'id';
    if v_id is null or v_id = '' then continue; end if;
    v_wkey := coalesce(nullif(v_item->>'windowKey',''), '0');
    v_name := coalesce(nullif(btrim(v_item->>'name'),''), 'Focos de incendio');

    -- Carrega o registro existente (se houver) para o merge aditivo.
    select e.attributes
      into v_exist
      from public.entities e
     where e.kind = 'environmental_alert'
       and e.external_ids ->> 'queimadasId' = v_id
     limit 1;

    if v_exist is null then
      -- Primeira janela deste município/mês: inicia os acumuladores.
      v_total    := coalesce((v_item->>'totalFocos')::numeric, 0);
      v_frpsum   := coalesce((v_item->>'frpSum')::numeric, 0);
      v_frpcount := coalesce((v_item->>'frpCount')::numeric, 0);
      v_maxrisco := coalesce((v_item->>'maxRiscoFogo')::numeric, 0);
      v_maxdias  := coalesce((v_item->>'maxDiasSemChuva')::numeric, 0);
      v_biomas   := coalesce(v_item->'biomas', '{}'::jsonb);
      v_windows  := jsonb_build_array(v_wkey);
    else
      v_windows := coalesce(v_exist->'windows', '[]'::jsonb);
      -- Janela já mesclada antes -> idempotente, não recontabiliza.
      if v_windows ? v_wkey then
        continue;
      end if;
      -- Soma os parciais desta janela aos já acumulados.
      v_total    := coalesce((v_exist->>'totalFocos')::numeric, 0)     + coalesce((v_item->>'totalFocos')::numeric, 0);
      v_frpsum   := coalesce((v_exist->>'frpSum')::numeric, 0)         + coalesce((v_item->>'frpSum')::numeric, 0);
      v_frpcount := coalesce((v_exist->>'frpCount')::numeric, 0)       + coalesce((v_item->>'frpCount')::numeric, 0);
      v_maxrisco := greatest(coalesce((v_exist->>'maxRiscoFogo')::numeric, 0),    coalesce((v_item->>'maxRiscoFogo')::numeric, 0));
      v_maxdias  := greatest(coalesce((v_exist->>'maxDiasSemChuva')::numeric, 0), coalesce((v_item->>'maxDiasSemChuva')::numeric, 0));
      -- Merge do histograma de biomas (soma por chave).
      v_biomas := coalesce(v_exist->'biomas', '{}'::jsonb);
      for v_k, v_vtext in select key, value from jsonb_each_text(coalesce(v_item->'biomas', '{}'::jsonb)) loop
        v_biomas := jsonb_set(
          v_biomas, array[v_k],
          to_jsonb(coalesce((v_biomas->>v_k)::numeric, 0) + coalesce(v_vtext::numeric, 0))
        );
      end loop;
      v_windows := v_windows || jsonb_build_array(v_wkey);
    end if;

    -- Deriva o bioma dominante a partir do histograma acumulado.
    v_bioma_dom := 'Nao informado';
    v_bioma_max := -1;
    for v_k, v_vtext in select key, value from jsonb_each_text(v_biomas) loop
      if coalesce(v_vtext::numeric, 0) > v_bioma_max then
        v_bioma_max := coalesce(v_vtext::numeric, 0);
        v_bioma_dom := v_k;
      end if;
    end loop;

    -- attributes finais: metadados do item + acumuladores mesclados + derivados.
    v_attr := (v_item - 'raw' - 'windowKey')
      || jsonb_build_object(
           'totalFocos',      v_total,
           'frpSum',          round(v_frpsum, 3),
           'frpCount',        v_frpcount,
           'frpTotal',        round(v_frpsum, 1),
           'frpMedio',        case when v_frpcount > 0 then round(v_frpsum / v_frpcount, 1) else 0 end,
           'maxRiscoFogo',    round(v_maxrisco, 3),
           'maxDiasSemChuva', v_maxdias,
           'biomas',          v_biomas,
           'bioma',           v_bioma_dom,
           'windows',         v_windows
         );

    insert into public.entities (kind, name, normalized_name, cnpj, external_ids, attributes, source_ids)
    values ('environmental_alert', left(v_name,400), lower(left(v_name,500)), null,
            jsonb_build_object('queimadasId', v_id), v_attr, array['inpe-queimadas-dados-abertos'])
    on conflict ((external_ids->>'queimadasId')) where kind='environmental_alert' and external_ids ? 'queimadasId'
    do update set name=excluded.name, normalized_name=excluded.normalized_name,
                  attributes=excluded.attributes, source_ids=excluded.source_ids, updated_at=now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;
