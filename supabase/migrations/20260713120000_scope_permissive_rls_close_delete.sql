-- Close permissive-RLS holes flagged by Supabase security advisor (lint 0024).
-- watch-advisor2 isolated project oaojkanozbfpofbewtfq.
--
-- Two tables carried `FOR ALL USING(true) WITH CHECK(true)` policies granting the
-- public (anon + authenticated) role full CRUD -- including DELETE -- via the
-- shipped anon key. This scopes each to exactly the commands the app actually uses:
--   * app_settings      : client does select + upsert (insert/update). No delete.
--   * push_subscriptions: touched ONLY by Netlify functions via the service-role key
--                         (which bypasses RLS). The client never queries it directly,
--                         so the anon policy is pure attack surface -> drop it.
-- Idempotent: DROP ... IF EXISTS before each CREATE so re-application (repo migration
-- runner) is a no-op. service_role continues to bypass RLS for server writes.

-- ---- app_settings: replace permissive FOR ALL with scoped policies (no DELETE) ----
DROP POLICY IF EXISTS allow_all_authenticated ON public.app_settings;
DROP POLICY IF EXISTS app_settings_anon_select ON public.app_settings;
DROP POLICY IF EXISTS app_settings_anon_insert ON public.app_settings;
DROP POLICY IF EXISTS app_settings_anon_update ON public.app_settings;
CREATE POLICY app_settings_anon_select ON public.app_settings FOR SELECT USING (true);
CREATE POLICY app_settings_anon_insert ON public.app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY app_settings_anon_update ON public.app_settings FOR UPDATE USING (true) WITH CHECK (true);

-- ---- push_subscriptions: server-only via service_role -> drop permissive anon policy ----
-- RLS stays enabled; with no policy, anon/authenticated get deny-all while the
-- service-role Netlify functions (push-brief, push-subscribe) continue to work.
DROP POLICY IF EXISTS allow_all_push ON public.push_subscriptions;

-- ---- Harden SECURITY DEFINER helpers: revoke EXECUTE from anon/authenticated ----
-- Trigger/util functions should not be RPC-callable by public roles (advisor lint 0028/0029).
-- Trigger functions still fire as table owner regardless of EXECUTE grant.
REVOKE EXECUTE ON FUNCTION public.set_updated_at_user_snapshots() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;

-- ---- errors: was publicly READABLE via misnamed service_read_errors policy ----
-- The SELECT policy targeted {public} (qual=true) despite its name, exposing the
-- error-telemetry log to anyone with the anon key. Nothing in client or server reads
-- `errors` via supabase; it is insert-only (anon_insert_errors). Restrict SELECT to
-- service_role so only server/admin can read the log. anon INSERT is unchanged.
ALTER POLICY service_read_errors ON public.errors TO service_role;
