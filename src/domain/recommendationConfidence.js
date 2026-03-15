/**
 * recommendationConfidence — estimate recommendation reliability from score parts.
 *
 * Pure domain function. No React, Zustand, IDB, or Supabase.
 *
 * Distinct from outfitConfidence in src/outfitEngine/confidence.js which
 * operates on a full built outfit. This function operates on raw per-dimension
 * score fractions — useful for showing confidence on individual candidates.
 */

/**
 * Compute a [0, 1] confidence value from individual scoring dimensions.
 *
 * Weights reflect relative importance in the additive scoring model:
 *   formalityMatch: 0.35  (highest — formality mismatch is a strong signal)
 *   colorMatch:     0.25
 *   watchCompat:    0.25
 *   weatherLayer:   0.15
 *
 * @param {{ colorMatch?, formalityMatch?, watchCompat?, weatherLayer? } | null} scoreParts
 * @returns {number} confidence in [0, 1]
 */
export function recommendationConfidence(scoreParts) {
  if (!scoreParts) return 0;

  const {
    colorMatch    = 0,
    formalityMatch = 0,
    watchCompat   = 0,
    weatherLayer  = 0,
  } = scoreParts;

  const base =
    colorMatch     * 0.25 +
    formalityMatch * 0.35 +
    watchCompat    * 0.25 +
    weatherLayer   * 0.15;

  return Math.max(0, Math.min(1, base));
}
