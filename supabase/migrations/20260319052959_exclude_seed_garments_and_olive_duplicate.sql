-- Reconciled from remote schema_migrations history (version 20260319052959).
-- This migration was applied to the live DB but missing from the repo, causing
-- the Supabase "Remote migration versions not found in local" check to fail.

-- 1. Exclude all seed garments (w_ prefix) — no photos, superseded by photo-uploaded versions
UPDATE garments
SET exclude_from_wardrobe = true
WHERE id LIKE 'w_%'
  AND (exclude_from_wardrobe IS NOT TRUE);

-- 2. Exclude the older Olive Knit Zip Jacket duplicate (keep the newer one)
UPDATE garments
SET exclude_from_wardrobe = true
WHERE id = 'g_1773168990895_augrn';
