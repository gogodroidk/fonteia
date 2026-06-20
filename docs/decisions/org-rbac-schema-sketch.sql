-- ============================================================
-- RASCUNHO NÃO APLICÁVEL — ORG RBAC SCHEMA SKETCH
-- ============================================================
-- Status: PROPOSTA — aguardando aprovação do Igor
-- Data: 2026-06-20
--
-- AVISO: Este arquivo é para revisão de arquitetura.
-- NÃO execute em produção. NÃO mova para infra/migrations/.
-- Qualquer aplicação exige aprovação explícita + security review.
-- ============================================================
--
-- CONTEXTO
-- --------
-- Hoje o sistema é estritamente 1 usuário = 1 conta. O account_id nas
-- tabelas core (dossiers, alerts, entitlements, usage_events) é TEXT
-- contendo auth.uid()::text. A assinatura Stripe é vinculada por email
-- ou user_id (ambos TEXT/UUID diretamente em public.subscriptions).
--
-- Este rascunho propõe uma camada de organização (multi-seat) que:
--   1. Cria uma identidade de org independente do usuário individual.
--   2. Mantém compatibilidade com o schema existente via colunas opcionais
--      (org_id nullable) para evitar quebra durante a migração gradual.
--   3. Substitui a relação Stripe user_id/email → Stripe org_id na Fase 2.
--
-- PLANO DE FASES (referência para o design abaixo)
--   Fase 0: criar organizations pessoais (1:1 com cada auth.users existente)
--            + backfill de organization_members com role='owner'.
--            Sem alteração visível no produto.
--   Fase 1: adicionar org_id nas tabelas core; backfill a partir do member
--            owner; nova escrita já grava org_id.
--   Fase 2: my_plan() lê por org_id; RLS migra de account_id para org_id;
--            planos corporativos passam a ser da org, não do usuário.
--
-- ATENÇÃO: As políticas RLS das tabelas existentes (dossiers, alerts, etc.)
-- NÃO são alteradas aqui — documentadas separadamente na Fase 2.
-- ============================================================


-- ============================================================
-- PARTE 1: NOVAS TABELAS
-- ============================================================


-- ------------------------------------------------------------
-- organizations
-- ------------------------------------------------------------
-- Representa uma conta de cliente da Fonte.ia, que pode ter 1 ou
-- mais membros. Na Fase 0 toda org é pessoal (1 membro = owner).
-- Na Fase 2, orgs corporativas (price_1ThjhR4zjAI9pGd7UyBOlctV)
-- podem ter múltiplos membros com papéis distintos.
--
-- Nota sobre plan_id: campo redundante com subscriptions.plan_id
-- presente como cache de leitura rápida — a fonte da verdade é
-- sempre public.subscriptions (e o Stripe por trás dela).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nome de exibição da organização (ex.: "Escritório Martins & Lima").
  -- Para orgs pessoais criadas na Fase 0, usar o full_name do perfil.
  name               TEXT        NOT NULL,

  -- Slug único para uso em URL e referência interna (ex.: "martins-lima").
  -- Gerado na criação; imutável após definido (ou requer redirect).
  slug               TEXT        NOT NULL UNIQUE,

  -- Usuário que criou a org. NULL para orgs criadas por seed/backfill.
  created_by         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Cache local do plano ativo. Atualizado pelo stripe-webhook Worker
  -- nos mesmos eventos que atualizam public.subscriptions.
  -- Valores válidos: 'free' | 'pro' | 'corporativo'
  plan_id            TEXT        NOT NULL DEFAULT 'free',

  -- Customer ID do Stripe vinculado à org (não ao usuário individual).
  -- Na Fase 0, migrar o stripe_customer_id do usuário owner para cá.
  -- UNIQUE porque um customer Stripe pertence a uma única org.
  stripe_customer_id TEXT        UNIQUE,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Busca de org por slug (rota de URL: /org/:slug).
CREATE INDEX IF NOT EXISTS idx_organizations_slug
  ON public.organizations (slug);

-- Listagem de orgs criadas por um usuário (painel admin).
CREATE INDEX IF NOT EXISTS idx_organizations_created_by
  ON public.organizations (created_by);

-- Trigger updated_at — mesmo padrão de subscriptions.
-- RASCUNHO: criar função set_organizations_updated_at() antes de aplicar.


