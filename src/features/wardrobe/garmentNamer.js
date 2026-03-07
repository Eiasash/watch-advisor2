/**
 * Generates descriptive garment names like "khaki chino pants" or "blue leather boots"
 * instead of raw camera filenames like "IMG20260221160813".
 */

const CAMERA_ROLL_RE = /^(img|dsc|dscn|photo|pic|pxl|screenshot|wp|cam|capture|mvimg|p_|snap)[\s_]?\d{3,}/i;

const TYPE_LABELS = {
  shirt:   ["shirt", "top"],
  pants:   ["pants", "trousers"],
  shoes:   ["shoes", "footwear"],
  jacket:  ["jacket", "outerwear"],
  sweater: ["sweater", "knitwear"],
};

// Subtype keywords found in filenames
const SUBTYPE_MAP = {
  // Shoes
  sneaker: "sneakers", sneakers: "sneakers", trainer: "trainers", trainers: "trainers",
  loafer: "loafers", loafers: "loafers", boot: "boots", boots: "boots",
  chelsea: "chelsea boots", brogue: "brogues", brogues: "brogues",
  derby: "derbies", derbies: "derbies", oxford: "oxfords", oxfords: "oxfords",
  sandal: "sandals", sandals: "sandals", mule: "mules",
  // Pants
  chino: "chinos", chinos: "chinos", jean: "jeans", jeans: "jeans",
  trouser: "trousers", trousers: "trousers", jogger: "joggers", joggers: "joggers",
  slack: "slacks", slacks: "slacks", cargo: "cargos", shorts: "shorts",
  // Shirts
  polo: "polo", tee: "tee", tshirt: "t-shirt", henley: "henley",
  flannel: "flannel shirt", ocbd: "OCBD", knit: "knit",
  // Jackets
  blazer: "blazer", bomber: "bomber", parka: "parka",
  overcoat: "overcoat", peacoat: "peacoat", cardigan: "cardigan",
  hoodie: "hoodie", sweatshirt: "sweatshirt", fleece: "fleece",
};

/**
 * Build a descriptive name from classification data.
 *
 * @param {string} filename - Original filename
 * @param {string} type - Classified type (shirt/pants/shoes/jacket/sweater)
 * @param {string} color - Classified color
 * @returns {string} Descriptive name like "navy chinos" or "brown leather boots"
 */
export function buildGarmentName(filename, type, color) {
  const cleanName = filename.replace(/\.[^.]+$/, "");

  // If filename is already descriptive (not a camera roll pattern), keep it
  if (!CAMERA_ROLL_RE.test(cleanName)) {
    const humanized = cleanName.replace(/[-_]/g, " ").trim();
    if (humanized.length > 2 && humanized.length < 60) return humanized;
  }

  // Build descriptive name from classification
  const lower = cleanName.toLowerCase().replace(/[-_]/g, " ");
  const words = lower.split(/\s+/);

  // Try to find a subtype from filename
  let subtype = null;
  for (const w of words) {
    if (SUBTYPE_MAP[w]) { subtype = SUBTYPE_MAP[w]; break; }
  }

  // Compose: "[color] [subtype or type]"
  const colorPart = color && color !== "grey" ? color : "";
  const typePart = subtype || TYPE_LABELS[type]?.[0] || type || "garment";

  const name = [colorPart, typePart].filter(Boolean).join(" ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}
