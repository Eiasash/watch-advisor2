-- Reconciled from remote schema_migrations history (version 20260319122036).
-- This migration was applied to the live DB but missing from the repo, causing
-- the Supabase "Remote migration versions not found in local" check to fail.

UPDATE garments
SET 
  name = 'Olive Green Quarter-Zip Knit Sweater',
  color = 'olive',
  brand = 'Gant',
  subtype = 'quarter-zip'
WHERE id = 'g_1773169203624_uwz1z';
