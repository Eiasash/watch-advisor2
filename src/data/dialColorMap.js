/**
 * Canonical dial color → compatible garment color mapping.
 * Single source of truth — imported by both outfitEngine paths.
 *
 * Keys = watch dial values from watchSeed.js
 * Values = garment colors that pair well with that dial
 */
export const DIAL_COLOR_MAP = {
  "silver-white": ["black", "navy", "white", "beige", "slate", "charcoal", "blue", "light blue", "cream", "indigo", "dark navy", "lavender", "brick"],
  "green":        ["olive", "beige", "brown", "gray", "grey", "khaki", "cream", "tan", "green", "charcoal", "sand"],
  "grey":         ["black", "white", "navy", "gray", "grey", "stone", "beige", "charcoal", "blue", "burgundy", "brick", "rust", "olive", "coral", "lavender"],
  "blue":         ["navy", "gray", "grey", "white", "beige", "stone", "black", "charcoal", "blue", "khaki", "tan", "brick"],
  "navy":         ["gray", "grey", "white", "black", "beige", "stone", "cream", "charcoal", "blue", "khaki", "brick", "rust", "lavender", "coral"],
  "white":        ["black", "navy", "gray", "grey", "beige", "stone", "brown", "charcoal", "blue", "green", "olive", "brick", "coral", "lavender"],
  "black-red":    ["black", "gray", "grey", "white", "red", "charcoal", "burgundy", "brick", "rust"],
  "black":        ["black", "white", "gray", "grey", "navy", "olive", "brown", "charcoal", "blue", "green", "khaki", "tan", "brick", "rust", "coral"],
  "white-teal":   ["gray", "grey", "white", "black", "navy", "teal", "charcoal", "olive", "khaki"],
  // Replica dial colors
  "teal":         ["grey", "white", "black", "navy", "olive", "khaki", "charcoal", "green", "tan"],
  "burgundy":     ["grey", "white", "navy", "black", "beige", "stone", "charcoal", "cream", "khaki"],
  "purple":       ["grey", "black", "navy", "white", "stone", "charcoal", "cream"],
  "turquoise":    ["white", "beige", "stone", "navy", "cream", "charcoal", "khaki", "tan"],
  "red":          ["black", "grey", "white", "navy", "charcoal", "cream"],
  "meteorite":    ["black", "grey", "navy", "white", "brown", "charcoal", "olive", "khaki", "tan"],
};
