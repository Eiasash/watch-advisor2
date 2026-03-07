/**
 * Normalizes garment type aliases to canonical categories.
 */

const TYPE_MAP = {
  sneaker:    "shoes",
  sneakers:   "shoes",
  boots:      "shoes",
  boot:       "shoes",
  loafers:    "shoes",
  loafer:     "shoes",
  derby:      "shoes",
  derbies:    "shoes",
  brogue:     "shoes",
  brogues:    "shoes",
  oxford:     "shoes",
  oxfords:    "shoes",
  sandal:     "shoes",
  sandals:    "shoes",
  trainer:    "shoes",
  trainers:   "shoes",
  jeans:      "pants",
  jean:       "pants",
  trousers:   "pants",
  trouser:    "pants",
  chinos:     "pants",
  chino:      "pants",
  slacks:     "pants",
  slack:      "pants",
  shorts:     "pants",
  joggers:    "pants",
  jogger:     "pants",
  blazer:     "jacket",
  coat:       "jacket",
  overcoat:   "jacket",
  bomber:     "jacket",
  parka:      "jacket",
  cardigan:   "jacket",
  fleece:     "jacket",
  peacoat:    "jacket",
  windbreaker:"jacket",
  pullover:   "sweater",
  hoodie:     "sweater",
  sweatshirt: "sweater",
  polo:       "shirt",
  tee:        "shirt",
  tshirt:     "shirt",
  henley:     "shirt",
  flannel:    "shirt",
  crewneck:   "shirt",
};

export function normalizeType(type) {
  if (!type) return "shirt";
  return TYPE_MAP[type.toLowerCase()] ?? type.toLowerCase();
}
