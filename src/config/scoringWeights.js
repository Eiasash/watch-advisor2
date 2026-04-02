/**
 * Scoring weights and exponents for the outfit scoring engine.
 * All weights imported by src/outfitEngine/scoring.js.
 * Change here → affects entire engine. Do not inline copies elsewhere.
 */

// Additive weights — final score = (colorMatch × W) + (formalityMatch × W) + ...
//
// v2 rebalance (March 2026):
//   colorMatch: 2→2.5 — dial color pairing is the primary visual differentiator
//               of a watch-first app. Too low made formality dominate over visual impact.
//   contextFormality: 1.5→0.5 — rigid context buckets were forcing outfit choices.
//                    Most wears defaulted to "smart-casual" because nothing else fit.
//                    Reduced to soft signal: weather + rotation + color now drive selection.
//   formalityMatch + watchCompatibility unchanged — already well-calibrated at 3.
export const SCORE_WEIGHTS = {
  colorMatch:          2.5,
  formalityMatch:      3,
  watchCompatibility:  3,
  weatherLayer:        1,
  contextFormality:    0.5,
};

// Style-learning soft multiplier range (never overrides hard constraints)
export const STYLE_LEARN = {
  min: 0.85,
  max: 1.15,
};
