/**
 * Strap recommender — given a watch and an outfit, recommend the best strap.
 *
 * Scores each strap against:
 *   1. Shoe color match (mandatory strap-shoe rule)
 *   2. Outfit color palette affinity (e.g. olive strap + olive jacket)
 *   3. Context formality fit (leather for formal, canvas for casual)
 *   4. Watch dial color harmony
 *
 * Returns: { recommended, reason, alternatives }
 */

import { strapShoeScore } from "./scoring.js";

const EXEMPT_TYPES = new Set(["bracelet", "integrated"]);
const FORMAL_CONTEXTS = new Set(["clinic", "formal", "hospital-smart-casual", "shift"]);

const COLOR_FAMILIES = {
  earth:    ["brown", "tan", "cognac", "camel", "khaki", "beige", "stone", "mink", "rustic"],
  olive:    ["olive", "sage", "green", "dark green", "military"],
  navy:     ["navy", "dark blue"],
  black:    ["black"],
  grey:     ["grey", "slate", "charcoal"],
  teal:     ["teal", "turquoise"],
  cream:    ["cream", "ecru", "ivory", "white", "off-white"],
  burgundy: ["burgundy", "wine", "maroon"],
};

function getColorFamily(color) {
  if (!color) return null;
  const c = color.toLowerCase();
  for (const [family, members] of Object.entries(COLOR_FAMILIES)) {
    if (members.some(m => c.includes(m))) return family;
  }
  return null;
}

/** Score how well a strap color harmonizes with the outfit palette */
function outfitPaletteScore(strap, outfit) {
  if (!strap || EXEMPT_TYPES.has((strap.type ?? "").toLowerCase())) return 0;
  const strapFamily = getColorFamily(strap.color);
  if (!strapFamily) return 0;

  let affinity = 0;
  const outfitSlots = [outfit.jacket, outfit.sweater, outfit.layer, outfit.pants, outfit.shirt];
  for (const garment of outfitSlots) {
    if (!garment?.color) continue;
    const gFamily = getColorFamily(garment.color);
    if (gFamily === strapFamily) {
      affinity += 0.15;
    } else if (
      (strapFamily === "olive" && gFamily === "earth") ||
      (strapFamily === "earth" && gFamily === "olive") ||
      (strapFamily === "navy" && gFamily === "cream") ||
      (strapFamily === "cream" && gFamily === "navy") ||
      (strapFamily === "teal" && gFamily === "cream") ||
      (strapFamily === "black" && gFamily === "grey") ||
      (strapFamily === "grey" && gFamily === "black") ||
      (strapFamily === "burgundy" && gFamily === "cream") ||
      (strapFamily === "earth" && gFamily === "cream")
    ) {
      affinity += 0.08;
    }
  }
  return Math.min(0.25, affinity);
}

function scoreStrapForOutfit(strap, outfit, context, watch, weather) {
  if (!strap) return 0;
  const strapType = (strap.type ?? "").toLowerCase();

  if (EXEMPT_TYPES.has(strapType)) {
    // Weather bonus: bracelets get extra score in rain/wet conditions
    const rainBonus = (weather?.precipMm ?? 0) > 1 ? 0.15 : 0;
    return 0.70 + rainBonus;
  }

  const shoes = outfit?.shoes;
  const fakeWatch = { strap: (strap.label ?? strap.color ?? "").toLowerCase() };
  const shoeScore = shoes ? strapShoeScore(fakeWatch, shoes, context) : 0.5;

  // Hard fail: strap-shoe color violation
  if (shoeScore === 0) return 0;

  let contextBonus = 0;
  if (FORMAL_CONTEXTS.has(context)) {
    if (strapType === "leather") contextBonus = 0.08;
    else if (["canvas", "nato", "rubber"].includes(strapType)) contextBonus = -0.15;
  } else if (context === "casual" || context === "riviera") {
    if (["nato", "rubber", "canvas"].includes(strapType)) contextBonus = 0.08;
  }

  // Weather-driven strap adjustments
  let weatherBonus = 0;
  if (weather) {
    const temp = weather.tempC ?? 20;
    const rain = weather.precipMm ?? 0;
    // Hot weather (>28°C): NATO/rubber preferred — lighter, breathable
    if (temp > 28 && ["nato", "rubber", "canvas"].includes(strapType)) weatherBonus = 0.10;
    // Rain: leather penalized (water damage risk)
    if (rain > 1 && strapType === "leather") weatherBonus = -0.10;
    // Rain: rubber/nato bonus
    if (rain > 1 && ["nato", "rubber"].includes(strapType)) weatherBonus = 0.10;
  }

  // Poor-fit flag on strap (e.g. Pasha bracelet)
  if (strap.poorFit) return Math.max(0, shoeScore * 0.5 + contextBonus);

  const paletteBonus = outfitPaletteScore(strap, outfit);

  let dialBonus = 0;
  if (watch?.dial) {
    const dialFamily = getColorFamily(watch.dial);
    const strapFamily = getColorFamily(strap.color);
    if (dialFamily && strapFamily && dialFamily === strapFamily) dialBonus = 0.08;
  }

  return Math.min(1.0, shoeScore + contextBonus + paletteBonus + dialBonus + weatherBonus);
}

/**
 * @param {object} watch    - Watch with .straps[]
 * @param {object} outfit   - Built outfit { shoes, shirt, pants, jacket, sweater, layer }
 * @param {string} context  - e.g. "clinic", "smart-casual"
 * @returns {{ recommended, reason, alternatives } | null}
 */
export function recommendStrap(watch, outfit, context, weather) {
  const straps = watch?.straps;
  if (!straps || straps.length <= 1) return null;

  const shoes = outfit?.shoes;

  const scored = straps.map(s => ({
    ...s,
    score: scoreStrapForOutfit(s, outfit, context, watch, weather),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score === 0) return null;

  let reason;
  const shoeColor = (shoes?.color ?? "").toLowerCase();
  const strapType = (best.type ?? "").toLowerCase();
  const strapFamily = getColorFamily(best.color);

  if (EXEMPT_TYPES.has(strapType)) {
    reason = "Bracelet is the versatile default — works with any shoe.";
  } else {
    const parts = [];
    if (shoeColor && (best.color ?? "").toLowerCase().includes("black") && shoeColor.includes("black")) {
      parts.push("matches your black shoes");
    } else if (shoeColor && ["brown", "tan", "cognac"].some(c => (best.color ?? "").toLowerCase().includes(c))) {
      parts.push(`coordinates with your ${shoeColor} shoes`);
    }
    const outfitSlots = [outfit?.jacket, outfit?.sweater, outfit?.pants].filter(g => g?.color);
    const matchingSlot = outfitSlots.find(g => getColorFamily(g.color) === strapFamily);
    if (matchingSlot) {
      parts.push(`echoes the ${matchingSlot.color} ${(matchingSlot.type ?? matchingSlot.category ?? "").replace("pants", "trousers")}`);
    }
    if (watch?.dial && getColorFamily(watch.dial) === strapFamily) {
      parts.push(`harmonizes with the ${watch.dial} dial`);
    }
    reason = parts.length > 0
      ? `${best.label} — ${parts.join(", ")}.`
      : `${best.label} scores highest for ${context ?? "smart-casual"} context.`;
  }

  return {
    recommended: { id: best.id, label: best.label, color: best.color, score: best.score },
    reason,
    alternatives: scored.slice(1, 3).filter(s => s.score > 0).map(s => ({
      id: s.id, label: s.label, color: s.color, score: s.score,
    })),
  };
}
