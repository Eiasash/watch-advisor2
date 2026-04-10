/**
 * Outfit confidence scoring.
 *
 * Converts a raw outfit score into a 0–1 confidence value and a human label.
 * The additive engine produces combo scores = sum of 3 garment scores + coherence
 * bonuses, multiplied by pair-harmony. Typical range: 5–33.
 *
 * Labels:
 *   "strong"    ≥ 0.75  — engine is very confident, wear without second-guessing
 *   "good"      ≥ 0.55  — solid choice, minor trade-offs
 *   "moderate"  ≥ 0.35  — acceptable, check for better alternatives
 *   "weak"      < 0.35  — engine is guessing; consider changing watch or context
 */

// Additive engine ceiling (March 2026 recalibration).
//
// Per-garment max: (1.0×2.5)+(1.0×3)+(1.0×3)+(1.0×1)+(1.0×0.5) = 10
// 3 garments × 10 = 30, harmony ~1.0 → ~30 theoretical max.
// Typical "decent" outfit: 3× ~6.0 = 18, harmony 0.9 → ~16.4.
// Ceiling set at 30 so: perfect → 1.0 "strong", decent → 0.55 "good",
// mixed → 0.40 "moderate", bad → 0.17 "weak".
//
// Previously was 0.60 (calibrated for an old multiplicative engine that no longer
// exists), causing every real outfit to score 1.0 "strong" regardless of quality.
const SCORE_CEILING = 30;

/**
 * @param {number} score - raw scoreGarment-scale outfit score (sum of slot scores)
 * @returns {{ confidence: number, confidenceLabel: string }}
 */
export function outfitConfidence(score) {
  if (!isFinite(score) || score <= 0) {
    return { confidence: 0, confidenceLabel: "weak" };
  }

  const confidence = Math.min(1, score / SCORE_CEILING);

  let confidenceLabel;
  if (confidence >= 0.75) confidenceLabel = "strong";
  else if (confidence >= 0.55) confidenceLabel = "good";
  else if (confidence >= 0.35) confidenceLabel = "moderate";
  else confidenceLabel = "weak";

  return { confidence: Math.round(confidence * 100) / 100, confidenceLabel };
}