-- ------------------------------------------------------------
-- organization_members
-- ------------------------------------------------------------
-- Vínculo entre um usuário e uma org. Um usuário pode ser membro
-- de mais de uma org (ex.: freelancer com acesso a dois escritórios),
-- mas cada par (org_id, user_id) é único.
--
-- Papéis:
--   owner  — acesso total + pode deletar a org; toda org deve ter ≥1.
--   admin  — pode convidar/remover members; não pode deletar a org.
--   member — acesso de leitura aos dados da org; sem permissões admin.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Org à qual o usuário pertence. CASCADE: se a org for deletada,
  -- os membros são removidos automaticamente.
  org_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Usuário membro. CASCADE: se o usuário deletar a conta, o vínculo
  -- de membro some sem deixar linhas órfãs.
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Papel do membro nesta org (ver comentário acima).
  role        TEXT        NOT NULL CHECK (role IN ('owner', 'admin', 'member')),

  -- Quem convidou este usuário. NULL para membros criados por backfill.
  invited_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Quando o convite foi aceito / quando o usuário entrou na org.
  -- Para backfill Fase 0: usar created_at do auth.users correspondente.
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Garante que um usuário só aparece uma vez por org.
  UNIQUE (org_id, user_id)
);

-- Lookup principal: dado um user_id, quais orgs ele pertence?
-- Usado na RLS para identificar as orgs visíveis ao usuário corrente.
CREATE INDEX IF NOT EXISTS idx_org_members_user_id
  ON public.organization_members (user_id);

-- Lookup inverso: dado um org_id, listar todos os membros.
CREATE INDEX IF NOT EXISTS idx_org_members_org_id
  ON public.organization_members (org_id);

-- Filtro de papel (ex.: WHERE role = 'owner' para validações de integridade).
CREATE INDEX IF NOT EXISTS idx_org_members_org_role
  ON public.organization_members (org_id, role);


-- ------------------------------------------------------------
-- organization_invites
-- ------------------------------------------------------------
-- Convites pendentes para novos membros. Um convite é criado por um
-- admin/owner e tem validade de 7 dias. Ao ser aceito, gera uma linha
-- em organization_members e preenche accepted_at.
--
-- A constraint UNIQUE parcial garante que não existam dois convites
-- pendentes para o mesmo email na mesma org simultaneamente — mas
-- permite reenviar após aceite ou expiração do anterior.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Org para a qual o convite é válido.
  org_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Email do convidado (pode ou não ter conta na Fonte.ia ainda).
  email       TEXT        NOT NULL,

  -- Papel que o convidado terá ao aceitar. Owner não pode ser convidado
  -- (transferência de ownership é operação separada).
  role        TEXT        NOT NULL CHECK (role IN ('admin', 'member')),

  -- Token de uso único enviado no link de convite.
  -- Gerado com gen_random_bytes(32) → hex para 64 chars de entropia alta.
  token       TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- Quem enviou o convite (admin ou owner da org).
  invited_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Convites expiram em 7 dias por padrão. Pode ser estendido por admin.
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),

  -- Preenchido quando o convidado clica no link e aceita. NULL = pendente.
  accepted_at TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Impede convites duplicados pendentes para o mesmo email+org.
  -- A condição WHERE accepted_at IS NULL permite reenvio após aceite.
  UNIQUE (org_id, email) DEFERRABLE INITIALLY DEFERRED
  -- RASCUNHO: avaliar se a UNIQUE parcial abaixo é preferível à DEFERRABLE:
  -- EXCLUDE usando índice parcial WHERE accepted_at IS NULL (ver índice abaixo)
);

-- Lookup por token (verificação de convite na landing page de aceite).
CREATE INDEX IF NOT EXISTS idx_org_invites_token
  ON public.organization_invites (token);

-- Índice parcial de convites ativos: acelera a constraint de duplicidade
-- e queries como "mostrar convites pendentes da minha org".
CREATE INDEX IF NOT EXISTS idx_org_invites_pending
  ON public.organization_invites (org_id, email)
  WHERE accepted_at IS NULL;

-- Lookup para limpar/exibir histórico de convites de uma org.
CREATE INDEX IF NOT EXISTS idx_org_invites_org_id
  ON public.organization_invites (org_id, created_at DESC);


