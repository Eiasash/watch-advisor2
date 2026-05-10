-- 20260510143000_alias_legacy_rikka_strap_ids.sql
--
-- Normalize legacy Rikka strap IDs in history.payload to the canonical
-- `rikka-bracelet` ID. Two legacy variants existed:
--   * `rikka-titanium-bracelet` — misleading name (Rikka bracelet is steel,
--     Snowflake is the titanium GS). Originally the seed ID.
--   * `rikka-bracelet-ss` — alternate variant some history rows used.
--
-- Renamed in v1.13.40 alongside:
--   * src/data/watchSeed.js — seed ID changed to `rikka-bracelet`
--   * src/data/strapAliases.js — runtime alias map for stale IDB caches
--   * tests/watchSeedLegacyIds.test.js — drift guard for all three layers
--
-- Audit before applying (this migration is idempotent — safe to re-run):
--   SELECT
--     COUNT(*) FILTER (WHERE payload->>'strapId' = 'rikka-titanium-bracelet') AS old_titanium,
--     COUNT(*) FILTER (WHERE payload->>'strapId' = 'rikka-bracelet-ss')       AS old_ss,
--     COUNT(*) FILTER (WHERE payload->>'strapId' = 'rikka-bracelet')          AS canonical
--   FROM history;

UPDATE history
SET payload = jsonb_set(payload, '{strapId}', '"rikka-bracelet"'::jsonb, false)
WHERE payload->>'strapId' IN ('rikka-titanium-bracelet', 'rikka-bracelet-ss');

-- Verify zero legacy IDs remain. Use a notice rather than failing the migration
-- so re-runs on already-migrated DBs don't error.
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
