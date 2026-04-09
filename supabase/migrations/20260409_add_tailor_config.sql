-- Seed tailor_config into app_config so pickupDate is no longer hardcoded
INSERT INTO app_config (key, value) VALUES
  ('tailor_config', '{"pickupDate":"2026-04-09"}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