-- ============================================================
-- PARTE 2: ALTERAÇÕES NAS TABELAS EXISTENTES
-- ============================================================
-- FASE 1 — Adicionar org_id como coluna opcional (nullable).
-- Nullable por design: permite rollback sem perda de dados e evita
-- bloquear escritas existentes antes do backfill estar completo.
--
-- AVISO DE BACKFILL NECESSÁRIO:
--   Após aplicar cada ALTER TABLE, executar o script da Parte 5
--   para popular org_id com a org pessoal do owner correspondente.
--   Somente após validação (queries da Parte 6) tornar NOT NULL.
-- ============================================================

-- RASCUNHO — ALTER TABLE — FASE 1
-- NÃO executar antes do backfill da Fase 0 estar completo e validado.

-- dossiers: owned por created_by (TEXT = auth.uid()::text).
-- Backfill: org_id = organizations.id WHERE organizations.created_by::text = dossiers.created_by
--           JOIN organization_members ON user_id = dossiers.created_by::uuid AND role = 'owner'
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
-- RASCUNHO: índice após backfill
-- CREATE INDEX idx_dossiers_org_id ON public.dossiers (org_id);

-- alerts: owned por account_id (TEXT = auth.uid()::text).
-- Backfill: mesma lógica de dossiers (account_id → owner da org pessoal).
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
-- RASCUNHO: CREATE INDEX idx_alerts_org_id ON public.alerts (org_id);

-- entitlements: owned por account_id (TEXT).
-- Na Fase 2, entitlements passam a ser da org, não do usuário individual.
-- Backfill: idem alerts.
ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
-- RASCUNHO: CREATE INDEX idx_entitlements_org_id ON public.entitlements (org_id);

-- usage_events: owned por account_id (TEXT). Mantém user_id TEXT para
-- rastreabilidade individual dentro de uma org multi-seat.
-- Backfill: idem alerts.
ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
-- RASCUNHO: CREATE INDEX idx_usage_events_org_id ON public.usage_events (org_id);

-- external_lookups: owned por requested_by (UUID). A trava de gasto mensal
-- continuará por provider, mas na Fase 2 pode ser escalonada por org.
-- Backfill: org_id via organization_members WHERE user_id = external_lookups.requested_by
--           ORDER BY joined_at LIMIT 1 (pega a primeira org do usuário).
ALTER TABLE public.external_lookups
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
-- RASCUNHO: CREATE INDEX idx_external_lookups_org_id ON public.external_lookups (org_id);

-- subscriptions: a coluna org_id aqui é o ponto central da Fase 2.
-- Na Fase 2, a policy "Users can read their own subscription" (0002_stripe_subscriptions)
-- muda de (email = auth.email() OR user_id = auth.uid()) para
-- org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()).
--
-- NOTA: org_id substitui user_id/email como chave de relação com o Stripe.
-- O stripe-webhook Worker passará a gravar org_id em vez de (ou além de) email+user_id.
-- ATENÇÃO: não remover email/user_id existentes antes da Fase 2 estar totalmente validada.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
-- RASCUNHO: UNIQUE INDEX após backfill (uma assinatura por org):
-- CREATE UNIQUE INDEX idx_subscriptions_org_id ON public.subscriptions (org_id)
--   WHERE org_id IS NOT NULL AND status IN ('active', 'trialing');


-- ============================================================
-- PARTE 3: RLS PROPOSTA PARA AS NOVAS TABELAS
-- ============================================================
-- Apenas organizations e organization_members são documentadas aqui.
-- As políticas das tabelas existentes (dossiers, alerts, etc.) que
-- incorporam org_id são parte da Fase 2 e documentadas separadamente.
--
-- Convenção mantida do projeto:
--   - auth.uid() retorna UUID; comparações com text exigem ::text cast.
--   - service_role ignora RLS — sem políticas para service_role.
--   - Funções auxiliares SECURITY DEFINER usadas para subqueries de
--     membro (evita recursão de RLS em self-join).
-- ============================================================

-- RASCUNHO: habilitar RLS nas novas tabelas (já ativado por rls_auto_enable,
-- mas explicitando para clareza da migration).
-- ALTER TABLE public.organizations          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.organization_members   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.organization_invites   ENABLE ROW LEVEL SECURITY;

