/**
 * Outfit explanation engine.
 *
 * Generates a human-readable breakdown of why an outfit was chosen,
 * surfacing the scoring signals that drove each slot selection.
 *
 * Usage:
 *   import { explainOutfit } from "./explain.js";
 *   const explanation = explainOutfit(watch, outfit, signals, weather);
 *   // returns string[]
 */

import { pantsShoeHarmony } from "./scoring.js";

/**
 * Convert a 0–1 score to a readable quality word.
 */
function _quality(score) {
  if (score >= 0.85) return "excellent";
  if (score >= 0.65) return "good";
  if (score >= 0.45) return "fair";
  return "weak";
}

/**
 * Generate an explanation array for a built outfit.
 *
 * @param {object} watch       - The watch anchoring the outfit
 * @param {object} outfit      - { shirt, pants, shoes, sweater, layer, jacket, belt }
 * @param {object} signals     - Scoring signals: { colorMatch, formalityMatch, watchCompatibility, pairHarmonyScore }
 * @param {object} [weather]   - { tempC }
 * @returns {string[]}         - Array of explanation lines
 */
export function explainOutfit(watch, outfit, signals = {}, weather = {}) {
  const lines = [];

  // ── Anchor ────────────────────────────────────────────────────────────────
  lines.push(
    `${watch.brand} ${watch.model} anchors this look — ` +
    `${watch.style ?? "sport-elegant"}, formality ${watch.formality ?? 5}/10.`
  );

  // ── Color match ───────────────────────────────────────────────────────────
  if (signals.colorMatch != null) {
    const q = _quality(signals.colorMatch);
    if (signals.colorMatch >= 0.85) {
      lines.push(`Color match: ${q} — dial and garments share a complementary palette.`);
    } else {
      lines.push(`Color match: ${q} — dial and garment palette are loosely related.`);
    }
  }

  // ── Formality match ───────────────────────────────────────────────────────
  if (signals.formalityMatch != null) {
    const q = _quality(signals.formalityMatch);
    lines.push(`Formality alignment: ${q} (score ${(signals.formalityMatch * 100).toFixed(0)}%).`);
  }

  // ── Watch compatibility ───────────────────────────────────────────────────
  if (signals.watchCompatibility != null) {
    const q = _quality(signals.watchCompatibility);
    lines.push(`Watch–garment style compatibility: ${q}.`);
  }

  // ── Slot-level notes ──────────────────────────────────────────────────────
  if (outfit.shirt) {
    lines.push(`Shirt: ${outfit.shirt.name} (${outfit.shirt.color}) — pairs with ${watch.dial} dial.`);
  }
  if (outfit.sweater) {
    lines.push(`Mid-layer: ${outfit.sweater.name} added for warmth.`);
  }
  if (outfit.layer) {
    lines.push(`Second layer: ${outfit.layer.name} for sub-8°C conditions.`);
  }
  if (outfit.pants) {
    lines.push(`Trousers: ${outfit.pants.name} (${outfit.pants.color}).`);
  }
  if (outfit.shoes) {
    lines.push(`Shoes: ${outfit.shoes.name} (${outfit.shoes.color}) — ground the outfit.`);
  }
  if (outfit.belt) {
    const beltShoeMatch =
      (outfit.belt.color ?? "").toLowerCase() === (outfit.shoes?.color ?? "").toLowerCase();
    lines.push(
      `Belt: ${outfit.belt.name} ${beltShoeMatch ? "matches shoes exactly" : "coordinates with shoes"}.`
    );
  }
  if (outfit.jacket && weather?.tempC != null) {
    lines.push(`Jacket: ${outfit.jacket.name} added for ${weather.tempC}°C weather.`);
  }

  // ── Pair harmony ──────────────────────────────────────────────────────────
  if (signals.pairHarmonyScore != null) {
    const ph = signals.pairHarmonyScore;
    if (ph >= 0.95) {
      lines.push("Pair harmony: excellent — shirt, trousers and shoes form a coherent palette.");
    } else if (ph >= 0.80) {
      lines.push("Pair harmony: good — minor tonal tension but overall balanced.");
    } else if (ph >= 0.65) {
      lines.push("Pair harmony: fair — some contrast in the palette; intentional or borderline.");
    } else {
      lines.push("Pair harmony: weak — consider swapping trousers or shoes for better tonal alignment.");
    }
  } else if (outfit.pants && outfit.shoes) {
    const h = pantsShoeHarmony(outfit.pants, outfit.shoes);
    if (h >= 0.9) lines.push("Pants and shoes are in perfect tonal harmony.");
    else if (h <= 0.5) lines.push("Note: pants–shoe tone transition is a stretch — consider swapping.");
  }

  // ── Dual-dial ─────────────────────────────────────────────────────────────
  if (outfit._recommendedDial) {
    const d = outfit._recommendedDial;
    lines.push(
      `Reverso: wear ${d.label} side — ` +
      (d.side === "B"
        ? "white dial pops against the dark outfit."
        : "navy dial adds depth to the lighter palette.")
    );
  }

  return lines;
}
