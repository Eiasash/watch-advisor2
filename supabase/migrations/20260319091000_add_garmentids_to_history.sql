-- Add garmentIds to history entries that were logged watch-only.

-- Mar 19 Laureato clinic: grey melange shirt + brick cable knit + navy chinos + tan Eccos
UPDATE history SET payload = jsonb_set(
  payload, '{garmentIds}',
  '["g_1773169098961_de9s7","g_1773169194500_uyzod","g_1773606000942_d3ka5","g_1773168921553_0guwf"]'
) WHERE id = 'wear-2026-03-19-laureato';

-- Mar 16 BB41 on-call: olive quarter-zip + stone dress trousers + tan Eccos + camel jacket
UPDATE history SET payload = jsonb_set(
  payload, '{garmentIds}',
  '["g_1773169203624_uwz1z","g_1773177558140_j65uo","g_1773168921553_0guwf","g_1773169108194_dztr2"]'
) WHERE id = 'wear-2026-03-16-blackbay';

-- Mar 15 GMT evening: beige bomber + olive quarter-zip + dark brown cords + Geox boots
-- (logged via manual INSERT earlier today)
UPDATE history SET payload = jsonb_set(
  payload, '{outfit,sweater}',
  '"Olive Green Quarter-Zip Knit Sweater (Gant)"'
) WHERE id = 'wear-2026-03-15-gmt';
