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
  moccasin:"shoes", moccasins:"shoes", espadrille:"shoes", espadrilles:"shoes",
  "driving-shoe":"shoes", "monk-strap":"shoes", slipper:"shoes", slippers:"shoes",
  "desert-boot":"shoes", "desert-boots":"shoes", "boat-shoe":"shoes", "boat-shoes":"shoes",
  "canvas-sneaker":"shoes", "canvas-sneakers":"shoes", "lace-up":"shoes",
  slides:"shoes", slide:"shoes", clog:"shoes", clogs:"shoes",
  "monk-strap-shoes":"shoes", "wingtip":"shoes", "wingtips":"shoes",

  // Pants
  jeans:"pants", jean:"pants", trousers:"pants", trouser:"pants",
  chinos:"pants", chino:"pants", slacks:"pants", slack:"pants",
  shorts:"pants", joggers:"pants", jogger:"pants",
  cargos:"pants", cargo:"pants", corduroys:"pants", corduroy:"pants",
  khakis:"pants", sweatpants:"pants",
  "dress-trousers":"pants", "dress-pants":"pants", "wool-trousers":"pants",
  "linen-trousers":"pants", "linen-pants":"pants",
  "cargo-pants":"pants", "cargo-shorts":"pants",

  // Jacket / outerwear
  blazer:"jacket", coat:"jacket", overcoat:"jacket", bomber:"jacket",
  parka:"jacket", fleece:"jacket", peacoat:"jacket",
  windbreaker:"jacket", raincoat:"jacket",
  vest:"jacket", gilet:"jacket", shacket:"jacket",
  trench:"jacket", anorak:"jacket", duffle:"jacket",
  "field-jacket":"jacket", "safari-jacket":"jacket", harrington:"jacket",
  "trucker-jacket":"jacket", "sport-coat":"jacket", "rain-jacket":"jacket",
  "quilted-jacket":"jacket", "down-jacket":"jacket", "leather-jacket":"jacket",
  "denim-jacket":"jacket", "suede-jacket":"jacket", topcoat:"jacket",
  mackintosh:"jacket", "mac":"jacket", "wax-jacket":"jacket",

  // Sweater / knitwear  (keep as sweater, not jacket)
  cardigan:"sweater", pullover:"sweater", hoodie:"sweater",
  sweatshirt:"sweater", crewneck:"sweater",
  knitwear:"sweater", knit:"sweater",
  turtleneck:"sweater", "quarter-zip":"sweater",
  "half-zip":"sweater",
  "mock-neck":"sweater", "v-neck":"sweater", "shawl-collar":"sweater",
  "henley-knit":"sweater", "waffle-knit":"sweater",
  "cable-knit":"sweater", "chunky-knit":"sweater",
  "zip-cardigan":"sweater", "full-zip":"sweater",

  // Shirt / tops
  polo:"shirt", tee:"shirt", tshirt:"shirt", "t-shirt":"shirt",
  henley:"shirt", flannel:"shirt", overshirt:"jacket",
  blouse:"shirt", top:"shirt",
  "button-down":"shirt", "dress-shirt":"shirt",
  "camp-shirt":"shirt", hawaiian:"shirt", linen:"shirt",
  "camp-collar":"shirt", "band-collar":"shirt", chambray:"shirt",
  "oxford-shirt":"shirt", "linen-shirt":"shirt", "jersey-shirt":"shirt",
  "casual-shirt":"shirt", "print-shirt":"shirt", madras:"shirt",
  "poplin":"shirt", "broadcloth":"shirt",

  // Accessories
  belts:"belt",
  sunglass:"sunglasses", shades:"sunglasses", eyewear:"sunglasses",
  cap:"hat", beanie:"hat", fedora:"hat", bucket:"hat", beret:"hat",
  "baseball-cap":"hat", "flat-cap":"hat", "newsboy":"hat",
  scarves:"scarf", muffler:"scarf", shawl:"scarf",
  bags:"bag", backpack:"bag", tote:"bag", briefcase:"bag",
  messenger:"bag", satchel:"bag", "duffel":"bag", "holdall":"bag",
  accessories:"accessory", tie:"accessory", cufflinks:"accessory",
  "pocket-square":"accessory", wallet:"accessory",
  suspenders:"accessory", braces:"accessory",
  "bow-tie":"accessory", "lapel-pin":"accessory",
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
