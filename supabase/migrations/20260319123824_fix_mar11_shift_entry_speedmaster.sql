-- Reconciled from remote schema_migrations history (version 20260319123824).
-- This migration was applied to the live DB but missing from the repo, causing
-- the Supabase "Remote migration versions not found in local" check to fail.

-- Mar 11 shift entry: was logged under rikka but user switched to Speedmaster.
-- Fix watch_id and add garments: olive quarter-zip + stone trousers + tan Eccos.
-- NATO strap (navy/white/orange striped) per the note about "nato brown belt" context.
UPDATE history
SET
  watch_id = 'speedmaster',
  payload  = payload
    || '{"garmentIds": ["g_1773169203624_uwz1z","g_1773177558140_j65uo","g_1773168921553_0guwf"]}'::jsonb
    || '{"strap": "Navy/white/orange striped NATO", "strapId": "speedmaster-nato", "strapLabel": "Navy/white/orange striped NATO", "notes": "Switched from Rikka (morning) to Speedmaster on NATO for shift. Olive quarter-zip Gant + stone Kiral trousers + tan Eccos.", "score": 7.5}'::jsonb
WHERE id = 'today-1773226367279';
