-- Drop public listing policy on photos bucket.
-- Rationale: storage.objects SELECT policy 'photos_anon_select' with USING (bucket_id='photos')
-- allows anon clients to enumerate all files in the bucket. The app only calls
-- getPublicUrl, upload, and remove(by path) via src/services/supabaseStorage.js —
-- it never calls .list(). The bucket remains public, so direct-URL access via
-- getPublicUrl keeps working.
-- Precedent: same fix applied to Toranot's question-images bucket on 2026-04-21.

DROP POLICY IF EXISTS "photos_anon_select" ON storage.objects;