-- RASCUNHO: grants mínimos
-- REVOKE ALL ON public.organizations        FROM anon, authenticated;
-- REVOKE ALL ON public.organization_members FROM anon, authenticated;
-- REVOKE ALL ON public.organization_invites FROM anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE ON public.organizations        TO authenticated;
-- GRANT SELECT, INSERT, DELETE ON public.organization_members TO authenticated;
-- GRANT SELECT, INSERT         ON public.organization_invites TO authenticated;


-- ------------------------------------------------------------
-- RASCUNHO: função auxiliar para subqueries de membership
-- (evita recursão quando a policy de organizations faz JOIN em
-- organization_members que também tem policy)
-- ------------------------------------------------------------
-- RASCUNHO:
-- CREATE OR REPLACE FUNCTION public.my_org_ids()
--   RETURNS SETOF UUID
--   LANGUAGE sql
--   STABLE SECURITY DEFINER
--   SET search_path TO 'public'
-- AS $$
--   SELECT org_id
--   FROM public.organization_members
--   WHERE user_id = auth.uid();
-- $$;
-- REVOKE EXECUTE ON FUNCTION public.my_org_ids() FROM PUBLIC, anon;
-- GRANT  EXECUTE ON FUNCTION public.my_org_ids() TO authenticated;


-- ------------------------------------------------------------
-- RASCUNHO: policies — organizations
-- ------------------------------------------------------------

-- Membro lê sua própria org.
-- RASCUNHO:
-- DROP POLICY IF EXISTS "org_select_member" ON public.organizations;
-- CREATE POLICY "org_select_member"      -- RASCUNHO
--   ON public.organizations
--   FOR SELECT
--   TO authenticated
--   USING (id IN (SELECT public.my_org_ids()));

-- Somente owner pode atualizar a org (nome, slug, etc.).
-- RASCUNHO:
-- DROP POLICY IF EXISTS "org_update_owner" ON public.organizations;
-- CREATE POLICY "org_update_owner"       -- RASCUNHO
--   ON public.organizations
--   FOR UPDATE
--   TO authenticated
--   USING (
--     id IN (
--       SELECT org_id FROM public.organization_members
--       WHERE user_id = auth.uid() AND role = 'owner'
--     )
--   )
--   WITH CHECK (
--     id IN (
--       SELECT org_id FROM public.organization_members
--       WHERE user_id = auth.uid() AND role = 'owner'
--     )
--   );

-- INSERT: qualquer authenticated pode criar uma org (para orgs pessoais na Fase 0
-- o backfill faz via service_role; usuários criam orgs corporativas via UI na Fase 2).
-- RASCUNHO: avaliar se deve ser restrito a um RPC SECURITY DEFINER em vez de policy direta.
-- DROP POLICY IF EXISTS "org_insert_authenticated" ON public.organizations;
-- CREATE POLICY "org_insert_authenticated"  -- RASCUNHO
--   ON public.organizations
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (created_by = auth.uid());

-- DELETE: somente owner, e apenas se for a única org do usuário ou
-- se houver outro owner (para evitar org órfã). Recomendado: usar RPC
-- SECURITY DEFINER em vez de policy para encapsular essa lógica.
-- RASCUNHO: sem policy de DELETE por ora — apenas via service_role ou RPC.


-- ------------------------------------------------------------
-- RASCUNHO: policies — organization_members
-- ------------------------------------------------------------

-- Membro vê outros membros da mesma org.
-- RASCUNHO:
-- DROP POLICY IF EXISTS "org_members_select_same_org" ON public.organization_members;
-- CREATE POLICY "org_members_select_same_org"   -- RASCUNHO
--   ON public.organization_members
--   FOR SELECT
--   TO authenticated
--   USING (org_id IN (SELECT public.my_org_ids()));

-- Admin ou owner pode adicionar membros.
-- RASCUNHO:
-- DROP POLICY IF EXISTS "org_members_insert_admin" ON public.organization_members;
-- CREATE POLICY "org_members_insert_admin"       -- RASCUNHO
--   ON public.organization_members
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (
--     org_id IN (
--       SELECT org_id FROM public.organization_members
--       WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
--     )
--   );

