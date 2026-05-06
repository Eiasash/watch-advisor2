-- Extend storage.objects policies to the `authenticated` role.
--
-- Companion to 20260506050000_restore_photos_anon_select_for_upsert.sql.
-- That migration restored the four anon policies. This one adds the same
-- four for `authenticated` role with an email allowlist gate.
--
-- WHY:
--   The auth gate enabled in v1.13.7 means browser sessions sign in via
--   Supabase Auth and switch the supabase-js client from `anon` role to
--   `authenticated`. Without explicit `authenticated`-role policies on
--   storage.objects, signed-in browsers fail every storage write —
--   even though the pre-existing anon policies would have allowed them.
--
--   This was a latent issue masked while no one was actually signed in
--   (everything fell through to anon). Surfaced 2026-05-06 during the
--   storage RLS audit triggered by the v1.13.15 upsert bug.
--
-- WHAT:
--   Four `authenticated`-role policies (SELECT/INSERT/UPDATE/DELETE) on
--   the photos bucket, each gated by `auth.jwt()->>'email'` against the
--   single-user allowlist literal — matching the pattern from migration
--   20260504052807_rls_email_restricted.sql for public.garments and
--   public.history.
--
-- DESIGN — defense in depth:
--   The same email is enforced at three layers:
--     1. Netlify functions: ALLOWED_USER_EMAIL env var (_auth.js)
--     2. public.garments / public.history RLS: hard-coded literal
--     3. storage.objects (this migration): hard-coded literal
--   Three-layer redundancy means a single misconfig (env var typo, accidental
--   RLS widening, function bypass) can't expose the data. The literal must
--   stay in sync with 20260504052807 — if you ever rotate the email, update
--   both migrations together.
--
-- RELATIONSHIP TO ANON POLICIES:
--   anon policies are kept (graceful degradation if a session signs out
--   mid-flow). PostgreSQL RLS evaluates policies per role: when a request
--   comes in as `authenticated`, only `authenticated` policies are checked.
--   The `anon` policies are not consulted simultaneously. So coexistence is
--   safe — neither role widens the other.

CREATE POLICY photos_authenticated_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'photos'::text
    AND (auth.jwt() ->> 'email') = 'eiasashhab@gmail.com'
  );

CREATE POLICY photos_authenticated_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'photos'::text
    AND (auth.jwt() ->> 'email') = 'eiasashhab@gmail.com'
  );

CREATE POLICY photos_authenticated_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'photos'::text
    AND (auth.jwt() ->> 'email') = 'eiasashhab@gmail.com'
  )
  WITH CHECK (
    bucket_id = 'photos'::text
    AND (auth.jwt() ->> 'email') = 'eiasashhab@gmail.com'
  );

CREATE POLICY photos_authenticated_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'photos'::text
    AND (auth.jwt() ->> 'email') = 'eiasashhab@gmail.com'
  );
