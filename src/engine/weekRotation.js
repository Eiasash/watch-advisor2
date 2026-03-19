import { scoreWatchForDay } from "./dayProfile.js";
import { recentWatchIds } from "../domain/historyWindow.js";

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/**
 * Generate 7-day watch rotation.
 * Returns array of 7 { dayName, date, ctx, watch, backup, onCall } objects.
 *
 * @param {Array}  watches    - full watch collection
 * @param {Array}  history    - wear history entries
 * @param {Array}  weekCtx    - 7 context strings, index 0=Sun
 * @param {Array}  onCallDates - ["YYYY-MM-DD",...] on-call days
 */
export function genWeekRotation(watches, history = [], weekCtx = [], onCallDates = []) {
  if (!watches.length) return [];

  const active = watches.filter(w => w.status === "active" || !w.status);
  if (!active.length) return [];

  // Build recent-wear set to favour unworn pieces (calendar-day window)
  const recentIds = recentWatchIds(history, 14);

  const today  = new Date();
  const result = [];
  const usedIds = new Set(); // avoid repeating the same watch across 7 days

  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    const dayIdx = d.getDay(); // 0=Sun
    const dateKey = d.toISOString().slice(0, 10);
    const ctx = weekCtx[dayIdx] ?? "smart-casual";
    const isOnCall = onCallDates.includes(dateKey);
    const effectiveCtx = isOnCall ? "shift" : ctx;

    // For today: if already logged, lock to the logged watch.
    // The rotation should never second-guess what you actually chose today.
    if (offset === 0) {
      const todayEntry = history.find(h => h.date === dateKey && h.watchId);
      if (todayEntry) {
        const loggedWatch = active.find(w => w.id === todayEntry.watchId);
        if (loggedWatch) {
          usedIds.add(loggedWatch.id);
          result.push({
            offset, dayName: DAY_NAMES[dayIdx], date: dateKey,
            ctx: effectiveCtx, isOnCall, watch: loggedWatch,
            backup: null, isLoggedToday: true,
          });
          continue;
        }
      }
    }

    // Score all active watches for this context
    const scored = active
      .map(w => ({
        w,
        score: scoreWatchForDay(w, effectiveCtx, history)
              + (recentIds.has(w.id) ? -2 : 0)
              + (usedIds.has(w.id) ? -3 : 0),
      }))
      .sort((a, b) => b.score - a.score);

    const primary = scored[0]?.w ?? null;
    const backup  = scored[1]?.w ?? null;

    if (primary) usedIds.add(primary.id);

    result.push({
      offset,
      dayName: DAY_NAMES[dayIdx],
      date: dateKey,
      ctx: effectiveCtx,
      isOnCall,
      watch: primary,
      backup,
    });
  }

  return result;
}
