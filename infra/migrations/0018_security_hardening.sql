-- =============================================================================
-- Migration: 0018_security_hardening.sql
-- Purpose:   Endurecimento derivado dos Supabase Database Advisors (2026-06-20).
--
-- ESCOPO: apenas itens SEGUROS e NÃO-COMPORTAMENTAIS. Os alertas do advisor que
-- são INTENCIONAIS por design NÃO são alterados aqui:
--   - my_plan(), my_trial(), create_alert(), list_my_alerts(), redeem_coupon()...
--     são RPCs SECURITY DEFINER chamadas pelo app autenticado; elas escopam por
--     auth.uid()/auth.email() internamente. Revogar EXECUTE quebraria o produto.
--   - match_entities()/similar_entities() são busca semântica sobre DADOS PÚBLICOS
--     (entities), expostas a anon por design (busca pública). Mantidas.
--
-- Itens deixados FORA daqui de propósito (ver SAAS_PRODUCTION_AUDIT.md §Segurança):
--   - public.spatial_ref_sys (RLS off): tabela de sistema do PostGIS (apenas SRIDs,
--     sem dado sensível) e normalmente não-alterável pelo dono do projeto. Risco aceito.
--   - stripe.set_updated_at / stripe.check_rate_limit (search_path): schema gerenciado
--     pelo conector Stripe; não mexer.
--   - auth_leaked_password_protection: configuração do painel de Auth (1 clique),
--     não há DDL — documentado no README/AUDIT.
--
-- Idempotente e à prova de falha: cada bloco ignora insufficient_privilege /
-- undefined_function, então a migration nunca quebra pela metade em ambientes
-- onde o objeto não existe ou não pertence ao dono.
-- =============================================================================

-- 1. search_path imutável em public.ingest_senado
--    (advisor: function_search_path_mutable) — previne sequestro de search_path
--    em função SECURITY DEFINER. Demais ingest_* já têm search_path='public'.
do $$
begin
  alter function public.ingest_senado(jsonb) set search_path = public;
exception
  when undefined_function or insufficient_privilege then
    raise notice '0018: ingest_senado search_path ignorado (%).', sqlerrm;
end $$;

-- 2. Revoga EXECUTE das funções utilitárias do PostGIS expostas via PostgREST a
--    anon/authenticated (advisor: anon_security_definer_function_executable).
--    O app não as chama por RPC; manter exposto é superfície desnecessária.
do $$
begin
  revoke execute on function public.st_estimatedextent(text, text)
    from anon, authenticated;
exception when undefined_function or insufficient_privilege then
  raise notice '0018: revoke st_estimatedextent(text,text) ignorado (%).', sqlerrm;
end $$;

do $$
begin
  revoke execute on function public.st_estimatedextent(text, text, text)
    from anon, authenticated;
exception when undefined_function or insufficient_privilege then
  raise notice '0018: revoke st_estimatedextent(text,text,text) ignorado (%).', sqlerrm;
end $$;

do $$
begin
  revoke execute on function public.st_estimatedextent(text, text, text, boolean)
    from anon, authenticated;
exception when undefined_function or insufficient_privilege then
  raise notice '0018: revoke st_estimatedextent(text,text,text,boolean) ignorado (%).', sqlerrm;
end $$;
