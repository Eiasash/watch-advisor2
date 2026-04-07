/**
 * Canonical dial color → compatible garment color mapping.
 * Single source of truth — imported by both outfitEngine paths.
 *
 * Keys = watch dial values from watchSeed.js
 * Values = garment colors that pair well with that dial
 */

/**
 * Garment color family groupings for fuzzy colorMatchScore.
 * Substring matching: "dark olive" → includes "olive" → green family.
 * Used to give near-miss scores (0.85) to unlisted shades of a compatible color.
 */
export const GARMENT_COLOR_FAMILIES = {
  black:    ["black", "charcoal", "graphite"],
  white:    ["white", "cream", "ivory", "ecru", "off-white"],
  grey:     ["grey", "gray", "slate", "ash"],
  navy:     ["navy", "indigo", "dark navy"],
  blue:     ["blue", "cobalt", "denim"],
  green:    ["green", "olive", "sage", "khaki", "military"],
  earth:    ["brown", "tan", "camel", "cognac", "sand", "stone", "beige"],
  burgundy: ["burgundy", "wine", "maroon", "brick", "rust"],
  teal:     ["teal", "turquoise"],
  warm:     ["red", "coral", "orange"],
  purple:   ["purple", "lavender", "violet"],
  yellow:   ["yellow", "mustard"],
};

/**
 * Returns the color family for a garment color string, or null.
 * Uses substring matching so "dark olive" → green, "light blue" → blue.
 */
export function getGarmentColorFamily(color) {
  if (!color) return null;
  const c = color.toLowerCase();
  for (const [family, members] of Object.entries(GARMENT_COLOR_FAMILIES)) {
    if (members.some(m => c.includes(m))) return family;
  }
  return null;
}

export const DIAL_COLOR_MAP = {
  "silver-white": ["black", "navy", "white", "beige", "slate", "charcoal", "blue", "light blue", "cream", "indigo", "dark navy", "lavender", "brick", "denim", "camel"],
  "green":        ["olive", "beige", "brown", "gray", "grey", "khaki", "cream", "tan", "green", "charcoal", "sand", "dark brown", "camel", "denim"],
  "grey":         ["black", "white", "navy", "gray", "grey", "stone", "beige", "charcoal", "blue", "burgundy", "brick", "rust", "olive", "coral", "lavender", "light blue", "camel", "yellow", "denim"],
  "blue":         ["navy", "gray", "grey", "white", "beige", "stone", "black", "charcoal", "blue", "khaki", "tan", "brick", "light blue", "camel", "yellow", "denim"],
  "navy":         ["gray", "grey", "white", "black", "beige", "stone", "cream", "charcoal", "blue", "khaki", "brick", "rust", "lavender", "coral", "light blue", "camel", "yellow", "denim"],
  "white":        ["black", "navy", "gray", "grey", "beige", "stone", "brown", "charcoal", "blue", "green", "olive", "brick", "coral", "lavender", "light blue", "camel", "dark brown", "denim"],
  "black-red":    ["black", "gray", "grey", "white", "red", "charcoal", "burgundy", "brick", "rust", "denim", "camel"],
  "black":        ["black", "white", "gray", "grey", "navy", "olive", "brown", "charcoal", "blue", "green", "khaki", "tan", "brick", "rust", "coral", "light blue", "camel", "dark brown", "denim"],
  "white-teal":   ["gray", "grey", "white", "black", "navy", "teal", "charcoal", "olive", "khaki", "denim", "camel"],
  // Replica dial colors
  "teal":         ["grey", "white", "black", "navy", "olive", "khaki", "charcoal", "green", "tan", "denim", "camel"],
  "burgundy":     ["grey", "white", "navy", "black", "beige", "stone", "charcoal", "cream", "khaki", "camel", "denim"],
  "purple":       ["grey", "black", "navy", "white", "stone", "charcoal", "cream", "denim"],
  "turquoise":    ["white", "beige", "stone", "navy", "cream", "charcoal", "khaki", "tan", "denim"],
  "red":          ["black", "grey", "white", "navy", "charcoal", "cream", "denim"],
  "meteorite":    ["black", "grey", "navy", "white", "brown", "charcoal", "olive", "khaki", "tan", "denim", "camel"],
};
