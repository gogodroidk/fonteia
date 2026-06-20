-- 0017_harden_revoke_definer_grants.sql
--
-- HARDENING DE SEGURANÇA (achado da revisão de segurança).
--
-- Funções SECURITY DEFINER recém-criadas (migrations 0015/0016) herdaram o
-- default do Postgres de EXECUTE para PUBLIC, ficando chamáveis por anon/
-- authenticated via PostgREST com a publishable key (pública por design).
-- Consequências:
--   • ingest_siconfi / ingest_transferegov / ingest_inpe_queimadas: permitiam
--     INSERT de entidades arbitrárias na base (data poisoning).
--   • ingest_driver_step: permitia acionar o pipeline pago (InfoSimples/migrate)
--     e disparar net.http_post em loop (DoS de custo).
--
-- Estas funções devem ser executáveis APENAS por service_role (Edge Functions)
-- e pelo cron (pg_cron). service_role NÃO é afetado por estes REVOKEs.
--
-- get_vault_secret já estava fechada em produção; o REVOKE abaixo versiona a
-- intenção (defesa em profundidade) e evita regressão em re-provisionamentos.

revoke execute on function public.ingest_driver_step(text)     from public, anon, authenticated;
revoke execute on function public.ingest_siconfi(jsonb)        from public, anon, authenticated;
revoke execute on function public.ingest_transferegov(jsonb)   from public, anon, authenticated;
revoke execute on function public.ingest_inpe_queimadas(jsonb) from public, anon, authenticated;
revoke execute on function public.get_vault_secret(text)       from public, anon, authenticated;
