-- Reconciled from remote schema_migrations history (version 20260320051622).
-- This migration was applied to the live DB but missing from the repo, causing
-- the Supabase "Remote migration versions not found in local" check to fail.

ALTER TABLE history ADD COLUMN IF NOT EXISTS time_slot TEXT CHECK (time_slot IN ('morning','afternoon','evening','night'));
