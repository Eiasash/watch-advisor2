-- Fix garment names, brands, and restore excluded items incorrectly swept during dedup.
-- Also backfills garmentIds into manually-logged history entries.

-- 1. Grey melange shirt: rename to match brand + add Rosenöbel brand
UPDATE garments SET
  name = 'Grey Melange Jersey Shirt',
  brand = 'Rosenöbel',
  color = 'grey'
WHERE id = 'g_1773169098961_de9s7';

-- 2. Olive quarter-zip: fix name (was logged as half-zip), confirm brand Gant
UPDATE garments SET
  name = 'Olive Green Quarter-Zip Knit Sweater',
  brand = 'Gant',
  color = 'olive',
  subtype = 'quarter-zip'
WHERE id = 'g_1773169203624_uwz1z';

-- 3. Restore stone dress trousers (Kiral PNT-5050) — incorrectly excluded as dupe of seed
UPDATE garments SET
  exclude_from_wardrobe = false,
  name = 'Stone Dress Trousers (Kiral PNT-5050)',
  color = 'stone',
  brand = 'Kiral'
WHERE id = 'g_1773177558140_j65uo';

-- 4. Brown Leather Oxford Shoes: brand = Geox (confirmed from photos)
UPDATE garments SET brand = 'Geox' WHERE id = 'g_1773168996440_gk2f4';

-- 5. Backfill garmentIds on Mar 19 Laureato clinic entry (manually logged, missing garmentIds)
-- Outfit: grey melange shirt + brick cable knit + navy chinos + tan Eccos
UPDATE history SET payload = jsonb_set(
  payload,
  '{garmentIds}',
  '["g_1773169098961_de9s7","g_1773169194500_uyzod","g_1773606000942_d3ka5","g_1773168921553_0guwf"]'::jsonb
)
WHERE id = 'wear-2026-03-19-laureato';

-- 6. Backfill garmentIds on Mar 16 BB41 on-call entry (manually logged, missing garmentIds)
-- Outfit: olive quarter-zip + stone dress trousers + tan Eccos + camel jacket
UPDATE history SET payload = jsonb_set(
  payload,
  '{garmentIds}',
  '["g_1773169203624_uwz1z","g_1773177558140_j65uo","g_1773168921553_0guwf","g_1773169108194_dztr2"]'::jsonb
)
WHERE id = 'wear-2026-03-16-blackbay';
