-- Applied 2026-03-11 via Supabase MCP (remote-first)

-- 1. Delete duplicate outfit-photos
DELETE FROM garments WHERE id IN (
  'g_1773180562059_px3zk','g_1773180561668_tolj1','g_1773180561192_zdxzt',
  'g_1773180546252_b12if','g_1773180545855_mvggt'
);

-- 2. Delete misclassified first-pass garments
DELETE FROM garments WHERE id IN (
  'g_1773177575565_yiv3n','g_1773177577296_uzvb9',
  'g_1773177578844_o2oul','g_1773177580313_kufwc'
);

-- 3. Exclude watch-type garments from wardrobe scoring
UPDATE garments SET exclude_from_wardrobe = true
WHERE id IN (
  'g_1773224702524_69i5q','g_1773169071099_jww7m','g_1773169079680_e4e6c'
);

-- 4. Fix Black Elastic Waist Shorts color: navy -> black
UPDATE garments SET color = 'black' WHERE id = 'g_1773224666434_2s07g';

-- 5. Flag mystery tan accessory for review
UPDATE garments SET needs_review = true WHERE id = 'g_1773169025564_t4x15';
