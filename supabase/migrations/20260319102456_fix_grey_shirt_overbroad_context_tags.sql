-- Reconciled from remote schema_migrations history (version 20260319102456).
-- This migration was applied to the live DB but missing from the repo, causing
-- the Supabase "Remote migration versions not found in local" check to fail.

-- Grey Button-Up Shirt was tagged "formal" which is wrong for a plain grey shirt.
-- Also tagged all 3 contexts making it win every scenario.
-- Fix: smart-casual only. All-season stays.
UPDATE garments
SET contexts = '["smart-casual"]'::jsonb
WHERE id = 'g_1773169098961_de9s7';
