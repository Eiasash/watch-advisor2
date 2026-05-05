/**
 * watchSuggester — reverse engine.
 *
 * Standard flow: pick a watch → engine builds an outfit around it.
 * Reverse flow (v1.13.12): user picks an outfit (or partial outfit) →
 * suggest the watches in their collection that best harmonize with it.
 *
 * Reuses the same atomic scoring functions as the forward path so the
 * "best match" definition stays consistent. Sums per-slot (watch, garment)
 * scores; higher = better fit.
 *
 * Excludes watches where `excludeFromWardrobe` (CLAUDE.md: never hard-delete)
 * or `pending` (still being onboarded).
 */
import {
  colorMatchScore,
  formalityMatchScore,
  watchCompatibilityScore,
} from "./scoring.js";

const OUTFIT_SLOT_WEIGHTS = {
  // Belt + shoes correlate strongly with strap/dial — heavier weight on
  // those slots than on, say, the shirt.
  shirt: 1.0,
  pants: 1.0,
  shoes: 1.6,
  jacket: 0.9,
  sweater: 0.8,
  layer: 0.6,
  belt: 1.4,
};

function isWatchActive(w) {
  if (!w) return false;
  if (w.excludeFromWardrobe) return false;
  if (w.status === "pending" || w.status === "retired") return false;
  return true;
}

/**
 * Suggest the top-N watches that best match the given outfit (or partial
 * outfit). Returns an array of `{ watch, score, reasons }` sorted by score
 * descending, length ≤ N.
 *
 * @param {Array<object>} watches  All watches (active + inactive).
 * @param {object}        outfit   { shirt, pants, shoes, jacket, sweater, layer, belt } — values are garment objects or null.
 * @param {object}        opts     { limit = 5, includeInactive = false }
 */
export function suggestWatchForOutfit(watches, outfit, opts = {}) {
  const { limit = 5, includeInactive = false } = opts;
  if (!Array.isArray(watches) || !outfit) return [];
  const pool = includeInactive ? watches : watches.filter(isWatchActive);
  if (!pool.length) return [];

  // Materialize the slot list with non-null garments only — pinning empty
  // slots to zero would penalize watches uniformly and add no signal.
  const slots = Object.entries(outfit)
    .filter(([_slot, g]) => g && typeof g === "object" && g.id)
    .map(([slot, g]) => ({ slot, garment: g, weight: OUTFIT_SLOT_WEIGHTS[slot] ?? 1.0 }));
  if (!slots.length) return [];

  const ranked = pool.map(watch => {
    let total = 0;
    let weightSum = 0;
    const reasons = [];
    for (const { slot, garment, weight } of slots) {
      const cm = colorMatchScore(watch, garment);
      const fm = formalityMatchScore(watch, garment);
      const wc = watchCompatibilityScore(watch, garment);
      // Same weighting as scoring.js scoreGarment, scaled per-slot.
      const slotScore = (cm * 2.5) + (fm * 3) + (wc * 3);
      total += slotScore * weight;
      weightSum += weight;
      // Capture the strongest reason for the top-of-list explanation
      if (slotScore > 6 && reasons.length < 2) {
        reasons.push(`${garment.color ?? ""} ${slot} pairs (${cm.toFixed(2)}/${fm.toFixed(2)}/${wc.toFixed(2)})`.trim());
      }
    }
    const normalized = weightSum > 0 ? total / weightSum : 0;
    return { watch, score: Number(normalized.toFixed(2)), reasons };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}
