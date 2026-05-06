-- Restore SELECT policy for anon on photos bucket.
--
-- WHY:
--   Migration 20260422210000 dropped 'photos_anon_select' to prevent
--   bucket-wide enumeration via .list(). However, this also broke:
--     1. uploadPhoto({ upsert: true }) in src/services/supabaseStorage.js
--        — Supabase Storage's UPSERT path requires SELECT to check for an
--        existing row before deciding INSERT vs UPDATE. With no SELECT
--        policy, anon UPSERT always returns "new row violates RLS policy".
--     2. deleteStoragePhoto() via .remove() — silently affects 0 rows
--        because the DELETE policy's USING clause cannot read existing rows
--        without SELECT, leaking orphaned objects in the bucket.
--
-- This was a real prod bug: both garment thumbnail re-uploads and deletions
-- have been silently broken since 2026-04-22 for anon sessions.
--
-- TRADE-OFF:
--   Re-enables .list() enumeration on the photos bucket. Acceptable because:
--     (a) bucket is public — every file is reachable via getPublicUrl by
--         anyone who can guess the path (paths are deterministic: garments/{id}/
--         and wear/{id}/).
--     (b) garment IDs and wear-history IDs are not secrets in this single-
--         user app.
--     (c) Functional requirement (working upsert/delete) outweighs the
--         marginal obscurity benefit.
--
-- ALTERNATIVE CONSIDERED:
--   Refactor uploadPhoto to do INSERT-then-detect-409-then-DELETE-then-retry.
--   Rejected because anon DELETE also depends on SELECT — verified by test:
--   .remove() returns success but actually affects zero rows.

CREATE POLICY "photos_anon_select" ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'photos');
