/**
 * rotationStats — pure watch rotation analytics.
 *
 * All functions are stateless and derive from history entries already
 * stored in historyStore. No new persistence, no stores, no side effects.
 *
 * history entry shape: { watchId, date (YYYY-MM-DD), ... }
 */

/**
 * Days since a watch was last worn.
 * Returns Infinity when the watch has never been worn.
 */
export function daysIdle(watchId, history) {
  const wearDates = history
    .filter(h => h.watchId === watchId && h.date)
    .map(h => new Date(h.date.slice(0, 10)).getTime())
    .filter(ms => !isNaN(ms));

  if (!wearDates.length) return Infinity;

  const lastMs = Math.max(...wearDates);
  const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
  return Math.max(0, Math.floor((todayMs - lastMs) / 86_400_000));
}

/**
 * Total number of logged wear days for a watch.
 */
export function wearCount(watchId, history) {
  return history.filter(h => h.watchId === watchId).length;
}

/**
 * Most neglected genuine watch — highest daysIdle among non-replica pieces.
 * Returns null when watches or history is empty.
 */
export function neglectedGenuine(watches, history) {
  const genuine = watches.filter(w => !w.replica);
  if (!genuine.length) return null;

  let worst = null;
  let maxIdle = -1;

  for (const w of genuine) {
    const idle = daysIdle(w.id, history);
    if (idle > maxIdle) {
      maxIdle = idle;
      worst = w;
    }
  }

  return worst ? { watch: worst, idle: maxIdle } : null;
}

/**
 * Consecutive-day wear streak ending today or yesterday.
 * Uses outfit log dates — one entry per day is enough to extend the streak.
 */
export function wearStreak(history) {
  const uniqueDates = [...new Set(
    history.map(h => h.date?.slice(0, 10)).filter(Boolean)
  )].sort().reverse();

  if (!uniqueDates.length) return 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  let streak = 0;

  for (let offset = 0; offset <= 1; offset++) {
    // Allow today (offset=0) to be missing — don't break streak if not yet logged
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - offset);
    const startStr = checkDate.toISOString().slice(0, 10);
    if (!uniqueDates.includes(startStr) && offset === 0) continue;
    if (!uniqueDates.includes(startStr) && offset === 1) return 0;

    // Walk backwards from startStr counting consecutive days
    let expected = new Date(startStr);
    for (const d of uniqueDates) {
      const eStr = expected.toISOString().slice(0, 10);
      if (d === eStr) {
        streak++;
        expected.setDate(expected.getDate() - 1);
      } else if (d < eStr) {
        break;
      }
    }
    break;
  }

  return streak;
}

/**
 * Cost per wear for a watch, in ILS.
 * Returns null if the watch has no priceILS or has never been worn.
 */
export function watchCPW(watch, history) {
  if (!watch.priceILS) return null;
  const count = wearCount(watch.id, history);
  if (!count) return null;
  return Math.round(watch.priceILS / count);
}

/**
 * Full rotation table row for every watch.
 * Sorted by most idle first (Infinity = never worn sorts to top).
 */
export function buildRotationTable(watches, history) {
  return watches
    .map(w => ({
      watch: w,
      idle: daysIdle(w.id, history),
      count: wearCount(w.id, history),
      cpw: watchCPW(w, history),
    }))
    .sort((a, b) => {
      // Infinity sorts to top; among finite, higher idle first
      if (!isFinite(a.idle) && !isFinite(b.idle)) return 0;
      if (!isFinite(a.idle)) return -1;
      if (!isFinite(b.idle)) return 1;
      return b.idle - a.idle;
    });
}

/**
 * Smooth logistic rotation pressure curve.
 *
 * Returns a value in (0, 1) that rises gradually as a watch sits idle.
 *   daysIdle = 0  → ~0.02  (just worn — virtually no pressure)
 *   daysIdle = 14 → 0.50   (midpoint — moderate pressure)
 *   daysIdle = 28 → ~0.88  (month unworn — strong pressure)
 *   daysIdle = ∞  → 1.00   (asymptote)
 *
 * Returns 0 for non-finite input (Infinity handled by caller if desired).
 *
 * @param {number} daysIdle — output of daysIdle(), may be 0..∞
 * @returns {number} pressure in [0, 1)
 */
export function rotationPressure(daysIdleValue) {
  // v2 fix (March 2026): previously returned 0 for Infinity (never-worn garments).
  // This caused never-worn garments to receive zero rotation pressure, making them
  // permanently invisible to the rotation system. They would never cycle in or out —
  // the same garments kept winning because they had good base scores but no
  // rotation pressure countering them.
  // Fix: never-worn garments get 0.7 pressure (high, to encourage first wear,
  // but below the 1.0 ceiling so heavily-rested worn garments can beat them).
  if (!Number.isFinite(daysIdleValue) || daysIdleValue < 0) return 0.7;
  const midpoint  = 14;
  const steepness = 0.25;
  return 1 / (1 + Math.exp(-steepness * (daysIdleValue - midpoint)));
}

/**
 * Days since a garment was last worn, using garmentIds arrays in history entries.
 * History entries store worn garment IDs in `garmentIds` or `payload.garmentIds`.
 * Returns Infinity when the garment has never been worn.
 *
 * @param {string} garmentId
 * @param {Array}  history — historyStore entries
 * @returns {number}
 */
export function garmentDaysIdle(garmentId, history) {
  const wearDates = (history ?? [])
    .filter(h => {
      const ids = h.garmentIds ?? h.payload?.garmentIds ?? [];
      return ids.includes(garmentId);
    })
    .map(h => {
      const d = h.date?.slice(0, 10);
      return d ? new Date(d).getTime() : NaN;
    })
    .filter(ms => !isNaN(ms));

  if (!wearDates.length) return Infinity;

  const lastMs  = Math.max(...wearDates);
  const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
  return Math.max(0, Math.floor((todayMs - lastMs) / 86_400_000));
}

/**
 * Percentage of the collection that has been worn at least once.
 * Returns 0 for empty collections.
 *
 * @param {Array} watches — full watch collection
 * @param {Array} history — historyStore entries
 * @returns {number} integer 0–100
 */
export function utilizationScore(watches, history) {
  if (!Array.isArray(watches) || !watches.length) return 0;
  const watchIds = new Set(watches.map(w => w.id));
  const worn = new Set(
    history.map(h => h.watchId).filter(id => id && watchIds.has(id))
  );
  return Math.round((worn.size / watches.length) * 100);
}
