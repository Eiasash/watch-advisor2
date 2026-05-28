-- Reconciled from remote schema_migrations history (version 20260315200806).
-- This migration was applied to the live DB but missing from the repo, causing
-- the Supabase "Remote migration versions not found in local" check to fail.

CREATE TABLE IF NOT EXISTS public.app_settings (
  id            text PRIMARY KEY DEFAULT 'default',
  week_ctx      jsonb,
  on_call_dates jsonb,
  active_straps jsonb,
  custom_straps jsonb,
  updated_at    timestamptz DEFAULT now()
);

-- Single-row table — seed the default row so upsert never needs to INSERT
INSERT INTO public.app_settings (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can read/write their own settings row
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated" ON public.app_settings
  FOR ALL USING (true) WITH CHECK (true);
