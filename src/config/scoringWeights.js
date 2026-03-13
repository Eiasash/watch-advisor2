/**
 * Scoring weights and exponents for the outfit scoring engine.
 * All weights imported by src/outfitEngine/scoring.js.
 * Change here → affects entire engine. Do not inline copies elsewhere.
 */

// Multiplicative exponents — higher = harsher penalty for weak scores
export const SCORE_EXPONENTS = {
  colorMatch:       2.0,   // weak color match punished quadratically
  formalityMatch:   2.0,   // formality mismatch punished hard
  watchCompatibility: 1.0, // linear — already narrow range
  contextFormality: 1.0,   // hard gate handles the floor; multiplier is linear above it
};

// Style-learning soft multiplier range (never overrides hard constraints)
export const STYLE_LEARN = {
  min: 0.85,
  max: 1.15,
};

// Diversity bonus for garments not worn recently
export const DIVERSITY_BONUS = 0.2;

// Rejection penalty applied post-score
export const REJECTION_PENALTY = 0.3;
