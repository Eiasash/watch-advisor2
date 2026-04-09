-- Seed tailor_config into app_config so pickupDate is no longer hardcoded
-- Garments picked up 2026-04-09 — pickupDate cleared
INSERT INTO app_config (key, value) VALUES
  ('tailor_config', '{}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
