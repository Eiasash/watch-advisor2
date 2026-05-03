-- Migration: extend RLS policies on garments + history + app_config from
-- {anon} to {anon, authenticated}.
--
-- Reason: GitHub OAuth sign-in (introduced 2026-05-03 PR #138) flips the
-- request role from `anon` to `authenticated`. The pre-auth-gate policies
-- were scoped TO anon only, so the moment a user signed in every garment
-- write hit "new row violates row-level security policy" — visible in
-- DebugConsole as the 200+ pushGarment warnings on first sign-in attempt.
--
-- Same allow-all behavior, both roles covered. Single-user app — there is
-- no per-user RLS enforcement intended; the email allowlist enforced by
-- _auth.js (ALLOWED_USER_EMAIL env var, checked at every browser-callable
-- function) handles user identity. RLS here is just structural plumbing,
-- not access control.
--
-- The "9 RLS-always-true lints" Supabase advisors emit are intentional —
-- documented in our auto-memory under project_watchadvisor2_supabase.
-- This migration intentionally preserves that posture for both roles.
--
-- Postgres doesn't allow `ALTER POLICY ... TO role`, so each policy is
-- DROPped + CREATEd. Wrapped in DROP IF EXISTS so re-running is safe.

-- ── garments ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS anon_select_garments ON public.garments;
DROP POLICY IF EXISTS anon_insert_garments ON public.garments;
DROP POLICY IF EXISTS anon_update_garments ON public.garments;
DROP POLICY IF EXISTS anon_delete_garments ON public.garments;

CREATE POLICY allow_select_garments ON public.garments
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_insert_garments ON public.garments
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY allow_update_garments ON public.garments
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_delete_garments ON public.garments
  FOR DELETE TO anon, authenticated USING (true);

-- ── history ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS anon_select_history ON public.history;
DROP POLICY IF EXISTS anon_insert_history ON public.history;
DROP POLICY IF EXISTS anon_update_history ON public.history;
DROP POLICY IF EXISTS anon_delete_history ON public.history;

CREATE POLICY allow_select_history ON public.history
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_insert_history ON public.history
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY allow_update_history ON public.history
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_delete_history ON public.history
  FOR DELETE TO anon, authenticated USING (true);

-- ── app_config ───────────────────────────────────────────────────────────
-- Only the SELECT policy was anon-scoped. Writes already use service_role
-- (via Netlify functions) and that policy stays unchanged.
DROP POLICY IF EXISTS anon_read_app_config ON public.app_config;
CREATE POLICY allow_read_app_config ON public.app_config
  FOR SELECT TO anon, authenticated USING (true);
