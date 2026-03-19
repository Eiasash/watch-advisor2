import { scoreWatchForDay } from "./dayProfile.js";
import { recentWatchIds } from "../domain/historyWindow.js";

/**
 * Basic rotation: avoid watches worn in the last 7 calendar days.
 * Day-profile-aware when profile is supplied.
 */
export function pickWatch(watches, history = [], dayProfile = "smart-casual") {
  if (!watches.length) return null;

  const recentIds = recentWatchIds(history, 7);
  const fresh = watches.filter(w => !recentIds.has(w.id));
  const pool = fresh.length ? fresh : watches;

  const scored = pool
    .map(w => ({ watch: w, score: scoreWatchForDay(w, dayProfile, history) }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.watch ?? null;
}

/**
 * Returns primary + backup pair.
 */
export function pickWatchPair(watches, history = [], dayProfile = "smart-casual") {
  if (!watches.length) return { primary: null, backup: null };

  const recentIds = recentWatchIds(history, 7);
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
