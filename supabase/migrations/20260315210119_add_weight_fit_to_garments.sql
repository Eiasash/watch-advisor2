-- Reconciled from remote schema_migrations history (version 20260315210119).
-- This migration was applied to the live DB but missing from the repo, causing
-- the Supabase "Remote migration versions not found in local" check to fail.

ALTER TABLE public.garments
  ADD COLUMN IF NOT EXISTS weight text,
  ADD COLUMN IF NOT EXISTS fit    text;
