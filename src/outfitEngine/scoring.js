/**
 * Outfit scoring system — additive weighted model.
 *
 * score = (colorMatch × 2.5) + (formalityMatch × 3) + (watchCompatibility × 3)
 *       + (weatherLayer × 1) + (contextFormality × 1.5)
 *
 * Hard gates (return -Infinity so they sort BELOW strap-shoe 0.0 violations):
 *   - contextFormality === -Infinity  (garment below context formality floor)
 *   - formalityMatch === 0 for non-shoe slots (total formality incompatibility)
 *   - weatherLayer === 0 (layer garment in extreme heat)
 *
 * Strap-shoe violations remain 0.0 (separate pre-filter in outfitBuilder for shoe slot).
 *
 * Rotation bias lives in two places:
 *   - Watch rotation: engine/dayProfile.js → scoreWatchForDay via watchCooldownScore.
 *     Watches idle 7+ days receive a 1.15× multiplier there.
 *   - Garment rotation: outfitEngine/outfitBuilder.js → _scoreCandidate via
 *     rotationPressure(garmentDaysIdle()) × 0.2. Applied post-score so it cannot
 *     override hard gates.
 * Do NOT add a watch rotation boost here — that would double-apply the neglect penalty.
 *
 * Weights live in src/config/scoringWeights.js — never inline here.
 * Strap rules live in src/config/strapRules.js.
 * Weather rules live in src/config/weatherRules.js.
 */

import { STYLE_FORMALITY_TARGET } from "./watchStyles.js";
import { DIAL_COLOR_MAP } from "../data/dialColorMap.js";
import { SCORE_WEIGHTS, STYLE_LEARN } from "../config/scoringWeights.js";
import { useStyleLearnStore } from "../stores/styleLearnStore.js";
import {
  BLACK_STRAP_TERMS, BROWN_STRAP_TERMS, BROWN_SHOE_COLORS, BLACK_SHOE_COLORS,
  EXEMPT_STRAP_TERMS, CASUAL_STRAP_TERMS, CASUAL_SHOE_SOFT_MATCH, CASUAL_SHOE_SOFT_MISS,
  SPECIAL_STRAP_RULES,
} from "../config/strapRules.js";
import {
  NEUTRAL_SCORE, LAYER_TYPES, LAYER_TEMP_BRACKETS,
} from "../config/weatherRules.js";

// Garments below `min` are hard-excluded (return -Infinity); `target` biases scoring.
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

// ── Memoization cache ─────────────────────────────────────────────────────────
// Key: `${watchId}:${garmentId}:${context}:${strap}:${weatherTempC}`
// Cleared on app boot; Map is module-scoped so it survives across buildOutfit calls
// within the same session but doesn't persist across page loads.
const _scoreCache = new Map();

export function clearScoreCache() {
  _scoreCache.clear();
}

// ── Individual dimension scorers ──────────────────────────────────────────────

/**
 * Score how well a garment's color matches the watch dial.
 * Returns 0–1.
 */
export function colorMatchScore(watch, garment) {
  const compatible = DIAL_COLOR_MAP[watch.dial] ?? [];
  const gc = (garment.color ?? "").toLowerCase();
  return compatible.includes(gc) ? 1.0 : 0.3;
}

/**
 * Score how well a garment's formality matches the watch formality.
 * Returns 0–1.
 */
export function formalityMatchScore(watch, garment) {
  const diff = Math.abs((watch.formality ?? 5) - (garment.formality ?? 5));
  return Math.max(0, 1 - diff / 5);
}

/**
 * Score watch–garment style compatibility.
 * Returns 0–1.
 */
export function watchCompatibilityScore(watch, garment) {
  const targetFormality = STYLE_FORMALITY_TARGET[watch.style] ?? 5;
  const diff = Math.abs(targetFormality - (garment.formality ?? 5));
  return Math.max(0, 1 - diff / 5);
}

/**
 * Score weather layer appropriateness.
 * Returns 0–1.
 */
export function weatherLayerScore(garment, weather) {
  if (!weather || weather.tempC == null) return NEUTRAL_SCORE;
  const type = garment.type ?? garment.category;
  if (!LAYER_TYPES.has(type)) return NEUTRAL_SCORE;

  const temp = weather.tempC;
  for (const bracket of LAYER_TEMP_BRACKETS) {
    if (temp < bracket.below) return bracket.score;
  }
  return NEUTRAL_SCORE;
}

