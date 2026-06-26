-- =============================================================================
-- 0028_harden_cnpj_function_search_path.sql
--   Fecha o advisor de segurança "function_search_path_mutable" (WARN) nas duas
--   funções públicas de CNPJ. Sem mudança de comportamento.
-- =============================================================================
-- ACHADO (Supabase Security Advisor, lint 0011_function_search_path_mutable):
--   public.sanitize_cnpj(text) e public.validate_cnpj_format(text) estão SEM
--   search_path fixado (proconfig = null). Função com search_path mutável é
--   vetor de "search_path hijacking": um objeto malicioso em outro schema do
--   search_path do chamador poderia sombrear um nome não-qualificado usado pela
--   função.
--
-- POR QUE É SEGURO FIXAR EM ''  (vazio)
--   Ambas são SQL IMMUTABLE STRICT e usam SOMENTE built-ins de pg_catalog
--   (upper, regexp_replace, coalesce e o operador ~). Não referenciam NENHUM
--   objeto de `public`. Com search_path = '', o pg_catalog continua implicitamente
--   disponível, então as funções seguem idênticas — apenas deixam de herdar o
--   search_path do chamador. É exatamente a remediação recomendada pelo advisor.
--
--   Idempotente (ALTER ... SET é declarativo). Seguro reaplicar.
--   Assinaturas confirmadas em produção: (p_raw text) e (p_cnpj text).
-- =============================================================================

ALTER FUNCTION public.sanitize_cnpj(text)        SET search_path = '';
ALTER FUNCTION public.validate_cnpj_format(text) SET search_path = '';
