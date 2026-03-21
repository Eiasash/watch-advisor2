-- Exclude 7 duplicate garments found during March 21 2026 audit.
-- Using exclude_from_wardrobe = true (never hard-delete).
--
-- 1. "Cream sweater" → dupe of "Cream Knit Sweater"
-- 2. "Tan Cable Knit Sweater" → dupe of "Camel Cable Knit Crewneck"
-- 3. "Tan pants" → dupe of "Tan Flat Front Chinos"
-- 4. "Textured Knit Sweater" → dupe of "Camel Cable Knit Crewneck"
-- 5. "Yellow Striped Button Shirt" → dupe of "Yellow Striped Shirt (Gant)"
-- 6. "Plaid Button-Up Shirt" → dupe of "Blue Plaid Flannel Shirt"
-- 7. "Cognac Leather Brogue Shoes" → dupe of "Cognac Shoes (Geox)"

UPDATE garments SET exclude_from_wardrobe = true
WHERE id IN (
  'g_1773169002745_p29bl',
  'g_1773169185562_ekk86',
  'g_1773168937789_vr246',
  'g_1773177580659_qzfuc',
  'g_1773169098297_zfnhb',
  'g_1773169104276_ukaxb',
  'g_1773169195353_yhk43'
);