-- Somente o próprio membro pode sair (DELETE sua própria linha).
-- Admin/owner removem outros via RPC SECURITY DEFINER (não via policy direta).
-- RASCUNHO:
-- DROP POLICY IF EXISTS "org_members_delete_self" ON public.organization_members;
-- CREATE POLICY "org_members_delete_self"        -- RASCUNHO
--   ON public.organization_members
--   FOR DELETE
--   TO authenticated
--   USING (user_id = auth.uid());


-- ------------------------------------------------------------
-- RASCUNHO: policies — organization_invites
-- ------------------------------------------------------------

-- Admin ou owner vê convites da org.
-- RASCUNHO:
-- DROP POLICY IF EXISTS "org_invites_select_admin" ON public.organization_invites;
-- CREATE POLICY "org_invites_select_admin"        -- RASCUNHO
--   ON public.organization_invites
--   FOR SELECT
--   TO authenticated
--   USING (
--     org_id IN (
--       SELECT org_id FROM public.organization_members
--       WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
--     )
--   );

-- Admin ou owner pode criar convites.
-- RASCUNHO:
-- DROP POLICY IF EXISTS "org_invites_insert_admin" ON public.organization_invites;
-- CREATE POLICY "org_invites_insert_admin"        -- RASCUNHO
--   ON public.organization_invites
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (
--     org_id IN (
--       SELECT org_id FROM public.organization_members
--       WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
--     )
--     AND invited_by = auth.uid()
--   );

-- NOTA: aceitação de convite deve ocorrer via RPC SECURITY DEFINER
-- (valida token, verifica expiração, insere em organization_members,
-- atualiza accepted_at) — não via policy direta de UPDATE.


-- ============================================================
-- PARTE 4: RPC PROPOSTA my_plan_v2()
-- ============================================================
-- RASCUNHO: substitui public.my_plan() na Fase 2.
--
-- Diferença principal: my_plan() busca por email/user_id do usuário corrente
-- diretamente em subscriptions. my_plan_v2() resolve primeiro a org ativa do
-- usuário e então busca a assinatura da org.
--
-- Parâmetro p_org_id:
--   - Se NULL: usa a org_id do JWT claim 'active_org' (a ser adicionado
--     no token via hook de auth na Fase 2). Fallback: primeira org do usuário.
--   - Se informado: valida que o usuário é membro antes de retornar.
--
-- Retorno: { plan_id, status, trial, until, seats_used, seats_max }
--   seats_used  = COUNT(*) de organization_members WHERE org_id = v_org_id
--   seats_max   = 1 para plano pro; configurável para corporativo (padrão: 5).
-- ============================================================

