-- Audit fixes: March 21 2026
-- 1. Normalize invalid context 'hospital-smart-casual' → 'smart-casual'
UPDATE history 
SET payload = jsonb_set(payload, '{context}', '"smart-casual"'::jsonb)
WHERE id = 'today-1773811189012' AND payload->>'context' = 'hospital-smart-casual';

-- 2. Set missing material on Coral Shirt (Greg Norman)
UPDATE garments SET material = 'cotton' WHERE id = 'g_manual_pink_greg_norman_shirt' AND material IS NULL;
