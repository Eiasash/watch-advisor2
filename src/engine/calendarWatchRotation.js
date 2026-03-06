import { inferDayProfile, scoreWatchForDay } from "./dayProfile.js";

/**
 * Pick a watch for today given calendar events, weather, and wear history.
 * Returns { primary, backup, dayProfile }.
 */
export function pickWatchForCalendar(watches, events = [], weather = {}, history = []) {
  if (!watches.length) return { primary: null, backup: null, dayProfile: "smart-casual" };

  const dayProfile = inferDayProfile(events, weather);

  const scored = watches
    .map(w => ({ watch: w, score: scoreWatchForDay(w, dayProfile, history) }))
    .sort((a, b) => b.score - a.score);

  const primary = scored[0]?.watch ?? watches[0];
  const backup = scored[1]?.watch ?? null;

  return { primary, backup, dayProfile };
}
