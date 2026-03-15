/**
 * Scoring weights and exponents for the outfit scoring engine.
 * All weights imported by src/outfitEngine/scoring.js.
 * Change here → affects entire engine. Do not inline copies elsewhere.
 */

// Additive weights — final score = (colorMatch × W) + (formalityMatch × W) + ...
export const SCORE_WEIGHTS = {
  colorMatch:          2,
  formalityMatch:      3,
  watchCompatibility:  3,
  weatherLayer:        1,
  contextFormality:    1,
};

// Style-learning soft multiplier range (never overrides hard constraints)
export const STYLE_LEARN = {
  min: 0.85,
  max: 1.15,
};
