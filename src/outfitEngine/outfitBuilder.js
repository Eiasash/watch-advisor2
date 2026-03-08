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
import { useRejectStore } from "../stores/rejectStore.js";
import { useStrapStore } from "../stores/strapStore.js";

/**
 * Generate the best outfit around a watch.
 *
 * @param {object} watch - Selected watch
 * @param {Array} wardrobe - All garments
 * @param {object} weather - { tempC: number }
 * @param {Array} history - Recent outfit history
 * @returns {object} { shirt, pants, shoes, jacket }
 */
const ACCESSORY_TYPES = new Set(["belt","sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);

export function buildOutfit(watch, wardrobe, weather = {}, history = [], garmentIds = []) {
  if (!watch) return { shirt: null, pants: null, shoes: null, jacket: null, sweater: null, layer: null };

  // Inject active strap label so strapShoeScore uses the real strap being worn today
  const activeStrapObj = useStrapStore.getState().getActiveStrap?.(watch.id);
  const watchWithStrap = activeStrapObj
    ? { ...watch, strap: activeStrapObj.label ?? activeStrapObj.color ?? watch.strap }
    : watch;

  // Strip accessories, outfit photos and excluded items from outfit consideration
  const wearable = wardrobe.filter(g => !ACCESSORY_TYPES.has(g.type ?? g.category) && !g.excludeFromWardrobe);

  const slots = STYLE_TO_SLOTS[watch.style] ?? STYLE_TO_SLOTS["sport-elegant"];
  const outfit = {};

  for (const [slotName, category] of Object.entries(slots)) {
    const type = category; // slot name matches category
    const candidates = wearable.filter(g => {
      const gType = g.type ?? g.category;
      // shirt slot: only actual shirts (sweaters go to sweater layer)
      if (type === "shirt") return gType === "shirt";
      return gType === type;
    });

    if (!candidates.length) {
      outfit[slotName] = null;
      continue;
    }

    // Score and sort — with rejection penalty
    const rejectState = useRejectStore.getState();
    const scored = candidates.map(g => {
      let score = scoreGarment(watchWithStrap, g, weather) + diversityBonus(g, history);
      // Apply -0.3 penalty if this watch+garment combo was recently rejected
      if (rejectState.isRecentlyRejected(watch.id, [g.id])) score -= 0.3;
      return { garment: g, score };
    });
    scored.sort((a, b) => b.score - a.score);

    outfit[slotName] = scored[0].garment;
  }

  // ── Multilayer logic ────────────────────────────────────────────────────────
  // sweater: primary mid-layer (temp < 22°C)
  // layer:   second mid-layer  (temp < 12°C) — e.g. vest, cardigan, hoodie
  outfit.sweater = null;
  outfit.layer   = null;

  {
    const temp = weather?.tempC ?? 22;
    if (temp < 22) {
      const rejectState = useRejectStore.getState();
      const sweaters = wearable.filter(g => (g.type ?? g.category) === "sweater");
      if (sweaters.length) {
        const scored = sweaters.map(g => {
          let score = scoreGarment(watchWithStrap, g, weather) + diversityBonus(g, history);
          if (rejectState.isRecentlyRejected(watch.id, [g.id])) score -= 0.3;
          return { garment: g, score };
        });
        scored.sort((a, b) => b.score - a.score);
        outfit.sweater = scored[0].garment;

        // Second layer — pick a different sweater/knitwear item when very cold
        if (temp < 12 && scored.length >= 2) {
          outfit.layer = scored[1].garment;
        }
      }
    }
  }

  // Weather-based jacket recommendation — score and pick best, not just first
  if (weather?.tempC != null && !outfit.jacket) {
    const temp = weather.tempC;
    if (temp < 22) {
      const rejectState = useRejectStore.getState();
      const jackets = wearable.filter(g => (g.type ?? g.category) === "jacket");
      if (jackets.length) {
        const scored = jackets.map(g => {
          let score = scoreGarment(watchWithStrap, g, weather) + diversityBonus(g, history);
          if (rejectState.isRecentlyRejected(watch.id, [g.id])) score -= 0.3;
          return { garment: g, score };
        });
        scored.sort((a, b) => b.score - a.score);
        outfit.jacket = scored[0].garment;
      }
    }
  }

  return outfit;
}

/**
 * Diversity penalty — avoid repeating garments from recent history.
 * Checks both outfit slot map (slot→id) and garmentIds array formats.
 */
function diversityBonus(garment, history) {
  const recent = (history ?? []).slice(-5);
  const usedCount = recent.filter(e => {
    // Format 1: outfit is { shirt: id, pants: id, ... } slot map
    const o = e.outfit ?? e.payload?.outfit ?? {};
    if (Object.values(o).includes(garment.id)) return true;
    // Format 2: garmentIds flat array (logged via TodayPanel / WatchDashboard)
    const ids = e.garmentIds ?? e.payload?.garmentIds ?? [];
    return ids.includes(garment.id);
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
  if (outfit.sweater) parts.push(`${outfit.sweater.name} layered for warmth.`);
  if (outfit.layer) parts.push(`${outfit.layer.name} as second layer for extra warmth.`);
  if (outfit.pants) parts.push(`${outfit.pants.name} complements the formality level.`);
  if (outfit.shoes) parts.push(`${outfit.shoes.name} ground the outfit.`);
  if (outfit.jacket && weather?.tempC != null) {
    parts.push(`${outfit.jacket.name} added for ${weather.tempC}°C weather.`);
  }

  return parts.join(" ");
}
