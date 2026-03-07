/**
 * Outfit scoring system.
 * Scores garments using: colorMatch, formalityMatch, watchCompatibility, weatherLayer.
 *
 * score = colorMatch * 2 + formalityMatch * 3 + watchCompatibility * 3 + weatherLayer
 */

import { STYLE_FORMALITY_TARGET } from "./watchStyles.js";

// Dial color → compatible garment colors
const DIAL_COLOR_MAP = {
  "silver-white": ["black", "navy", "gray", "grey", "white", "beige"],
  "green":        ["olive", "beige", "brown", "gray", "grey"],
  "grey":         ["black", "white", "navy", "gray", "grey", "beige"],
  "blue":         ["navy", "gray", "grey", "white", "beige", "black"],
  "navy":         ["gray", "grey", "white", "black", "beige"],
  "white":        ["black", "navy", "gray", "grey", "beige", "brown"],
  "black-red":    ["black", "gray", "grey", "white"],
  "black":        ["black", "white", "gray", "grey", "navy", "olive", "brown"],
  "white-teal":   ["gray", "grey", "white", "black", "navy"],
};

/**
 * Score how well a garment's color matches the watch dial.
 * Returns 0-1.
 */
export function colorMatchScore(watch, garment) {
  const compatible = DIAL_COLOR_MAP[watch.dial] ?? [];
  const gc = (garment.color ?? "").toLowerCase();
  return compatible.includes(gc) ? 1.0 : 0.3;
}

/**
 * Score how well a garment's formality matches the watch formality.
 * Returns 0-1.
 */
export function formalityMatchScore(watch, garment) {
  const diff = Math.abs((watch.formality ?? 5) - (garment.formality ?? 5));
  return Math.max(0, 1 - diff / 5);
}

/**
 * Score watch-garment style compatibility.
 * Returns 0-1.
 */
export function watchCompatibilityScore(watch, garment) {
  const targetFormality = STYLE_FORMALITY_TARGET[watch.style] ?? 5;
  const diff = Math.abs(targetFormality - (garment.formality ?? 5));
  return Math.max(0, 1 - diff / 5);
}

/**
 * Score weather layer appropriateness.
 * Returns 0-1.
 */
export function weatherLayerScore(garment, weather) {
  if (!weather || weather.tempC == null) return 0.5;
  const temp = weather.tempC;
  const type = garment.type ?? garment.category;

  if (type === "jacket" || type === "sweater") {
    if (temp < 10) return 1.0;
    if (temp < 16) return 0.8;
    if (temp < 22) return 0.5;
    return 0.1; // too warm for a jacket
  }
  return 0.5;
}

/**
 * Compute total garment score for outfit selection.
 * score = colorMatch * 2 + formalityMatch * 3 + watchCompatibility * 3 + weatherLayer
 */
export function scoreGarment(watch, garment, weather = {}) {
  const cm = colorMatchScore(watch, garment);
  const fm = formalityMatchScore(watch, garment);
  const wc = watchCompatibilityScore(watch, garment);
  const wl = weatherLayerScore(garment, weather);

  return cm * 2 + fm * 3 + wc * 3 + wl;
}
