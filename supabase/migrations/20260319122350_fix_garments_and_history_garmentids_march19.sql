-- Reconciled from remote schema_migrations history (version 20260319122350).
-- This migration was applied to the live DB but missing from the repo, causing
-- the Supabase "Remote migration versions not found in local" check to fail.

-- 1. Rename grey shirt to grey melange Rosenöbel (the photo-uploaded version)
UPDATE garments SET 
  name = 'Grey Melange Jersey Shirt',
  brand = 'Rosenöbel',
  color = 'grey'
WHERE id = 'g_1773169098961_de9s7';

-- 2. Restore stone chinos (photo-uploaded, excluded as dupe of seed)
-- and rename properly as the Kiral PNT-5050 stone/beige dress trousers
UPDATE garments SET
  exclude_from_wardrobe = false,
  name = 'Stone Dress Trousers (Kiral PNT-5050)',
  color = 'stone',
  brand = 'Kiral'
WHERE id = 'g_1773177558140_j65uo';

-- 3. Add brand Geox to brown lace-up Oxford shoes
UPDATE garments SET brand = 'Geox' WHERE id = 'g_1773168996440_gk2f4';

-- 4. Add garmentIds to Mar 19 Laureato wear entry
UPDATE history SET payload = jsonb_set(
  payload,
  '{garmentIds}',
  '["g_1773169098961_de9s7","g_1773169194500_uyzod","g_1773606000942_d3ka5","g_1773168921553_0guwf"]'::jsonb
)
WHERE id = 'wear-2026-03-19-laureato';

-- 5. Add garmentIds to Mar 16 BB41 on-call wear entry
UPDATE history SET payload = jsonb_set(
  payload,
  '{garmentIds}',
  '["g_1773169203624_uwz1z","g_1773177558140_j65uo","g_1773168921553_0guwf","g_1773169108194_dztr2"]'::jsonb
)
WHERE id = 'wear-2026-03-16-blackbay';
