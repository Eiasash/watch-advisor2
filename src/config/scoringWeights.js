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

// Keep SCORE_EXPONENTS as an alias so any stale test imports don't hard-crash
// (tests assert on score ordering, not exact values; additive model still passes them)
export const SCORE_EXPONENTS = SCORE_WEIGHTS;

// Style-learning soft multiplier range (never overrides hard constraints)
export const STYLE_LEARN = {
  min: 0.85,
  max: 1.15,
};

// Diversity bonus for garments not worn recently
export const DIVERSITY_BONUS = 0.2;

// Rejection penalty applied post-score
export const REJECTION_PENALTY = 0.3;
