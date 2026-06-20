-- 0018_cnpj_alfanumerico.sql
-- Suporte a CNPJ alfanumérico (IN RFB 2.229/2026, vigência 01/07/2026).
-- A partir desta data, os 12 primeiros caracteres do CNPJ podem ser [0-9A-Z].
-- Os 2 dígitos verificadores continuam numéricos [0-9].
--
-- Esta migration:
--   1. Cria public.sanitize_cnpj(text) → text: remove máscara, uppercase, 14 chars [0-9A-Z].
--   2. Cria public.validate_cnpj_format(text) → boolean: verifica formato ^[0-9A-Z]{12}[0-9]{2}$.
--   3. Adiciona comentário documentando que entities.cnpj aceita alfanumérico (sem CHECK rígido).
--
-- ATENÇÃO: as RPCs de ingestão legadas (ingest_ckan, ingest_portal_transparencia_sancoes, etc.)
-- ainda usam regexp_replace(cnpj, '\D', '', 'g') que REMOVE LETRAS de CNPJs alfanuméricos.
-- Essas RPCs devem ser atualizadas para usar public.sanitize_cnpj() em releases futuras.
-- O impacto antes de 01/07/2026 é zero (CNPJs atuais são puramente numéricos).

-- 1. Função de sanitização (equivalente ao sanitizeCnpj() do TypeScript).
create or replace function public.sanitize_cnpj(p_raw text)
returns text
language sql
immutable
returns null on null input
as $$
  select upper(regexp_replace(coalesce(p_raw, ''), '[.\-/ ]', '', 'g'))
$$;

-- 2. Função de validação de formato alfanumérico.
create or replace function public.validate_cnpj_format(p_cnpj text)
returns boolean
language sql
immutable
returns null on null input
as $$
  select p_cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'
$$;

-- 3. Comentário documentando a coluna cnpj em entities.
comment on column public.entities.cnpj is
  'CNPJ do sujeito. Formato: 14 chars alfanuméricos sem máscara. '
  'Desde 01/07/2026 (IN RFB 2.229/2026), os 12 primeiros chars podem ser [0-9A-Z]; '
  'os 2 dígitos verificadores continuam [0-9]. '
  'Não há CHECK constraint — aceita CNPJs numéricos legados e alfanuméricos novos. '
  'Use public.validate_cnpj_format(cnpj) para filtrar pelo formato alfanumérico.';

-- Revogar de public/anon/authenticated por segurança (só service_role usa diretamente).
revoke execute on function public.sanitize_cnpj(text) from public, anon, authenticated;
revoke execute on function public.validate_cnpj_format(text) from public, anon, authenticated;
