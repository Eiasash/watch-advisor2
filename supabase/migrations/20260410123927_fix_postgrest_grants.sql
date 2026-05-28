-- Reconciled from remote schema_migrations history (version 20260410123927).
-- This migration was applied to the live DB but missing from the repo, causing
-- the Supabase "Remote migration versions not found in local" check to fail.

-- Restore PostgREST grants lost during migration
GRANT SELECT, INSERT, UPDATE, DELETE ON public.garments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.history TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_config TO anon, authenticated;
GRANT SELECT, INSERT ON public.errors TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
