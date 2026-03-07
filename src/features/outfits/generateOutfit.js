/**
 * Simple outfit generator based on watch + wardrobe + weather.
 * Supplements the main outfitEngine — used for quick regeneration
 * when watch or weather changes.
 */

const ACCESSORY_TYPES = new Set(["belt","sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);

export function generateOutfit(watch, garments, weather) {
  const wearable = garments.filter(g => !ACCESSORY_TYPES.has(g.type ?? g.category) && !g.excludeFromWardrobe);
  const shirts   = wearable.filter(g => g.type === "shirt" || g.type === "sweater");
  const pants    = wearable.filter(g => g.type === "pants");
  const shoes    = wearable.filter(g => g.type === "shoes");
  const jackets  = wearable.filter(g => g.type === "jacket");
  const sweaters = wearable.filter(g => g.type === "sweater");

  let jacket = null;

  if (weather) {
    const temp = weather.temperature;
    if (temp < 10) jacket = jackets[0] ?? null;
    else if (temp < 16) jacket = jackets[0] ?? null;
    else if (temp < 21) jacket = sweaters[0] ?? jackets[0] ?? null;
  }

  return {
    shirt: shirts[0] ?? null,
    pants: pants[0] ?? null,
    shoes: shoes[0] ?? null,
    jacket,
  };
}
