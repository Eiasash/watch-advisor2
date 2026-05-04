-- Restrict garments + history RLS policies to a single owner email.
--
-- WHY:
--   The previous policy set (extended in 20260503222400) granted USING(true)
--   to both `anon` and `authenticated`. With auth gating now enforced at the
--   Netlify-function layer (_auth.js) and a single allowlisted user, the
--   row-level layer should match: only rows owned by that user (by JWT email
--   claim) should be readable/writable, even with a valid JWT.
--
--   This is a defense-in-depth measure — if a future migration accidentally
--   widens the allowlist, or a new function bypasses _auth.js, the database
--   itself still refuses unauthorized access.
--
-- WHAT:
--   1. Drop the 8 allow-all policies on garments + history.
--   2. Recreate as 8 email-restricted policies (4 per table: SELECT/INSERT/
--      UPDATE/DELETE) keyed on (auth.jwt()->>'email') = 'eiasashhab@gmail.com'.
--   3. app_config left alone — it stays world-readable for boot-time config
--      fetch, with writes still gated to service_role.
--
-- TRADE-OFF:
--   Anonymous (signed-out) browser sessions now see ZERO garments / ZERO
--   history rows. For this single-user app this is acceptable and intended
--   — it pushes the user to sign in. IndexedDB still caches the last-known
--   state for returning users; new sessions / cleared cache must sign in.
--
-- BYPASS:
--   service_role JWT bypasses RLS by Postgres convention; admin scripts
--   and edge functions using SERVICE_ROLE_KEY are unaffected.

DROP POLICY IF EXISTS allow_select_garments ON public.garments;
DROP POLICY IF EXISTS allow_insert_garments ON public.garments;
DROP POLICY IF EXISTS allow_update_garments ON public.garments;
DROP POLICY IF EXISTS allow_delete_garments ON public.garments;

DROP POLICY IF EXISTS allow_select_history ON public.history;
DROP POLICY IF EXISTS allow_insert_history ON public.history;
DROP POLICY IF EXISTS allow_update_history ON public.history;
DROP POLICY IF EXISTS allow_delete_history ON public.history;

CREATE POLICY user_select_garments ON public.garments
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'email') = 'eiasashhab@gmail.com');

CREATE POLICY user_insert_garments ON public.garments
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') = 'eiasashhab@gmail.com');

CREATE POLICY user_update_garments ON public.garments
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'email') = 'eiasashhab@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'eiasashhab@gmail.com');

CREATE POLICY user_delete_garments ON public.garments
  FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'email') = 'eiasashhab@gmail.com');

CREATE POLICY user_select_history ON public.history
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'email') = 'eiasashhab@gmail.com');

CREATE POLICY user_insert_history ON public.history
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') = 'eiasashhab@gmail.com');

CREATE POLICY user_update_history ON public.history
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'email') = 'eiasashhab@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'eiasashhab@gmail.com');

CREATE POLICY user_delete_history ON public.history
  FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'email') = 'eiasashhab@gmail.com');
