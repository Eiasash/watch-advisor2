/**
 * Simple outfit generator based on watch + wardrobe + weather.
 * Supplements the main outfitEngine — used for quick regeneration
 * when watch or weather changes.
 */

export function generateOutfit(watch, garments, weather) {
  const shirts   = garments.filter(g => g.type === "shirt");
  const pants    = garments.filter(g => g.type === "pants");
  const shoes    = garments.filter(g => g.type === "shoes");
  const jackets  = garments.filter(g => g.type === "jacket");
  const sweaters = garments.filter(g => g.type === "sweater");

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
