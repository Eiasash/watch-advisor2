-- Reconciled from remote schema_migrations history (version 20260510034738).
-- This migration was applied to the live DB but missing from the repo, causing
-- the Supabase "Remote migration versions not found in local" check to fail.

UPDATE history
SET payload = jsonb_set(payload, '{strapId}', '"rikka-bracelet"'::jsonb, false)
WHERE payload->>'strapId' IN ('rikka-titanium-bracelet', 'rikka-bracelet-ss');

DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM history
  WHERE payload->>'strapId' IN ('rikka-titanium-bracelet', 'rikka-bracelet-ss');

  IF remaining > 0 THEN
    RAISE WARNING 'alias_legacy_rikka_strap_ids: % rows still reference legacy IDs after UPDATE', remaining;
  ELSE
    RAISE NOTICE 'alias_legacy_rikka_strap_ids: legacy Rikka strap IDs cleared from history';
  END IF;
END $$;
