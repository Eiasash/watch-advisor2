/**
 * Normalizes garment type aliases to canonical types.
 */

export function normalizeType(type) {
  const map = {
    sneaker:  "shoes",
    sneakers: "shoes",
    boots:    "shoes",
    loafers:  "shoes",
    jeans:    "pants",
    trousers: "pants",
    blazer:   "jacket",
    coat:     "jacket",
  };

  return map[type] ?? type;
}
