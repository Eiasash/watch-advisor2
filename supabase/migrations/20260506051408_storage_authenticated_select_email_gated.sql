-- Reconciled from remote schema_migrations history (version 20260506051408).
-- This migration was applied to the live DB but missing from the repo, causing
-- the Supabase "Remote migration versions not found in local" check to fail.

-- Only the SELECT policy is missing — INSERT/UPDATE/DELETE already applied
-- earlier in this session. Idempotent re-creation of all four would have
-- failed on duplicates, so apply just the missing one.
CREATE POLICY photos_authenticated_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'photos'::text
    AND (auth.jwt() ->> 'email') = 'eiasashhab@gmail.com'
  );
