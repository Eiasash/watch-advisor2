/**
 * contextMemory — track recently worn garments to avoid repetition.
 *
 * Pure domain function. No React, Zustand, IDB, or Supabase.
 *
 * Note: outfitBuilder already applies diversityBonus() which penalises
 * garments proportionally to frequency over the last 5 entries.
 * repetitionPenalty() provides a flat binary signal — "worn at all recently"
 * — which complements frequency-based diversity without duplicating it.
 */

/** Number of most-recent history entries to consider as "recent" */
export const MEMORY_WINDOW = 5;

/**
 * Collect all garment IDs worn in the last MEMORY_WINDOW history entries.
 *
 * @param {Array|null} history
 * @returns {Set<string>}
 */
export function recentGarments(history) {
  if (!Array.isArray(history)) return new Set();

  const recent = history.slice(-MEMORY_WINDOW);
  const set = new Set();

  for (const entry of recent) {
    const ids = entry.garmentIds ?? entry.payload?.garmentIds ?? [];
    for (const id of ids) set.add(id);
  }

  return set;
}

/**
 * Flat repetition penalty for a single garment.
 * Returns -0.15 if the garment appears anywhere in the recent window, else 0.
 *
 * Kept smaller than diversityBonus's max (-0.60) so the combined signal
 * remains meaningful without eliminating valid garments.
 *
 * @param {string} garmentId
 * @param {Array}  history
 * @returns {number} 0 or -0.15
 */
export function repetitionPenalty(garmentId, history) {
  const recent = recentGarments(history);
  // v2 fix: penalty raised -0.15 → -0.28 so recently-worn garments
  // are meaningfully deprioritised vs never-worn ones in the rotation cycle.
  return recent.has(garmentId) ? -0.28 : 0;
}
