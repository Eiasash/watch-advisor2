import { scoreWatchForDay } from "./dayProfile.js";

/**
 * Basic rotation: avoid last-7 worn watches if alternatives exist.
 * Day-profile-aware when profile is supplied.
 */
export function pickWatch(watches, history = [], dayProfile = "smart-casual") {
  if (!watches.length) return null;

  const recentIds = new Set(history.slice(-7).map(h => h.watchId));
  const fresh = watches.filter(w => !recentIds.has(w.id));
  const pool = fresh.length ? fresh : watches;

  const scored = pool
    .map(w => ({ watch: w, score: scoreWatchForDay(w, dayProfile, history) }))
    .sort((a, b) => b.score - a.score);

  return scored[0].watch;
}

/**
 * Returns primary + backup pair.
 */
export function pickWatchPair(watches, history = [], dayProfile = "smart-casual") {
  if (!watches.length) return { primary: null, backup: null };

  const recentIds = new Set(history.slice(-7).map(h => h.watchId));
  const fresh = watches.filter(w => !recentIds.has(w.id));
  const pool = fresh.length ? fresh : watches;

  const scored = pool
    .map(w => ({ watch: w, score: scoreWatchForDay(w, dayProfile, history) }))
    .sort((a, b) => b.score - a.score);

  return {
    primary: scored[0]?.watch ?? null,
    backup: scored[1]?.watch ?? null,
  };
}
