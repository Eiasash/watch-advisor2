-- Restore olive quarter-zip sweater (Gant) — excluded during bulk dedup, is a real garment.
UPDATE garments SET exclude_from_wardrobe = false
WHERE id = 'g_1773169203624_uwz1z';

-- Log GMT-Master II wear on Mar 15 evening (smart-casual, beige bomber + olive quarter-zip + dark brown cords + Geox boots)
INSERT INTO history (id, watch_id, date, payload, created_at)
VALUES (
  'wear-2026-03-15-gmt',
  'gmt',
  '2026-03-15',
  '{
    "context": "smart-casual",
    "outfit": {
      "jacket": "Tan Zip Bomber Jacket (Kiral beige/stone)",
      "sweater": "Olive Green Quarter-Zip Knit Sweater (Gant)",
      "pants": "Dark Brown Corduroy Pants",
      "shoes": "Brown Leather Oxford Shoes (Geox)"
    },
    "garmentIds": [
      "g_1773169016572_b0mtv",
      "g_1773169203624_uwz1z",
      "g_1773168902914_qwpsw",
      "g_1773168996440_gk2f4"
    ],
    "strap": "Steel Oyster bracelet",
    "strapId": "gmt-oyster",
    "strapLabel": "Steel Oyster bracelet",
    "notes": "Evening out. Beige Kiral bomber over Gant olive quarter-zip. Dark brown cords. Geox brown lace-up boots. GMT on Oyster.",
    "score": 8.0,
    "loggedAt": "2026-03-19T14:00:00.000Z"
  }'::jsonb,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload;
