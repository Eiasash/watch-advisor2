-- app_settings: single-row table for cross-device settings sync.
-- Stores weekCtx, onCallDates, active straps, and custom strap definitions.
-- pullSettings / pushSettings in supabaseSync.js read/write the 'default' row.

CREATE TABLE IF NOT EXISTS public.app_settings (
  id            text PRIMARY KEY DEFAULT 'default',
  week_ctx      jsonb,
  on_call_dates jsonb,
  active_straps jsonb,
  custom_straps jsonb,
  updated_at    timestamptz DEFAULT now()
);

-- Seed the default row so upsert never needs to INSERT
INSERT INTO public.app_settings (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow_all_authenticated" ON public.app_settings
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
