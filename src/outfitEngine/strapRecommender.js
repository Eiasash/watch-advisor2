/**
 * Strap recommender — given a watch and an outfit, recommend the best strap.
 *
 * Scores each strap in the watch's collection against the chosen shoes and
 * outfit context to surface an actionable recommendation.
 *
 * Returns: { recommended, reason, alternatives }
 *   recommended: { id, label, color, score }
 *   reason: string explanation
 *   alternatives: [{ id, label, color, score }]
 */

import { strapShoeScore } from "./scoring.js";

const EXEMPT_TYPES = new Set(["bracelet", "integrated"]);
const FORMAL_CONTEXTS = new Set(["clinic", "formal", "hospital-smart-casual", "shift"]);

/** Simulated strap-shoe compatibility using the existing strapShoeScore. */
function scoreStrapForOutfit(strap, shoes, context) {
  if (!strap) return 0;
  const strapLabel = (strap.label ?? strap.color ?? "").toLowerCase();
  const strapType = (strap.type ?? "").toLowerCase();

  // Bracelet/integrated always works — baseline score
  if (EXEMPT_TYPES.has(strapType)) {
    // Bracelets are versatile but less stylistically interesting
    return 0.75;
  }

  // Create a fake watch object with this strap to reuse strapShoeScore
  const fakeWatch = { strap: strapLabel };
  const shoeScore = shoes ? strapShoeScore(fakeWatch, shoes, context) : 0.5;

  // Context bonus: leather straps score higher in clinic/formal
  let contextBonus = 0;
  if (FORMAL_CONTEXTS.has(context)) {
    if (strapType === "leather") contextBonus = 0.1;
    else if (strapType === "canvas" || strapType === "nato" || strapType === "rubber") contextBonus = -0.1;
  } else if (context === "casual" || context === "riviera") {
    if (strapType === "nato" || strapType === "rubber" || strapType === "canvas") contextBonus = 0.1;
  }

  return Math.min(1.0, shoeScore + contextBonus);
}

/**
 * Recommend the best strap for a given watch + outfit combination.
 *
 * @param {object} watch    - Watch with .straps[] array
 * @param {object} outfit   - Built outfit { shoes, shirt, pants, ... }
 * @param {string} context  - e.g. "clinic", "smart-casual"
 * @returns {{ recommended, reason, alternatives } | null}
 */
export function recommendStrap(watch, outfit, context) {
  const straps = watch?.straps;
  if (!straps || straps.length <= 1) return null; // No choice to make

  const shoes = outfit?.shoes;

  const scored = straps.map(s => ({
    ...s,
    score: scoreStrapForOutfit(s, shoes, context),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;

  // Build reason
  let reason;
  const shoeColor = (shoes?.color ?? "").toLowerCase();
  const strapType = (best.type ?? "").toLowerCase();

  if (EXEMPT_TYPES.has(strapType)) {
    reason = "Bracelet is the versatile default — works with any shoe.";
  } else if (shoeColor && (best.color ?? "").toLowerCase().includes("black") && shoeColor.includes("black")) {
    reason = `Black ${strapType} matches your black shoes — strap-shoe rule locked.`;
  } else if (shoeColor && ["brown", "tan", "cognac"].some(c => (best.color ?? "").toLowerCase().includes(c))) {
    reason = `${best.label} coordinates with your ${shoeColor} shoes — warm tone match.`;
  } else if ((best.color ?? "").toLowerCase().includes("navy")) {
    reason = `Navy ${strapType} pairs well with ${shoeColor || "your"} shoes and adds depth.`;
  } else {
    reason = `${best.label} scores highest for today's ${context ?? "smart-casual"} context.`;
  }

  return {
    recommended: { id: best.id, label: best.label, color: best.color, score: best.score },
    reason,
    alternatives: scored.slice(1, 3).map(s => ({ id: s.id, label: s.label, color: s.color, score: s.score })),
  };
}
