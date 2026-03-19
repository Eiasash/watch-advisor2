-- Restore olive quarter-zip Gant sweater (excluded during dedup incorrectly)
UPDATE garments SET exclude_from_wardrobe = false
WHERE id = 'g_1773169203624_uwz1z';

-- Correct its metadata: quarter-zip, Gant, olive
UPDATE garments SET
  name    = 'Olive Green Quarter-Zip Knit Sweater',
  color   = 'olive',
  brand   = 'Gant',
  subtype = 'quarter-zip'
WHERE id = 'g_1773169203624_uwz1z';

-- Rename grey shirt to grey melange Rosenöbel (correct brand/name)
UPDATE garments SET
  name  = 'Grey Melange Jersey Shirt',
  brand = 'Rosenöbel',
  color = 'grey'
WHERE id = 'g_1773169098961_de9s7';

-- Restore stone dress trousers (Kiral PNT-5050) excluded as seed dupe
UPDATE garments SET
  exclude_from_wardrobe = false,
  name  = 'Stone Dress Trousers (Kiral PNT-5050)',
  color = 'stone',
  brand = 'Kiral'
WHERE id = 'g_1773177558140_j65uo';

-- Brand Geox brown lace-up Oxford shoes
UPDATE garments SET brand = 'Geox'
WHERE id = 'g_1773168996440_gk2f4';
