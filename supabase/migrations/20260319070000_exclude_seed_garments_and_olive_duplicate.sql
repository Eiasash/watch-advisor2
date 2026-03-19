-- Exclude all seed garments (w_ prefix) — no photos, superseded by photo-uploaded versions.
-- 53 seed garments exist; all excluded in this pass.
UPDATE garments
SET exclude_from_wardrobe = true
WHERE id LIKE 'w_%'
  AND (exclude_from_wardrobe IS NOT TRUE);

-- Exclude the older Olive Knit Zip Jacket duplicate (keep the newer one g_1773169011458_nij7k).
UPDATE garments
SET exclude_from_wardrobe = true
WHERE id = 'g_1773168990895_augrn';