-- RASCUNHO:
-- CREATE OR REPLACE FUNCTION public.my_plan_v2(p_org_id UUID DEFAULT NULL)
--   RETURNS jsonb
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path TO 'public'
-- AS $$
-- DECLARE
--   v_uid        UUID        := auth.uid();
--   v_org_id     UUID;
--   v_plan       TEXT;
--   v_status     TEXT;
--   v_until      TIMESTAMPTZ;
--   v_trial      TIMESTAMPTZ;
--   v_seats_used INTEGER;
--   v_seats_max  INTEGER     := 1;
-- BEGIN
--   IF v_uid IS NULL THEN
--     RETURN jsonb_build_object('plan', 'free', 'status', 'anon', 'trial', false);
--   END IF;
--
--   -- Resolver org ativa: parâmetro explícito > JWT claim > primeira org do usuário.
--   v_org_id := COALESCE(
--     p_org_id,
--     (auth.jwt() ->> 'active_org')::uuid,  -- claim adicionado na Fase 2 via hook
--     (
--       SELECT org_id FROM public.organization_members
--       WHERE user_id = v_uid
--       ORDER BY joined_at ASC
--       LIMIT 1
--     )
--   );
--
--   IF v_org_id IS NULL THEN
--     -- Usuário sem org (pré-Fase 0) — fallback para comportamento de my_plan().
--     RETURN public.my_plan();
--   END IF;
--
--   -- Verificar que o usuário é membro da org solicitada.
--   IF NOT EXISTS (
--     SELECT 1 FROM public.organization_members
--     WHERE org_id = v_org_id AND user_id = v_uid
--   ) THEN
--     RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
--   END IF;
--
--   -- Buscar assinatura da org.
--   SELECT plan_id, status, current_period_end
--     INTO v_plan, v_status, v_until
--   FROM public.subscriptions
--   WHERE org_id = v_org_id
--     AND status IN ('active', 'trialing', 'past_due')
--   ORDER BY current_period_end DESC NULLS LAST
--   LIMIT 1;
--
--   -- Trial via cupom (mantém compatibilidade com coupon_redemptions por ora).
--   SELECT MAX(granted_until) INTO v_trial
--   FROM public.coupon_redemptions
--   WHERE user_id = v_uid AND granted_until > now();
--
--   -- Contar membros ativos da org.
--   SELECT COUNT(*) INTO v_seats_used
--   FROM public.organization_members
--   WHERE org_id = v_org_id;
--
--   -- seats_max: 1 para pro, 5 para corporativo (ajustar conforme produto).
--   IF COALESCE(v_plan, 'free') = 'corporativo' THEN
--     v_seats_max := 5;
--   END IF;
--
--   IF (v_plan IS NULL OR v_plan = 'free') AND v_trial IS NOT NULL THEN
--     RETURN jsonb_build_object(
--       'plan', 'pro', 'status', 'trial', 'trial', true, 'until', v_trial,
--       'seats_used', v_seats_used, 'seats_max', v_seats_max
--     );
--   END IF;
--
--   RETURN jsonb_build_object(
--     'plan',       COALESCE(v_plan, 'free'),
--     'status',     COALESCE(v_status, 'free'),
--     'trial',      false,
--     'until',      v_until,
--     'seats_used', v_seats_used,
--     'seats_max',  v_seats_max
--   );
-- END;
-- $$;
--
-- RASCUNHO: revogar de anon após criar
-- REVOKE EXECUTE ON FUNCTION public.my_plan_v2(UUID) FROM PUBLIC, anon;
-- GRANT  EXECUTE ON FUNCTION public.my_plan_v2(UUID) TO authenticated;


-- ============================================================
-- PARTE 5: SCRIPT DE BACKFILL PROPOSTO — FASE 0
-- ============================================================
-- Cria orgs pessoais (1:1 com auth.users) para todos os usuários
-- que ainda não têm org. Deve ser executado na Fase 0 antes de
-- qualquer migration de ALTER TABLE.
--
-- IMPORTANTE: rodar em staging primeiro. Validar contagens (Parte 6)
-- antes de executar em produção.
--
-- Este script é idempotente: a CTE org_insert usa ON CONFLICT DO NOTHING
-- com o unique index em slug, e member_insert verifica a existência
-- do vínculo antes de inserir.
-- ============================================================

-- RASCUNHO — SCRIPT DE BACKFILL FASE 0
-- Executar via psql com service_role ou pelo Supabase MCP execute_sql.
-- NÃO colocar em infra/migrations/ sem aprovação explícita.

/*
WITH

-- Passo 1: Identificar todos os usuários que ainda não têm org.
-- Usa LEFT JOIN em organization_members para detectar ausência.
users_sem_org AS (
  SELECT
    u.id         AS user_id,
    u.email,
    p.full_name,
    u.created_at AS user_created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  -- Exclui usuários que já são membros de qualquer org.
  WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = u.id
  )
),

-- Passo 2: Gerar slug único a partir do email (parte antes do @).
-- Sufixo de 4 chars do UUID para evitar colisões entre emails similares.
slug_candidatos AS (
  SELECT
    user_id,
    email,
    full_name,
    user_created_at,
    -- Ex.: "joao.silva-a1b2" para joao.silva@exemplo.com
    lower(
      regexp_replace(
        split_part(email, '@', 1),
        '[^a-z0-9]', '-', 'g'
      )
    ) || '-' || substr(gen_random_uuid()::text, 1, 4)  AS slug
  FROM users_sem_org
),

-- Passo 3: Inserir organizations pessoais.
-- created_by = user_id; nome = full_name ou email se sem nome.
org_insert AS (
  INSERT INTO public.organizations (name, slug, created_by, plan_id)
  SELECT
    COALESCE(NULLIF(TRIM(full_name), ''), email) AS name,
    slug,
    user_id AS created_by,
    'free'  AS plan_id
  FROM slug_candidatos
  ON CONFLICT (slug) DO NOTHING  -- slug já existe: ignorar (reprocessar manualmente)
  RETURNING id AS org_id, created_by AS user_id
),

-- Passo 4: Inserir o vínculo de ownership.
-- Todo usuário criado via backfill é owner da sua org pessoal.
member_insert AS (
  INSERT INTO public.organization_members (org_id, user_id, role, invited_by, joined_at)
  SELECT
    oi.org_id,
    oi.user_id,
    'owner',
    NULL,                           -- backfill: sem "convidado por"
    u.created_at                    -- joined_at retroativo = criação da conta
  FROM org_insert oi
  JOIN auth.users u ON u.id = oi.user_id
  ON CONFLICT (org_id, user_id) DO NOTHING
  RETURNING org_id, user_id
)

-- Passo 5: Relatório de execução (quantas orgs e membros inseridos).
SELECT
  (SELECT COUNT(*) FROM org_insert)    AS orgs_criadas,
  (SELECT COUNT(*) FROM member_insert) AS membros_inseridos;
*/


