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

// Temperature thresholds used by outfitBuilder.js layering logic.
// Not scoring weights per se, but kept here so all engine magic numbers
// are in one place.
export const OUTFIT_TEMP_THRESHOLDS = {
  warmTransition: 10, // ≥10°C and <14°C → sweater needs high score to be included (was 18°C/22°C; lowered 2026-05-02 for Mediterranean climate)
  layerDouble:     8, // <8°C → add second sweater/layer piece
};

// Replica watch scoring penalty in formal/clinic/shift contexts.
// Applied as: score -= baseScore * REPLICA_PENALTY
// Strong reduction (not a hard gate) so the engine still has candidates
// when only replicas exist in the wardrobe.
export const REPLICA_PENALTY = 0.60;

// Brightness nudge: removed.
// ±0.05 was meaningless on a 0-10 scale. ±0.5 overwhelmed the -0.28
// repetition penalty, preventing diversity rotation. Color contrast is
// already encoded via colorMatchScore — no additional nudge needed.

// ── Per-category rotation damping (Eias, 2026-05-20) ──────────────────────────
// Rotation pressure, the repetition penalty and the diversity penalty are all
// multiplied by the slot's entry here before they reach the score.
//
// Rationale: footwear is a tiny set (~8 pairs). Penalising a recently-worn shoe
// just forces a worse-pairing shoe — re-wearing a shoe that pairs well is fine.
// So shoes are rotation-NEUTRAL (0): never boosted for being idle, never
// penalised for being recent. Bottoms rotate less than tops in practice, so
// pants get partial relief (0.4). Slots not listed default to 1.0 (full
// rotation pressure — shirts and everything else are unchanged).
//
// NB: the global rotationFactor weight (0.40) and repetitionPenalty (-0.28) are
// intentionally untouched — this is a deliberate per-slot scoping, not a
// global weakening of rotation.
export const CATEGORY_ROTATION_MULTIPLIER = {
  shoes: 0,
  pants: 0.4,
};

/**
 * Rotation/diversity damping multiplier for a garment's slot.
 * Reads garment.type (engine slot) with garment.category as a fallback for
 * DB-shaped objects. Unknown/missing slot → 1.0 (no damping).
 * @param {{type?:string, category?:string}|null|undefined} garment
 * @returns {number} 0–1
 */
export function categoryRotationMultiplier(garment) {
  const slot = (garment?.type ?? garment?.category ?? "").toLowerCase();
  return CATEGORY_ROTATION_MULTIPLIER[slot] ?? 1;
}
