/**
 * Outfit confidence scoring.
 *
 * Converts a raw outfit score into a 0–1 confidence value and a human label.
 * Score scale is open-ended (multiplicative engine produces ~0.01–0.5 typical range),
 * so we normalise against a known ceiling rather than assuming a fixed max.
 *
 * Labels:
 *   "strong"    ≥ 0.75  — engine is very confident, wear without second-guessing
 *   "good"      ≥ 0.55  — solid choice, minor trade-offs
 *   "moderate"  ≥ 0.35  — acceptable, check for better alternatives
 *   "weak"      < 0.35  — engine is guessing; consider changing watch or context
 */

// Empirical ceiling for the multiplicative formula with sharpen(1.35).
// cm=1.0, fm=1.0, wc=1.0, cf=1.0, wl=1.0 → base = 1.0 → sharpen → 1.0 → prefMult ~1.15
// In practice ~0.55 is an excellent real-world outfit. Ceiling set at 0.60 for normalisation.
const SCORE_CEILING = 0.60;

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
