/**
 * Weight factor — adjusts score based on garment weight vs current temperature.
 *
 * Uses garment.weight tag (ultralight|light|medium|heavy) set by bulk-tag.js.
 * Untagged garments (weight === null/undefined) return 0 — neutral, no penalty.
 *
 * Contributions (small, max ±0.15 to stay secondary to base formality/color scores):
 *   heavy garment in heat (>22°C)   → -0.15  (wrong season choice)
 *   ultralight in cold (<10°C)      → -0.10  (too thin)
 *   heavy in cold (<10°C)           → +0.10  (reward practical choice)
 *   ultralight in heat (>22°C)      → +0.08  (reward breathable choice)
 *   all others                      → 0      (neutral)
 *
 * Layer garments (jacket/sweater) are exempt — weatherLayerScore already handles them.
 */

const LAYER_TYPES = new Set(["jacket", "sweater", "coat", "layer", "outerwear"]);

export default function weightFactor(candidate, context) {
  const { garment } = candidate;
  if (!garment?.weight) return 0;

  const tempC = context?.weather?.tempC ?? null;
  if (tempC === null) return 0;

  const type = garment.type ?? garment.category ?? "";
  if (LAYER_TYPES.has(type)) return 0; // already scored by weatherLayerScore

  const w = garment.weight.toLowerCase();

  if (tempC > 22) {
    if (w === "heavy")      return -0.15;
    if (w === "ultralight") return +0.08;
  }
  if (tempC < 10) {
    if (w === "ultralight") return -0.10;
    if (w === "heavy")      return +0.10;
  }

  return 0;
}
