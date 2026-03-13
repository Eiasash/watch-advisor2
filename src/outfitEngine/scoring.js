/**
 * Outfit scoring system.
 * Scores garments using: colorMatch, formalityMatch, watchCompatibility, weatherLayer, contextFormality.
 *
 * score = colorMatch * 2 + formalityMatch * 2.5 + watchCompatibility * 2 + weatherLayer + contextFormality * 2.5
 */

import { STYLE_FORMALITY_TARGET } from "./watchStyles.js";
import { DIAL_COLOR_MAP } from "../data/dialColorMap.js";
// Garments below `min` are hard-excluded; `target` biases scoring.
export const CONTEXT_FORMALITY = {
  "hospital-smart-casual": { min: 5, target: 7 },
  "clinic":                { min: 5, target: 7 },
  "formal":                { min: 6, target: 8 },
  "smart-casual":          { min: 3, target: 6 },
  "casual":                { min: 1, target: 4 },
  "date-night":            { min: 4, target: 7 },
  "riviera":               { min: 3, target: 5 },
  "shift":                 { min: 5, target: 7 },
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

  // Non-standard leather color — navy, grey, teal, olive, green
  // Navy strap → black shoes or white sneakers. Brown = hard fail.
  // Grey strap → black or white preferred, brown tolerated.
  // Teal/olive/green → white sneakers preferred.
  const isNavyStrap = strap.includes("navy");
  const isGreyStrap = strap.includes("grey") || strap.includes("gray");
  const isTealGreenStrap = strap.includes("teal") || strap.includes("olive") || strap.includes("green");

  if (isNavyStrap) return ["black", "white"].includes(shoeColor) ? 1.0 : 0.0;
  if (isGreyStrap) return ["black", "white", "grey"].includes(shoeColor) ? 1.0 : 0.3;
  if (isTealGreenStrap) return ["white", "black"].includes(shoeColor) ? 1.0 : 0.3;

  return ["white", "black"].includes(shoeColor) ? 0.85 : 0.5;
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

/**
 * Score how well a garment's formality matches the context target.
 * Returns 0-1. Returns 0.75 (neutral) when no context is set.
 */
export function contextFormalityScore(garment, context) {
  const ctx = CONTEXT_FORMALITY[context];
  if (!ctx) return 0.75; // no context or unknown — neutral
  const gf = garment.formality ?? 5;
  // Hard floor: garments below minimum score 0
  if (gf < ctx.min) return 0.0;
  const diff = Math.abs(ctx.target - gf);
  return Math.max(0, 1 - diff / 5);
}

export function scoreGarment(watch, garment, weather = {}, outfitFormality = null, context = null) {
  const cm = colorMatchScore(watch, garment);
  // When a slot is pinned by the user, outfitFormality anchors scoring for other slots
  const fm = outfitFormality != null
    ? Math.max(0, 1 - Math.abs(outfitFormality - (garment.formality ?? 5)) / 5)
    : formalityMatchScore(watch, garment);
  const wc = watchCompatibilityScore(watch, garment);
  const wl = weatherLayerScore(garment, weather);
  const ss = strapShoeScore(watch, garment); // 0.0 on strap-shoe mismatch for shoes
  const cf = contextFormalityScore(garment, context);

  // Context formality of 0.0 means garment is below context minimum — hard exclude
  if (cf === 0.0) return 0.0;

  const base = cm * 2 + fm * 2.5 + wc * 2 + wl + cf * 2.5;
  // Style-learning bias: gentle multiplier from preference profile (0.85–1.15)
  const prefMult = _styleLearnMult(garment);
  // For shoes: strap-shoe is a hard multiplier — a 0.0 effectively removes the shoe from contention
  const scored = (garment.type ?? garment.category) === "shoes" ? base * ss : base;
  return scored * prefMult;
}

// ── Palette coherence — post-build scoring ──────────────────────────────────

const WARM_COLORS = new Set(["brown","tan","cognac","dark brown","khaki","beige","cream","stone","camel","sand","ecru","burgundy","olive"]);
const COOL_COLORS = new Set(["black","navy","grey","slate","charcoal","indigo"]);
// "white" is neutral — works with either palette

function _colorTone(color) {
  const c = (color ?? "").toLowerCase();
  if (WARM_COLORS.has(c)) return "warm";
  if (COOL_COLORS.has(c)) return "cool";
  // partial matches: "dark brown" → warm, "light blue" → cool
  if (c.includes("brown") || c.includes("tan") || c.includes("khaki") || c.includes("cream") || c.includes("beige")) return "warm";
  if (c.includes("grey") || c.includes("navy") || c.includes("charcoal") || c.includes("slate")) return "cool";
  return "neutral";
}

/**
 * Score how well pants and shoes work together tonally.
 * Warm pants (stone, khaki, cream) + black shoes = jarring visual break at ankle.
 * Cool pants (grey, slate, navy) + brown shoes = warm/cool clash.
 * Returns 0-1.
 */
export function pantsShoeHarmony(pants, shoes) {
  if (!pants || !shoes) return 0.7;
  const pantsTone = _colorTone(pants.color);
  const shoeTone = _colorTone(shoes.color);

  // white shoes or white pants = neutral, always OK
  const pc = (pants.color ?? "").toLowerCase();
  const sc = (shoes.color ?? "").toLowerCase();
  if (sc === "white" || pc === "white") return 0.9;

  // Same tone family → great
  if (pantsTone === shoeTone) return 1.0;
  // Neutral on either side → acceptable
  if (pantsTone === "neutral" || shoeTone === "neutral") return 0.8;
  // Warm pants + cool shoes → jarring ankle break
  if (pantsTone === "warm" && shoeTone === "cool") return 0.3;
  // Cool pants + warm shoes → mild clash
  if (pantsTone === "cool" && shoeTone === "warm") return 0.5;
  return 0.7;
}

/**
 * Pick the best belt from available belts to match shoe color.
 * Returns the best belt garment or null.
 */
export function pickBelt(shoes, belts) {
  if (!shoes || !belts?.length) return null;
  const sc = (shoes.color ?? "").toLowerCase();

  // White sneakers → no belt preference (any works)
  if (sc === "white") return belts[0] ?? null;

  // Score each belt by shoe-color match
  const scored = belts.map(belt => {
    const bc = (belt.color ?? "").toLowerCase();
    // Exact match
    if (bc === sc) return { belt, score: 1.0 };
    // Tone-family match: brown family
    const brownFamily = ["brown", "tan", "cognac", "dark brown"];
    if (brownFamily.includes(bc) && brownFamily.includes(sc)) {
      // Closer shade bonus: colors sharing a root word score higher
      const sharesRoot = bc.includes("brown") && sc.includes("brown");
      return { belt, score: sharesRoot ? 0.95 : 0.85 };
    }
    // Black to black
    if (bc === "black" && sc === "black") return { belt, score: 1.0 };
    // Mismatch
    return { belt, score: 0.1 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0.1 ? scored[0].belt : (belts[0] ?? null);
}