/**
 * Score how well shoes match the watch strap color.
 * Non-negotiable: leather strap → matching leather shoe color.
 * Returns 0–1. Returns 0.0 on hard strap–shoe mismatch.
 */
export function strapShoeScore(watch, garment) {
  if ((garment.type ?? garment.category) !== "shoes") return 1.0;

  const strap = (watch.strap ?? "").toLowerCase();

  // Bracelet / integrated — exempt
  if (!strap || EXEMPT_STRAP_TERMS.some(t => strap === t || strap.includes(t))) return 1.0;

  // SPECIAL_STRAP_RULES check FIRST — must precede CASUAL_STRAP_TERMS.
  // "Navy leather/rubber" contains "rubber" but the dominant color is navy.
  // Checking navy before the rubber soft-path ensures the hard 0.0 block fires.
  // Rule: navy/teal/grey/olive/green straps → only allowed shoe colors pass.
  const shoeColor = (garment.color ?? "").toLowerCase();
  for (const [key, rule] of Object.entries(SPECIAL_STRAP_RULES)) {
    if (strap.includes(key)) {
      return rule.allowed.includes(shoeColor) ? 1.0 : rule.fallback;
    }
  }

  // NATO / canvas / rubber — soft preference only (no hard blocks)
  if (CASUAL_STRAP_TERMS.some(t => strap.includes(t))) {
    return CASUAL_SHOE_SOFT_MATCH.includes(shoeColor) ? 1.0 : CASUAL_SHOE_SOFT_MISS;
  }

  // Leather / alligator / calfskin / suede — strict color match
  const isLeather = strap.includes("leather") || strap.includes("alligator")
    || strap.includes("calfskin") || strap.includes("suede");
  if (!isLeather) return 1.0;

  const isBlack = BLACK_STRAP_TERMS.some(t => strap.includes(t));

  // Brown: must explicitly name a warm color — "grey alligator" is NOT brown
  const isBrown = !isBlack && (
    BROWN_STRAP_TERMS.some(t => strap.includes(t))
    || (strap.includes("alligator")
        && !strap.includes("grey") && !strap.includes("gray")
        && !strap.includes("navy") && !strap.includes("green") && !strap.includes("teal"))
  );

  if (isBlack) return BLACK_SHOE_COLORS.includes(shoeColor) ? 1.0 : 0.0;
  if (isBrown) return BROWN_SHOE_COLORS.includes(shoeColor) ? 1.0 : 0.0;

  return ["white", "black"].includes(shoeColor) ? 0.85 : 0.5;
}

// ── Shoe pre-filter ───────────────────────────────────────────────────────────

/**
 * Pre-filter shoe candidates by strap–shoe rule BEFORE scoring.
 * Eliminates hard mismatches (strapShoeScore === 0.0) from the candidate pool
 * so they never appear in sorted results, even with diversity bonuses.
 *
 * Falls back to full pool if filtering would leave zero candidates.
 */
export function filterShoesByStrap(watch, shoes) {
  if (!shoes?.length) return shoes ?? [];
  const compatible = shoes.filter(g => strapShoeScore(watch, g) > 0.0);
  // Graceful fallback: never return empty — prefer any shoe over none
  return compatible.length > 0 ? compatible : shoes;
}

// ── Context formality ─────────────────────────────────────────────────────────

/**
 * Score how well a garment's formality matches the context target.
 * Returns -Infinity for garments below the context minimum floor (hard gate).
 * Returns 0.75 (neutral) when no context is set.
 */
export function contextFormalityScore(garment, context) {
  const ctx = CONTEXT_FORMALITY[context];
  if (!ctx) return 0.75;
  const gf = garment.formality ?? 5;
  if (gf < ctx.min) return -Infinity; // hard gate — sorts below all valid scores
  const diff = Math.abs(ctx.target - gf);
  return Math.max(0, 1 - diff / 5);
}

// ── Style-learning ─────────────────────────────────────────────────────────────

function _styleLearnMult(garment) {
  try {
    return useStyleLearnStore.getState().preferenceMultiplier(garment);
  } catch (_) { return 1.0; }
}

