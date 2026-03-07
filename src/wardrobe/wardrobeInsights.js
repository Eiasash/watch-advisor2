/**
 * Wardrobe insights — summary stats for display.
 */

const OUTFIT_TYPES = ["shirt","pants","shoes","jacket","sweater"];
const ACCESSORY_TYPES = ["belt","sunglasses","hat","scarf","bag","accessory"];

export function computeInsights(garments) {
  const active = garments.filter(g => g && !g.excludeFromWardrobe && g.type !== "outfit-photo");

  const counts = {
    shirts: 0, pants: 0, shoes: 0, jackets: 0, sweaters: 0, accessories: 0,
  };
  const colorCounts = {};

  for (const g of active) {
    const type = g.type ?? g.category;
    if (type === "shirt")   counts.shirts++;
    else if (type === "pants")   counts.pants++;
    else if (type === "shoes")   counts.shoes++;
    else if (type === "jacket")  counts.jackets++;
    else if (type === "sweater") counts.sweaters++;
    else if (ACCESSORY_TYPES.includes(type)) counts.accessories++;

    if (g.color) colorCounts[g.color] = (colorCounts[g.color] ?? 0) + 1;
  }

  const dominantColors = Object.entries(colorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([color, count]) => ({ color, count }));

  return { total: active.length, ...counts, dominantColors };
}
