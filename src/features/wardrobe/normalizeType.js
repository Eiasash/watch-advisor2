/**
 * Normalizes garment type aliases to canonical types.
 * Sweaters/knitwear → "shirt" so they fill the shirt slot in outfit engine.
 * outfit-photo stays as-is (excluded from outfit building).
 */

const TYPE_MAP = {
  // shoes
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
  // bottoms
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
  // layers
  blazer:     "jacket",
  coat:       "jacket",
  overcoat:   "jacket",
  bomber:     "jacket",
  parka:      "jacket",
  peacoat:    "jacket",
  windbreaker:"jacket",
  fleece:     "jacket",
  // tops — sweater/knitwear all map to shirt so outfit engine fills the slot
  sweater:    "shirt",
  knitwear:   "shirt",
  knit:       "shirt",
  pullover:   "shirt",
  hoodie:     "shirt",
  sweatshirt: "shirt",
  cardigan:   "shirt",
  crewneck:   "shirt",
  polo:       "shirt",
  tee:        "shirt",
  tshirt:     "shirt",
  henley:     "shirt",
  flannel:    "shirt",
  blouse:     "shirt",
  top:        "shirt",
};

export function normalizeType(type) {
  if (!type) return "shirt";
  const key = type.toLowerCase();
  // outfit-photo is never a wearable garment type
  if (key === "outfit-photo" || key === "outfit-shot") return "outfit-photo";
  return TYPE_MAP[key] ?? key;
}
