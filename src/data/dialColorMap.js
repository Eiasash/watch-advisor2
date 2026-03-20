/**
 * Canonical dial color → compatible garment color mapping.
 * Single source of truth — imported by both outfitEngine paths.
 *
 * Keys = watch dial values from watchSeed.js
 * Values = garment colors that pair well with that dial
 */
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
