-- Migration: Add redemption limits and expiration to TESTE1 coupon
-- Reason: The TESTE1 coupon was created with unbounded max_redemptions (NULL)
--         and no expiration date. This poses a risk of uncontrolled discount
--         usage. This migration safely adds reasonable limits retroactively.
--
-- Idempotency: Only updates if max_redemptions IS NULL to allow safe re-runs.
--             This prevents overwriting legitimate future updates to the coupon.

UPDATE coupons
SET
  max_redemptions = 50,
  expires_at = now() + interval '90 days'
WHERE
  code = 'TESTE1'
  AND max_redemptions IS NULL;
