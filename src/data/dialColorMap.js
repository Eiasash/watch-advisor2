/**
 * Canonical dial color → compatible garment color mapping.
 * Single source of truth — imported by both outfitEngine paths.
 *
 * Keys = watch dial values from watchSeed.js
 * Values = garment colors that pair well with that dial
 */
export const DIAL_COLOR_MAP = {
  "silver-white": ["black", "navy", "white", "beige", "slate", "charcoal", "blue", "light blue", "cream", "indigo", "dark navy"],
  "green":        ["olive", "beige", "brown", "gray", "grey", "khaki", "cream", "tan", "green", "charcoal"],
  "grey":         ["black", "white", "navy", "gray", "grey", "stone", "beige", "charcoal", "blue", "burgundy"],
  "blue":         ["navy", "gray", "grey", "white", "beige", "stone", "black", "charcoal", "blue"],
  "navy":         ["gray", "grey", "white", "black", "beige", "stone", "cream", "charcoal", "blue"],
  "white":        ["black", "navy", "gray", "grey", "beige", "stone", "brown", "charcoal", "blue", "green"],
  "black-red":    ["black", "gray", "grey", "white", "red", "charcoal", "burgundy"],
  "black":        ["black", "white", "gray", "grey", "navy", "olive", "brown", "charcoal", "blue", "green"],
  "white-teal":   ["gray", "grey", "white", "black", "navy", "teal", "charcoal"],
  // Replica dial colors
  "teal":         ["grey", "white", "black", "navy", "olive", "khaki", "charcoal", "green"],
  "burgundy":     ["grey", "white", "navy", "black", "beige", "stone", "charcoal", "cream"],
  "purple":       ["grey", "black", "navy", "white", "stone", "charcoal"],
  "turquoise":    ["white", "beige", "stone", "navy", "cream", "charcoal"],
  "red":          ["black", "grey", "white", "navy", "charcoal"],
  "meteorite":    ["black", "grey", "navy", "white", "brown", "charcoal", "olive"],
};
