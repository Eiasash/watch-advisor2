/**
 * Wardrobe insights — summary stats for display.
 */

/**
 * Compute wardrobe summary statistics.
 * @param {Array} garments
 * @returns {{ total, shirts, pants, shoes, jackets, sweaters, dominantColors }}
 */
export function computeInsights(garments) {
  const active = garments.filter(g => !g.excludeFromWardrobe);

  const byCategory = {
    shirts: 0,
    pants: 0,
    shoes: 0,
    jackets: 0,
    sweaters: 0,
  };

  const colorCounts = {};

  for (const g of active) {
    const type = g.type ?? g.category;
    if (type === "shirt") byCategory.shirts++;
    else if (type === "pants") byCategory.pants++;
    else if (type === "shoes") byCategory.shoes++;
    else if (type === "jacket") byCategory.jackets++;
    else if (type === "sweater") byCategory.sweaters++;

    if (g.color) {
      colorCounts[g.color] = (colorCounts[g.color] ?? 0) + 1;
    }
  }

  const dominantColors = Object.entries(colorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([color, count]) => ({ color, count }));

  return {
    total: active.length,
    ...byCategory,
    dominantColors,
  };
}
