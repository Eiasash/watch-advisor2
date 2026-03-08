/**
 * Simple outfit generator based on watch + wardrobe + weather.
 * Supplements the main outfitEngine — used for quick regeneration
 * when watch or weather changes.
 */

const ACCESSORY_TYPES = new Set(["belt","sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);

export function generateOutfit(watch, garments, weather) {
  const wearable = garments.filter(g => !ACCESSORY_TYPES.has(g.type ?? g.category) && !g.excludeFromWardrobe);
  const typeOf   = g => g.type ?? g.category;
  const shirts   = wearable.filter(g => typeOf(g) === "shirt");
  const pants    = wearable.filter(g => typeOf(g) === "pants");
  const shoes    = wearable.filter(g => typeOf(g) === "shoes");
  const jackets  = wearable.filter(g => typeOf(g) === "jacket");
  const sweaters = wearable.filter(g => typeOf(g) === "sweater");

  let jacket = null;
  let sweater = null;

  if (weather) {
    const temp = weather.tempC;
    if (temp != null && temp < 22) {
      jacket = jackets[0] ?? null;
      sweater = sweaters[0] ?? null;
    }
  }

  return {
    shirt: shirts[0] ?? null,
    pants: pants[0] ?? null,
    shoes: shoes[0] ?? null,
    jacket,
    sweater,
  };
}