// ── Score refinement helpers ──────────────────────────────────────────────────

/**
 * Brightness balance: nudge scores slightly based on garment lightness.
 * Dark garments are slightly penalised (tend toward heavy outfits);
 * light garments are slightly boosted (tend toward airy, daytime-appropriate outfits).
 * Applied as a flat additive after the multiplicative base — intentionally small.
 */
function brightnessScore(color) {
  const c = (color ?? "").toLowerCase();
  const dark  = ["black", "navy", "charcoal", "dark brown", "indigo"];
  const light = ["white", "cream", "beige", "stone", "khaki", "tan", "sand"];
  if (dark.includes(c))  return -0.05;
  if (light.includes(c)) return  0.05;
  return 0;
}

// ── Composite scorer ─────────────────────────────────────────────────────────

/**
 * Score a garment against a watch + context using the additive weighted model.
 *
 * Formula (when all gates pass):
 *   base = (colorMatch×2.5) + (formalityMatch×3) + (watchCompatibility×3)
 *        + (weatherLayer×1) + (contextFormality×1.5)
 *   score = max(1e-6, base × styleLearnMult + brightnessNudge)
 *
 * Return values:
 *   -Infinity  context formality floor violated (garment.formality < context.min)
 *   -Infinity  total formality mismatch: fm === 0, non-shoe garments only
 *   -Infinity  weather hard rejection: layer garment in heat (wl === 0)
 *    0.0       strap-shoe hard mismatch (shoes slot only)
 *    > 0       valid — higher is better
 *
 * Shoes are exempt from the formality hard gate. They are scored primarily on
 * strap-shoe compatibility; a formality diff ≥ 5 produces a low score but does
 * NOT eliminate the shoe — that would leave the engine with no footwear.
 *
 * Memoized per (watchId|brand, garmentId|type:color:formality, context, strap, tempC, outfitFormality).
 */
export function scoreGarment(watch, garment, weather = {}, outfitFormality = null, context = null) {
  // ── Cache key ──────────────────────────────────────────────────────────────
  // Include garment type+color+formality as fallback when garment.id is absent
  // (e.g. test fixtures). Without this, different garments with no id collide.
  // seasons+contexts included so BulkTaggerPanel retags immediately invalidate
  // cached scores without requiring a full page reload.
  const garmentKey = garment.id ?? `${garment.type ?? garment.category}:${garment.color ?? ""}:${garment.formality ?? ""}`;
  const tagSig = `${(garment.seasons ?? []).join(",")}|${(garment.contexts ?? []).join(",")}`;
  const replicaFlag = watch.replica ? "r" : "g";
  const cacheKey = `${watch.id ?? watch.brand ?? ""}:${replicaFlag}:${garmentKey}:${tagSig}:${context ?? ""}:${watch.strap ?? ""}:${weather?.tempC ?? ""}:${outfitFormality ?? ""}`;
  if (_scoreCache.has(cacheKey)) return _scoreCache.get(cacheKey);

  // ── Compute dimensions ─────────────────────────────────────────────────────
  const cm = colorMatchScore(watch, garment);

  const fm = outfitFormality != null
    ? Math.max(0, 1 - Math.abs(outfitFormality - (garment.formality ?? 5)) / 5)
    : formalityMatchScore(watch, garment);

  const wc = watchCompatibilityScore(watch, garment);
  const cf = contextFormalityScore(garment, context);

  // Hard gate: context formality floor
  if (!isFinite(cf)) {
    _scoreCache.set(cacheKey, -Infinity);
    return -Infinity;
  }

  // Hard gate: formality mismatch is total (diff ≥ 5) — incompatible piece.
  // Shoes are exempt: they are accessories scored primarily on strap-shoe compatibility,
  // not on formality alignment with the watch.
  const slot = garment.type ?? garment.category;
  if (slot !== "shoes" && fm === 0) {
    _scoreCache.set(cacheKey, -Infinity);
    return -Infinity;
  }

  // Hard gate: weather rejection (layer in extreme heat, score === 0 from bracket)
  const wl = weatherLayerScore(garment, weather);
  if (wl === 0) {
    _scoreCache.set(cacheKey, -Infinity);
    return -Infinity;
  }

  // Strap-shoe rule (applies only to shoes slot)
  const ss = strapShoeScore(watch, garment);
  if (slot === "shoes" && ss === 0.0) {
    _scoreCache.set(cacheKey, 0.0);
    return 0.0;
  }

  // Weather layer multiplier (applied as soft multiplier, not exponent)
  // Already computed above in the hard gate check — use it directly in formula.

  // ── Additive weighted formula ───────────────────────────────────────────────
  // score = (colorMatch × 2.5) + (formalityMatch × 3) + (watchCompatibility × 3)
  //       + (weatherLayer × 1) + (contextFormality × 1.5)
  // Additive model: a weak dimension hurts but cannot zero-out a valid garment
  // (hard gates above handle true exclusions — context floor, strap-shoe mismatch).
  let base =
    (cm * SCORE_WEIGHTS.colorMatch) +
    (fm * SCORE_WEIGHTS.formalityMatch) +
    (wc * SCORE_WEIGHTS.watchCompatibility) +
    (wl * SCORE_WEIGHTS.weatherLayer) +
    (cf * SCORE_WEIGHTS.contextFormality);

  // Style-learning soft multiplier (clamped to STYLE_LEARN range in store)
  const prefMult = _styleLearnMult(garment);
  // Brightness balance: flat nudge after all additive logic.
  // Floor at 1e-6 (not 0) so a small brightness penalty can't zero out a valid
  // garment — it only lowers ranking. Exact 0.0 is reserved for strap-shoe mismatch.
  const finalScore = Math.max(1e-6, (base * prefMult) + brightnessScore(garment.color));

  _scoreCache.set(cacheKey, finalScore);
  return finalScore;
}

