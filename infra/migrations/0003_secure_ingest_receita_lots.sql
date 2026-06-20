-- 0003_secure_ingest_receita_lots.sql
-- Segurança (advisor: anon_security_definer_function_executable / lint 0028).
--
-- A função public.ingest_receita_lots(jsonb) é SECURITY DEFINER e estava com
-- EXECUTE concedido a anon e authenticated. Como a chave publishable é pública
-- (vai no bundle do site), QUALQUER pessoa podia chamar
--   POST /rest/v1/rpc/ingest_receita_lots
-- e injetar lotes de leilão FALSOS na base "oficial" — destruindo a proposta de
-- "fonte rastreável" do produto. Apenas a service_role (usada pela Edge Function
-- de ingestão) deve poder executá-la.
--
-- Aplicar no banco de produção (Supabase -> SQL Editor, ou via migração rastreada):

-- Guarda para recriação do zero: a função só é criada na 0099 (CREATE OR REPLACE).
-- Sem este DO-block, um `apply` em ordem lexicográfica abortaria aqui
-- ("function does not exist"). Quando a função existir, o REVOKE é aplicado.
do $$
begin
  revoke execute on function public.ingest_receita_lots(jsonb) from public, anon, authenticated;
exception when undefined_function then
  raise notice '0003: ingest_receita_lots ainda nao existe; REVOKE sera aplicado na 0099.';
end $$;

-- Verificação (a ACL deve sobrar apenas com postgres e service_role marcados 'X'):
--   select proacl::text from pg_proc
--   where proname = 'ingest_receita_lots' and pronamespace = 'public'::regnamespace;
