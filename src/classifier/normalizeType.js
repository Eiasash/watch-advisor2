/**
 * Normalizes garment type aliases to canonical categories.
 * Canonical types: shirt, pants, shoes, jacket, sweater,
 *                  belt, sunglasses, hat, scarf, bag, accessory
 */

const TYPE_MAP = {
  // Shoes
  sneaker:"shoes", sneakers:"shoes", boots:"shoes", boot:"shoes",
  loafers:"shoes", loafer:"shoes", derby:"shoes", derbies:"shoes",
  brogue:"shoes", brogues:"shoes", oxford:"shoes", oxfords:"shoes",
  sandal:"shoes", sandals:"shoes", trainer:"shoes", trainers:"shoes",
  chelsea:"shoes", pump:"shoes", pumps:"shoes", heels:"shoes",

  // Pants
  jeans:"pants", jean:"pants", trousers:"pants", trouser:"pants",
  chinos:"pants", chino:"pants", slacks:"pants", slack:"pants",
  shorts:"pants", joggers:"pants", jogger:"pants",

  // Jacket / outerwear
  blazer:"jacket", coat:"jacket", overcoat:"jacket", bomber:"jacket",
  parka:"jacket", fleece:"jacket", peacoat:"jacket",
  windbreaker:"jacket", raincoat:"jacket",

  // Sweater / knitwear  (keep as sweater, not jacket)
  cardigan:"sweater", pullover:"sweater", hoodie:"sweater",
  sweatshirt:"sweater", crewneck:"sweater",
  knitwear:"sweater", knit:"sweater",

  // Shirt / tops
  polo:"shirt", tee:"shirt", tshirt:"shirt", "t-shirt":"shirt",
  henley:"shirt", flannel:"shirt", overshirt:"jacket",
  blouse:"shirt", top:"shirt",

  // Accessories
  belts:"belt",
  sunglass:"sunglasses", shades:"sunglasses", eyewear:"sunglasses",
  cap:"hat", beanie:"hat",
  scarves:"scarf", muffler:"scarf",
  bags:"bag", backpack:"bag", tote:"bag", briefcase:"bag",
  accessories:"accessory",
};

const ACCESSORY_TYPES = new Set([
  "belt","sunglasses","hat","scarf","bag","accessory",
]);

/** Canonical types allowed in outfit slots */
export const OUTFIT_TYPES = new Set(["shirt","pants","shoes","jacket","sweater"]);

export function normalizeType(type) {
  if (!type) return "shirt";
  const lower = type.toLowerCase().replace(/[^a-z-]/g, "");
  // outfit-photo is never a wearable garment type
  if (lower === "outfit-photo" || lower === "outfit-shot") return "outfit-photo";
  return TYPE_MAP[lower] ?? lower;
}

/** True if this type should be excluded from shirt/pants/shoes/jacket outfit slots */
export function isAccessoryType(type) {
  return ACCESSORY_TYPES.has(type);
}