-- ============================================================
-- PARTE 6: QUERIES DE VALIDAÇÃO
-- ============================================================
-- Executar após cada fase do backfill para confirmar integridade.
-- Todos os resultados esperados estão nos comentários acima de cada query.
-- ============================================================

-- RASCUNHO — queries de validação (SELECT puro, sem efeitos colaterais).

-- V1. Usuários sem org pessoal (deve ser 0 após Fase 0 completa).
/*
SELECT COUNT(*) AS users_sem_org
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.user_id = u.id
);
-- Esperado: 0
*/

-- V2. Linhas com org_id NULL nas tabelas core (deve ser 0 após Fase 1 backfill).
-- Executar tabela por tabela; adaptar colunas de owner conforme necessário.
/*
SELECT 'dossiers'     AS tabela, COUNT(*) AS sem_org FROM public.dossiers     WHERE org_id IS NULL
UNION ALL
SELECT 'alerts',                 COUNT(*) AS sem_org FROM public.alerts        WHERE org_id IS NULL
UNION ALL
SELECT 'entitlements',           COUNT(*) AS sem_org FROM public.entitlements  WHERE org_id IS NULL
UNION ALL
SELECT 'usage_events',           COUNT(*) AS sem_org FROM public.usage_events  WHERE org_id IS NULL
UNION ALL
SELECT 'external_lookups',       COUNT(*) AS sem_org FROM public.external_lookups WHERE org_id IS NULL
UNION ALL
SELECT 'subscriptions',          COUNT(*) AS sem_org FROM public.subscriptions  WHERE org_id IS NULL;
-- Esperado: 0 para todas as tabelas após Fase 1 + backfill completo.
-- Antes do backfill: número igual ao total de linhas (todas NULL).
*/

-- V3. Orgs sem exatamente 1 owner (não deve existir nenhuma; integridade crítica).
-- Uma org sem owner é órfã; mais de um owner é possível por design (transferência),
-- mas uma org com 0 owners indica erro no backfill ou deleção indevida.
/*
SELECT
  o.id         AS org_id,
  o.name,
  o.slug,
  COUNT(om.id) AS owner_count
FROM public.organizations o
LEFT JOIN public.organization_members om
  ON om.org_id = o.id AND om.role = 'owner'
GROUP BY o.id, o.name, o.slug
HAVING COUNT(om.id) <> 1
ORDER BY owner_count, o.created_at;
-- Esperado: 0 linhas retornadas.
*/

-- V4. Subscriptions ativas/trialing sem org_id após Fase 1 backfill.
-- Subscriptions com status relevante e org_id ainda NULL = usuários pagantes
-- que não tiveram a migração concluída; bloqueadores para desligar my_plan().
/*
SELECT
  id,
  email,
  user_id,
  plan_id,
  status,
  current_period_end
FROM public.subscriptions
WHERE org_id IS NULL
  AND status IN ('active', 'trialing', 'past_due')
ORDER BY current_period_end DESC;
-- Esperado: 0 linhas antes de promover my_plan_v2() para produção.
*/


-- ============================================================
-- FIM DO RASCUNHO
-- Para aplicar: aguardar aprovação em docs/decisions/org-rbac-multitenant.md
-- Próximo passo: security review antes de qualquer migration
-- ============================================================
