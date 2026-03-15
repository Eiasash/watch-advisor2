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
 */

import colorFactor       from "./colorFactor.js";
import formalityFactor   from "./formalityFactor.js";
import diversityFactor   from "./diversityFactor.js";
import repetitionFactor  from "./repetitionFactor.js";
import rotationFactor    from "./rotationFactor.js";

export const scoringFactors = [
  colorFactor,
  formalityFactor,
  diversityFactor,
  repetitionFactor,
  rotationFactor,
];

/**
 * Register an additional factor at runtime.
 * @param {Function} fn — (candidate, context) → number
 */
export function registerFactor(fn) {
  scoringFactors.push(fn);
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
  for (const factor of scoringFactors) {
    score += factor(candidate, context);
  }
  return score;
}
