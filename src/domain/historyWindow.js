/**
 * Calendar-day-based history window utilities.
 *
 * Replaces the old pattern of `history.slice(-7)` which took the last N
 * entries regardless of when they occurred. The calendar-day approach
 * ensures a watch/garment worn 2 days ago is penalised even if 10 other
 * entries exist between then and now.
 *
 * Falls back to entry-count window when entries lack date fields
 * (backwards compatibility with legacy data).
 */

/**
 * Filter history entries to those from the last N calendar days.
 * @param {Array} history
 * @param {number} days - calendar days to look back (default 7)
 * @returns {Array} filtered entries
 */
export function recentHistory(history, days = 7) {
  if (!history?.length) return [];

  // Production path: entries have date fields → calendar-day window
  if (history.some(h => h.date)) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return history.filter(h => h.date && h.date >= cutoffStr);
  }

  // Fallback: last N entries (for entries without dates)
  return history.slice(-days);
}

/**
 * Set of watch IDs worn in the last N calendar days.
 * @param {Array} history
 * @param {number} days
 * @returns {Set<string>}
 */
export function recentWatchIds(history, days = 7) {
  return new Set(recentHistory(history, days).map(h => h.watchId));
}
