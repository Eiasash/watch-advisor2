-- Reconciled from remote schema_migrations history (version 20260319121948).
-- This migration was applied to the live DB but missing from the repo, causing
-- the Supabase "Remote migration versions not found in local" check to fail.

-- Restore photo-uploaded olive half-zip sweater — excluded during dedup but is a real distinct garment
UPDATE garments SET exclude_from_wardrobe = false
WHERE id = 'g_1773169203624_uwz1z';
