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
  "green":        ["olive", "beige", "brown", "gray", "grey", "khaki"],
  "grey":         ["black", "white", "navy", "gray", "grey", "beige"],
  "blue":         ["navy", "gray", "grey", "white", "beige", "black"],
  "navy":         ["gray", "grey", "white", "black", "beige"],
  "white":        ["black", "navy", "gray", "grey", "beige", "brown"],
  "black-red":    ["black", "gray", "grey", "white"],
  "black":        ["black", "white", "gray", "grey", "navy", "olive", "brown"],
  "white-teal":   ["gray", "grey", "white", "black", "navy"],
  // Replica dial colors — previously missing, always scored 0.3
  "teal":         ["grey", "white", "black", "navy", "olive", "khaki"],
  "burgundy":     ["grey", "white", "navy", "black", "beige", "stone"],
  "purple":       ["grey", "black", "navy", "white", "stone"],
  "turquoise":    ["white", "beige", "stone", "navy", "cream"],
  "red":          ["black", "grey", "white", "navy"],
  "meteorite":    ["black", "grey", "navy", "white", "brown"],
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
 * Score how well shoes match the watch strap color.
 * Non-negotiable rule: leather strap → matching leather shoe color.
 * Returns 0-1.
 */
export function strapShoeScore(watch, garment) {
  if ((garment.type ?? garment.category) !== "shoes") return 1.0; // only applies to shoes slot

  const strap = (watch.strap ?? "").toLowerCase();

  // Bracelet / integrated — no restriction
  if (strap === "bracelet" || strap === "integrated" || strap === "") return 1.0;

  // NATO / canvas / rubber — prefer white sneakers, no hard black/brown rule
  const isNatoCasual = strap.includes("nato") || strap.includes("canvas") || strap.includes("rubber");
  if (isNatoCasual) {
    const shoeColor = (garment.color ?? "").toLowerCase();
    return ["white", "grey", "tan"].includes(shoeColor) ? 1.0 : 0.8; // soft preference only
  }

  // Leather / alligator / calfskin / suede — strict color match
  const isLeather = strap.includes("leather") || strap.includes("alligator")
    || strap.includes("calfskin") || strap.includes("suede");
  if (!isLeather) return 1.0; // unknown strap type — no restriction

  const shoeColor = (garment.color ?? "").toLowerCase();
  const isBlackStrap = strap.includes("black");
  const isBrownStrap = strap.includes("brown") || strap.includes("tan") || strap.includes("honey")
    || strap.includes("cognac") || strap.includes("caramel") || strap.includes("alligator");

  if (isBlackStrap) return ["black"].includes(shoeColor) ? 1.0 : 0.0;
  if (isBrownStrap) return ["brown", "tan", "cognac", "dark brown"].includes(shoeColor) ? 1.0 : 0.0;

  // Non-standard leather color (teal, olive, navy, etc.) — soft preference for white sneakers
  return ["white", "brown", "tan", "black"].includes(shoeColor) ? 0.85 : 0.5;
}


export function scoreGarment(watch, garment, weather = {}) {
  const cm = colorMatchScore(watch, garment);
  const fm = formalityMatchScore(watch, garment);
  const wc = watchCompatibilityScore(watch, garment);
  const wl = weatherLayerScore(garment, weather);
  const ss = strapShoeScore(watch, garment); // 0.0 on strap-shoe mismatch for shoes

  const base = cm * 2 + fm * 3 + wc * 3 + wl;
  // For shoes: strap-shoe is a hard multiplier — a 0.0 effectively removes the shoe from contention
  return (garment.type ?? garment.category) === "shoes" ? base * ss : base;
}
