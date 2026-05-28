-- Reconciled from remote schema_migrations history (version 20260506044721).
-- This migration was applied to the live DB but missing from the repo, causing
-- the Supabase "Remote migration versions not found in local" check to fail.

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