// ── Palette coherence — post-build scoring ────────────────────────────────────

const WARM_COLORS = new Set(["brown","tan","cognac","dark brown","khaki","beige","cream","stone","camel","sand","ecru","burgundy","olive","brick","rust","yellow","coral"]);
const COOL_COLORS = new Set(["black","navy","grey","slate","charcoal","indigo","denim","blue","light blue","teal","lavender"]);

function _colorTone(color) {
  const c = (color ?? "").toLowerCase();
  if (WARM_COLORS.has(c)) return "warm";
  if (COOL_COLORS.has(c)) return "cool";
  if (c.includes("brown") || c.includes("tan") || c.includes("khaki") || c.includes("cream") || c.includes("beige")) return "warm";
  if (c.includes("grey") || c.includes("navy") || c.includes("charcoal") || c.includes("slate")) return "cool";
  return "neutral";
}

/**
 * Score pants–shoes tonal harmony.
 * Returns 0–1.
 */
export function pantsShoeHarmony(pants, shoes) {
  if (!pants || !shoes) return 0.7;
  const pantsTone = _colorTone(pants.color);
  const shoeTone  = _colorTone(shoes.color);

  const pc = (pants.color ?? "").toLowerCase();
  const sc = (shoes.color ?? "").toLowerCase();
  if (sc === "white" || pc === "white") return 0.9;
  if (pantsTone === shoeTone) return 1.0;
  if (pantsTone === "neutral" || shoeTone === "neutral") return 0.8;
  if (pantsTone === "warm" && shoeTone === "cool") return 0.3;
  if (pantsTone === "cool" && shoeTone === "warm") return 0.5;
  return 0.7;
}

/**
 * Pick the best belt to match shoe color.
 * Returns belt garment or null.
 */
export function pickBelt(shoes, belts) {
  if (!shoes || !belts?.length) return null;
  const sc = (shoes.color ?? "").toLowerCase();
  if (sc === "white") return belts[0] ?? null;

  const scored = belts.map(belt => {
    const bc = (belt.color ?? "").toLowerCase();
    if (bc === sc) return { belt, score: 1.0 };
    const brownFamily = ["brown", "tan", "cognac", "dark brown"];
    if (brownFamily.includes(bc) && brownFamily.includes(sc)) {
      const sharesRoot = bc.includes("brown") && sc.includes("brown");
      return { belt, score: sharesRoot ? 0.95 : 0.85 };
    }
    return { belt, score: 0.1 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0.1 ? scored[0].belt : (belts[0] ?? null);
}
