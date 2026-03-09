/**
 * Outfit scoring system.
 * Scores garments using: colorMatch, formalityMatch, watchCompatibility, weatherLayer.
 *
 * score = colorMatch * 2 + formalityMatch * 3 + watchCompatibility * 3 + weatherLayer
 */

import { STYLE_FORMALITY_TARGET } from "./watchStyles.js";

// Dial color → compatible garment colors
const DIAL_COLOR_MAP = {
  "silver-white": ["black", "navy", "gray", "grey", "white", "beige", "slate", "charcoal", "blue"],
  "green":        ["olive", "beige", "brown", "gray", "grey", "khaki", "cream", "tan", "green", "charcoal"],
  "grey":         ["black", "white", "navy", "gray", "grey", "stone", "beige", "charcoal", "blue", "burgundy"],
  "blue":         ["navy", "gray", "grey", "white", "beige", "stone", "black", "charcoal", "blue"],
  "navy":         ["gray", "grey", "white", "black", "beige", "stone", "cream", "charcoal", "blue"],
  "white":        ["black", "navy", "gray", "grey", "beige", "stone", "brown", "charcoal", "blue", "green"],
  "black-red":    ["black", "gray", "grey", "white", "red", "charcoal", "burgundy"],
  "black":        ["black", "white", "gray", "grey", "navy", "olive", "brown", "charcoal", "blue", "green"],
  "white-teal":   ["gray", "grey", "white", "black", "navy", "teal", "charcoal"],
  // Replica dial colors
  "teal":         ["grey", "white", "black", "navy", "olive", "khaki", "charcoal", "green"],
  "burgundy":     ["grey", "white", "navy", "black", "beige", "stone", "charcoal", "cream"],
  "purple":       ["grey", "black", "navy", "white", "stone", "charcoal"],
  "turquoise":    ["white", "beige", "stone", "navy", "cream", "charcoal"],
  "red":          ["black", "grey", "white", "navy", "charcoal"],
  "meteorite":    ["black", "grey", "navy", "white", "brown", "charcoal", "olive"],
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
  // Brown: must explicitly name a warm color — "grey alligator" is NOT brown
  const isBrownStrap = !isBlackStrap && (
    strap.includes("brown") || strap.includes("tan") || strap.includes("honey")
    || strap.includes("cognac") || strap.includes("caramel")
    || (strap.includes("alligator") && !strap.includes("grey") && !strap.includes("gray")
        && !strap.includes("navy") && !strap.includes("green") && !strap.includes("teal"))
  );

  if (isBlackStrap) return ["black"].includes(shoeColor) ? 1.0 : 0.0;
  if (isBrownStrap) return ["brown", "tan", "cognac", "dark brown"].includes(shoeColor) ? 1.0 : 0.0;

  // Non-standard leather color (teal, olive, navy, etc.) — soft preference for white sneakers
  return ["white", "brown", "tan", "black"].includes(shoeColor) ? 0.85 : 0.5;
}



// Lazy style-learn multiplier — avoids top-level indexedDB import in test env
let _slStore = null;
function _styleLearnMult(garment) {
  try {
    if (!_slStore) {
      // eslint-disable-next-line no-undef
      const m = globalThis.__styleLearnStore__;
      if (m) _slStore = m;
    }
    return _slStore ? _slStore.getState().preferenceMultiplier(garment) : 1.0;
  } catch (_) { return 1.0; }
}

export function scoreGarment(watch, garment, weather = {}, outfitFormality = null) {
  const cm = colorMatchScore(watch, garment);
  // When a slot is pinned by the user, outfitFormality anchors scoring for other slots
  const fm = outfitFormality != null
    ? Math.max(0, 1 - Math.abs(outfitFormality - (garment.formality ?? 5)) / 5)
    : formalityMatchScore(watch, garment);
  const wc = watchCompatibilityScore(watch, garment);
  const wl = weatherLayerScore(garment, weather);
  const ss = strapShoeScore(watch, garment); // 0.0 on strap-shoe mismatch for shoes

  const base = cm * 2 + fm * 3 + wc * 3 + wl;
  // Style-learning bias: gentle multiplier from preference profile (0.85–1.15)
  const prefMult = _styleLearnMult(garment);
  // For shoes: strap-shoe is a hard multiplier — a 0.0 effectively removes the shoe from contention
  const scored = (garment.type ?? garment.category) === "shoes" ? base * ss : base;
  return scored * prefMult;
}
