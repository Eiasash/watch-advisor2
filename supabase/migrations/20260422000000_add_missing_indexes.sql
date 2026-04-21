-- Indexes flagged by the 2026-04-22 audit.
--
-- 1. garments.exclude_from_wardrobe — read on every wardrobe query to filter
--    out dupes / seed / outfit-photos. Partial index on TRUE rows only
--    because the vast majority of rows are FALSE; a full index would waste
--    space and slow INSERTs.
--
-- 2. history(watch_id, date DESC) — used by the rotation engine
--    (`SELECT ... FROM history WHERE watch_id = ? ORDER BY date DESC LIMIT N`)
--    and by auto-heal (last-N-entries-per-watch). Without it, these scan the
--    whole table.

create index if not exists garments_excluded_idx
  on public.garments (exclude_from_wardrobe)
  where exclude_from_wardrobe is true;

create index if not exists history_watch_date_idx
  on public.history (watch_id, date desc);
