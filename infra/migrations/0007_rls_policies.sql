-- =============================================================================
-- Migration: 0007_rls_policies.sql
-- Purpose:   Row-Level Security policies for tables that had RLS enabled
--            but no policies defined yet.
--
-- IMPORTANT — TEXT vs UUID mismatch:
--   Supabase's auth.uid() returns UUID, but account_id and created_by columns
--   in this schema are TEXT. Every comparison must cast: auth.uid()::text
--   Omitting the cast causes a type mismatch and the policy silently rejects
--   all rows (returns empty set) rather than raising an error.
--
-- service_role:
--   Already granted full table access in 0001_core_schema.sql and bypasses
--   RLS by default in Supabase — no extra policies needed for it here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- INDEXES (only for columns without existing indexes)
-- 0001 already created: idx_alerts_account_status ON alerts(account_id, status)
-- Missing: entitlements.account_id, usage_events.account_id
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_entitlements_account_id
    ON entitlements (account_id);

CREATE INDEX IF NOT EXISTS idx_usage_events_account_id
    ON usage_events (account_id);

-- ---------------------------------------------------------------------------
-- GRANTS — allow authenticated users to SELECT from these tables
-- (INSERT/UPDATE/DELETE policies are defined below where applicable)
-- ---------------------------------------------------------------------------

GRANT SELECT ON entitlements  TO authenticated;
GRANT SELECT ON usage_events  TO authenticated;
GRANT SELECT ON alerts        TO authenticated;
GRANT SELECT ON alert_events  TO authenticated;
GRANT SELECT ON dossiers      TO authenticated;

-- =============================================================================
-- TABLE: entitlements
-- =============================================================================

DROP POLICY IF EXISTS "entitlements_select_own" ON entitlements;
CREATE POLICY "entitlements_select_own"
    ON entitlements
    FOR SELECT
    TO authenticated
    USING (account_id = auth.uid()::text);

-- =============================================================================
-- TABLE: usage_events
-- =============================================================================

DROP POLICY IF EXISTS "usage_events_select_own" ON usage_events;
CREATE POLICY "usage_events_select_own"
    ON usage_events
    FOR SELECT
    TO authenticated
    USING (account_id = auth.uid()::text);

DROP POLICY IF EXISTS "usage_events_insert_own" ON usage_events;
CREATE POLICY "usage_events_insert_own"
    ON usage_events
    FOR INSERT
    TO authenticated
    WITH CHECK (account_id = auth.uid()::text);

-- =============================================================================
-- TABLE: alerts
-- =============================================================================

DROP POLICY IF EXISTS "alerts_select_own" ON alerts;
CREATE POLICY "alerts_select_own"
    ON alerts
    FOR SELECT
    TO authenticated
    USING (account_id = auth.uid()::text);

DROP POLICY IF EXISTS "alerts_insert_own" ON alerts;
CREATE POLICY "alerts_insert_own"
    ON alerts
    FOR INSERT
    TO authenticated
    WITH CHECK (account_id = auth.uid()::text);

DROP POLICY IF EXISTS "alerts_update_own" ON alerts;
CREATE POLICY "alerts_update_own"
    ON alerts
    FOR UPDATE
    TO authenticated
    USING (account_id = auth.uid()::text)
    WITH CHECK (account_id = auth.uid()::text);

DROP POLICY IF EXISTS "alerts_delete_own" ON alerts;
CREATE POLICY "alerts_delete_own"
    ON alerts
    FOR DELETE
    TO authenticated
    USING (account_id = auth.uid()::text);

-- =============================================================================
-- TABLE: alert_events
-- alert_events has no direct account_id column — ownership is determined by
-- joining through alerts.  The subquery checks that the parent alert belongs
-- to the authenticated user.
-- =============================================================================

DROP POLICY IF EXISTS "alert_events_select_own" ON alert_events;
CREATE POLICY "alert_events_select_own"
    ON alert_events
    FOR SELECT
    TO authenticated
    USING (
        alert_id IN (
            SELECT id
            FROM alerts
            WHERE account_id = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "alert_events_insert_own" ON alert_events;
CREATE POLICY "alert_events_insert_own"
    ON alert_events
    FOR INSERT
    TO authenticated
    WITH CHECK (
        alert_id IN (
            SELECT id
            FROM alerts
            WHERE account_id = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "alert_events_delete_own" ON alert_events;
CREATE POLICY "alert_events_delete_own"
    ON alert_events
    FOR DELETE
    TO authenticated
    USING (
        alert_id IN (
            SELECT id
            FROM alerts
            WHERE account_id = auth.uid()::text
        )
    );

-- =============================================================================
-- TABLE: dossiers
-- Ownership is tracked via created_by (TEXT), not account_id.
-- Same TEXT vs UUID cast rule applies.
-- =============================================================================

DROP POLICY IF EXISTS "dossiers_select_own" ON dossiers;
CREATE POLICY "dossiers_select_own"
    ON dossiers
    FOR SELECT
    TO authenticated
    USING (created_by = auth.uid()::text);

DROP POLICY IF EXISTS "dossiers_insert_own" ON dossiers;
CREATE POLICY "dossiers_insert_own"
    ON dossiers
    FOR INSERT
    TO authenticated
    WITH CHECK (created_by = auth.uid()::text);

DROP POLICY IF EXISTS "dossiers_update_own" ON dossiers;
CREATE POLICY "dossiers_update_own"
    ON dossiers
    FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid()::text)
    WITH CHECK (created_by = auth.uid()::text);

DROP POLICY IF EXISTS "dossiers_delete_own" ON dossiers;
CREATE POLICY "dossiers_delete_own"
    ON dossiers
    FOR DELETE
    TO authenticated
    USING (created_by = auth.uid()::text);
