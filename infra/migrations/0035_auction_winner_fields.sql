-- =============================================================================
-- 0035_auction_winner_fields.sql — arremate + arrematante na base histórica
-- =============================================================================
-- APLICADA em produção (Supabase MCP apply_migration) em 2026-06-23.
--
-- Adiciona o ARREMATANTE (vencedor) e o instante de coleta do arremate à
-- `auction_lot_history`, e a RPC `apply_extrato_results` que a Edge Function
-- `ingest-receita-atas` usa para gravar o resultado de um edital inteiro em UMA
-- chamada (a partir do PDF público "Extrato do Leilão").
--
-- PRIVACIDADE: o CPF de pessoa física já vem MASCARADO da própria Receita
-- (ex.: "***.670.421-**"); CNPJ de empresa é dado público. `winner_doc` guarda
-- o documento exatamente como publicado (sem desmascarar nada). É reespelho de
-- documento oficial público, com fonte e data.
--
-- NÃO-REGRESSIVO: a RPC só preenche `final_value_*` quando ainda está NULL ou já
-- veio do próprio extrato — nunca sobrescreve um arremate vindo de fonte melhor.
-- Idempotente (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE). Seguro reaplicar.
-- =============================================================================

alter table public.auction_lot_history
  add column if not exists winner_name              text,
  add column if not exists winner_doc               text,
  add column if not exists final_value_collected_at timestamptz;

-- Aplica o resultado parseado de um extrato (array de lotes) à base histórica.
-- p_results: jsonb array de { lote:int, doc:text|null, nome:text|null, valorCents:bigint|null }.
-- Só atualiza lotes ARREMATADOS (valorCents > 0). Retorna quantos lotes gravou.
create or replace function public.apply_extrato_results(p_edle text, p_results jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_prefix  text := replace(coalesce(p_edle, ''), '/', '-');
  v_updated int  := 0;
  r         jsonb;
  v_val     bigint;
begin
  if v_prefix = '' then return 0; end if;
  for r in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  loop
    v_val := nullif(r->>'valorCents', '')::bigint;
    if v_val is null or v_val <= 0 then continue; end if;  -- não arrematado / inválido

    update public.auction_lot_history h
      set final_value_cents        = v_val,
          final_value_source       = 'extrato-leilao',
          winner_name              = nullif(btrim(coalesce(r->>'nome', '')), ''),
          winner_doc               = nullif(btrim(coalesce(r->>'doc', '')), ''),
          final_value_collected_at = now()
    where h.receita_lot_id = v_prefix || '-' || (r->>'lote')
      and (h.final_value_cents is null or h.final_value_source = 'extrato-leilao');

    if found then v_updated := v_updated + 1; end if;
  end loop;
  return v_updated;
end;
$fn$;

-- service_role (a Edge Function de ingestão) é quem chama; fechado para o resto.
revoke execute on function public.apply_extrato_results(text, jsonb) from public, anon, authenticated;

comment on function public.apply_extrato_results(text, jsonb) is
  'Grava arremate+arrematante (do PDF Extrato do Leilão) em auction_lot_history, '
  'não-regressivo, um edital por chamada. Só service_role. Usada por ingest-receita-atas.';
