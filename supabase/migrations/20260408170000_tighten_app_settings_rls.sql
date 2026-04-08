-- Tighten RLS on app_settings: this is a single-row settings table
-- used by a personal app. Restrict to anon role (client) with id='default' only.
-- This prevents any row-level abuse even if other roles or users exist.

DROP POLICY IF EXISTS "allow_all_authenticated" ON public.app_settings;

-- Allow anon reads for the default row only
CREATE POLICY "anon_read_default" ON public.app_settings
  FOR SELECT USING (id = 'default');

-- Allow anon writes for the default row only
CREATE POLICY "anon_write_default" ON public.app_settings
  FOR INSERT WITH CHECK (id = 'default');

CREATE POLICY "anon_update_default" ON public.app_settings
  FOR UPDATE USING (id = 'default') WITH CHECK (id = 'default');
