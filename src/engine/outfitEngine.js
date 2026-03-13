/**
 * Legacy outfit engine — compatibility shim.
 *
 * Primary engine: src/outfitEngine/outfitBuilder.js (buildOutfit).
 * This file preserves the API that outfitEngine.test.js depends on.
 * Do NOT add new logic here.
 */

import { buildOutfit }  from "../outfitEngine/outfitBuilder.js";
import { scoreGarment } from "../outfitEngine/scoring.js";
import { pantsShoeHarmony } from "../outfitEngine/scoring.js";

/**
 * Score a single garment — delegates to multiplicative engine.
 */
export function garmentScore(watch, garment, weather = {}, history = [], dayProfile = "smart-casual") {
  return scoreGarment(watch, garment, weather, null, dayProfile);
}

/**
 * Generate an outfit — wraps buildOutfit.
 */
export function generateOutfit(watch, wardrobe, weather = {}, profile = {}, history = []) {
  const context = typeof profile === "string" ? profile : (profile?.context ?? "smart-casual");
  return buildOutfit(watch, wardrobe, weather, history, [], {}, {}, context);
}

/**
 * Explain an outfit — returns a plain string (legacy interface).
 */
export function explainOutfit(watch, outfit, context = "smart-casual") {
  const filled = Object.values(outfit).filter(x => x && typeof x === "object" && x.name);
  if (!filled.length) {
    return `No garments in wardrobe yet. Add some and the engine will build around the ${watch.model}.`;
  }
  const parts = [
    `${watch.brand} ${watch.model} anchors this look (${watch.style ?? "sport-elegant"}, formality ${watch.formality ?? 5}/10).`,
  ];
  if (outfit.shirt)   parts.push(`${outfit.shirt.name} (${outfit.shirt.color}) pairs with the ${watch.dial} dial.`);
  if (outfit.sweater) parts.push(`${outfit.sweater.name} layered for warmth.`);
  if (outfit.pants)   parts.push(`${outfit.pants.name} complements the formality level.`);
  if (outfit.shoes)   parts.push(`${outfit.shoes.name} ground the outfit.`);
  if (outfit.pants && outfit.shoes) {
    const h = pantsShoeHarmony(outfit.pants, outfit.shoes);
    if (h >= 0.9) parts.push("Pants and shoes are in perfect tonal harmony.");
    else if (h <= 0.5) parts.push("Note: pants-shoe tone transition is a stretch — consider swapping.");
  }
  return parts.join(" ");
}
