/**
 * Scoring factor registry.
 *
 * Factors are pure functions: (candidate, context) → number.
 * The pipeline sums all factor outputs. Hard gates (−Infinity, 0.0) in
 * the base scoreGarment call are propagated before factors run —
 * factors only operate on garments that already passed all hard gates.
 *
 * candidate shape: { garment, baseScore, ...scoreParts }
 * context  shape:  { watch, weather, history, preferenceWeights, filledColors, rejectState }
 *
 * Factors are NOT imported here — they are registered by outfitBuilder.js
 * at module initialisation time. This lets Rollup tree-shake any factor
 * that is never explicitly imported by the build graph.
 */

const _factors = [];

/**
 * Register a scoring factor.
 * Called by outfitBuilder.js; never by UI code.
 * @param {Function} fn — (candidate, context) → number
 */
export function registerFactor(fn) {
  _factors.push(fn);
}

/**
 * Apply all registered factors and return their summed contribution.
 * Does NOT include the baseScore — caller adds that separately.
 *
 * @param {{ garment, baseScore, colorScore?, formalityScore?, diversityBonus? }} candidate
 * @param {{ history, preferenceWeights, rejectState, filledColors? }}            context
 * @returns {number}
 */
export function applyFactors(candidate, context) {
  let score = 0;
  for (const factor of _factors) {
    score += factor(candidate, context);
  }
  return score;
}

/**
 * Read-only snapshot of currently registered factors.
 * Used by tests to verify registration state.
 */
export function getFactors() {
  return [..._factors];
}
