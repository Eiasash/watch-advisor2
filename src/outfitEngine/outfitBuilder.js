/**
 * Watch-driven outfit builder.
 *
 * Algorithm:
 * 1. Read selected watch
 * 2. Determine style
 * 3. Filter garments by required categories
 * 4. Score garments
 * 5. Pick highest-scoring items per slot
 */

import { STYLE_TO_SLOTS } from "./watchStyles.js";
import { scoreGarment } from "./scoring.js";

/**
 * Generate the best outfit around a watch.
 *
 * @param {object} watch - Selected watch
 * @param {Array} wardrobe - All garments
 * @param {object} weather - { tempC: number }
 * @param {Array} history - Recent outfit history
 * @returns {object} { shirt, pants, shoes, jacket }
 */
export function buildOutfit(watch, wardrobe, weather = {}, history = []) {
  if (!watch) return { shirt: null, pants: null, shoes: null, jacket: null };

  const slots = STYLE_TO_SLOTS[watch.style] ?? STYLE_TO_SLOTS["sport-elegant"];
  const outfit = {};

  for (const [slotName, category] of Object.entries(slots)) {
    const type = category; // slot name matches category
    const candidates = wardrobe.filter(g => {
      const gType = g.type ?? g.category;
      // shirt slot accepts sweater/knitwear that weren't normalized
      if (type === "shirt") return gType === "shirt" || gType === "sweater";
      return gType === type;
    });

    if (!candidates.length) {
      outfit[slotName] = null;
      continue;
    }

    // Score and sort
    const scored = candidates.map(g => ({
      garment: g,
      score: scoreGarment(watch, g, weather) + diversityBonus(g, history),
    }));
    scored.sort((a, b) => b.score - a.score);

    outfit[slotName] = scored[0].garment;
  }

  // Weather-based jacket recommendation
  if (weather?.tempC != null && !outfit.jacket) {
    const temp = weather.tempC;
    if (temp < 22) {
      const jackets = wardrobe.filter(g => (g.type ?? g.category) === "jacket");
      const sweaters = wardrobe.filter(g => (g.type ?? g.category) === "sweater");

      let layer = null;
      if (temp < 10) layer = jackets[0] ?? sweaters[0];
      else if (temp < 16) layer = sweaters[0] ?? jackets[0];
      else layer = sweaters[0] ?? jackets[0];

      if (layer) outfit.jacket = layer;
    }
  }

  return outfit;
}

/**
 * Diversity penalty — avoid repeating garments from recent history.
 */
function diversityBonus(garment, history) {
  const recent = (history ?? []).slice(-5);
  const usedCount = recent.filter(e => {
    const o = e.outfit ?? e.payload?.outfit ?? {};
    return Object.values(o).includes(garment.id);
  }).length;
  return usedCount > 0 ? -0.12 * Math.min(usedCount, 5) : 0;
}

/**
 * Explain why this outfit was chosen.
 */
export function explainOutfitChoice(watch, outfit, weather) {
  const filled = Object.values(outfit).filter(Boolean);
  if (!filled.length) {
    return `No garments in wardrobe yet. Add some and the engine will build around the ${watch.model}.`;
  }

  const parts = [
    `${watch.brand} ${watch.model} anchors this look (${watch.style}, formality ${watch.formality}/10).`,
  ];

  if (outfit.shirt) parts.push(`${outfit.shirt.name} (${outfit.shirt.color}) pairs with the ${watch.dial} dial.`);
  if (outfit.pants) parts.push(`${outfit.pants.name} complements the formality level.`);
  if (outfit.shoes) parts.push(`${outfit.shoes.name} ground the outfit.`);
  if (outfit.jacket && weather?.tempC != null) {
    parts.push(`${outfit.jacket.name} added for ${weather.tempC}°C weather.`);
  }

  return parts.join(" ");
}
