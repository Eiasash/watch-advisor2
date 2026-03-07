/**
 * Rule-based garment classifier.
 * Priority: strong filename match > image shape heuristics > dominant color > default.
 *
 * Key insight: total non-bg pixel count + zone distribution at 30×30:
 *   - Full-frame flat lay garment: total ~600-900, zones ~even (0.30-0.37 each)
 *   - Hanger shirt:                total ~300-600, topF high (>0.40)
 *   - Shoes pair on floor:         total ~100-350, botF high (>0.50) OR bilateral
 *   - Single shoe:                 total ~80-200,  botF high
 *   - Jeans/pants laid flat:       total ~400-700, midF+botF > topF
 *   - Mirror selfie / person:      filename keyword only — pixel zones cannot reliably distinguish
 *   - Watch/wrist closeup:         total low (<150), high bot or even — NOT pants
 *
 * NEVER classify as outfit-shot based on zone balance alone.
 * ONLY classify as outfit-shot via selfie filename keywords.
 */

// ─── Filename rules ───────────────────────────────────────────────────────────

const TYPE_RULES = [
  { type: "shoes",  kws: ["shoe","shoes","sneaker","sneakers","trainer","trainers","loafer","loafers","derby","derbies","boot","boots","chelsea","brogue","brogues","sandal","sandals","mule","slipper","oxford shoe","oxfords","pump","pumps","heel","heels"] },
  { type: "pants",  kws: ["pant","pants","trouser","trousers","chino","chinos","jean","jeans","jogger","joggers","slack","slacks","shorts","cargo","legging","leggings","culottes"] },
  { type: "jacket", kws: ["jacket","blazer","coat","overcoat","bomber","parka","anorak","gilet","cardigan","zip-up","zipup","overshirt","fleece","windbreaker","raincoat","peacoat"] },
  { type: "shirt",  kws: ["shirt","tee","tshirt","t-shirt","polo","ocbd","knit","sweater","pullover","hoodie","sweatshirt","sweat","flannel","blouse","top","henley","jersey","crewneck"] },
];

const COLOR_RULES = [
  { color: "black",  kws: ["black","noir","ebony","onyx","jet"] },
  { color: "white",  kws: ["white","ivory","cream","ecru","off-white","offwhite","optical"] },
  { color: "navy",   kws: ["navy","midnight","ink","marine"] },
  { color: "blue",   kws: ["blue","cobalt","denim","indigo","sky","royal","cornflower"] },
  { color: "grey",   kws: ["grey","gray","slate","charcoal","melange","ash","silver","marl","heather"] },
  { color: "brown",  kws: ["brown","chocolate","cognac","mocha","espresso","walnut","tobacco","mahogany"] },
  { color: "tan",    kws: ["tan","camel","khaki","sand","wheat","biscuit","nude","taupe","buff"] },
  { color: "beige",  kws: ["beige","stone","oat","parchment","mushroom","greige"] },
  { color: "olive",  kws: ["olive","army","military","sage","moss","khaki-green","od green"] },
  { color: "green",  kws: ["green","emerald","forest","hunter","teal","mint","pine","bottle"] },
  { color: "red",    kws: ["red","burgundy","wine","maroon","brick","rust","crimson","bordeaux","claret"] },
];

const FORMALITY_MAP = {
  derby: 8, derbies: 8, brogue: 8, brogues: 8,
  loafer: 6, loafers: 6, chelsea: 7, boot: 6, boots: 6,
  sneaker: 3, sneakers: 3, trainer: 3, trainers: 3, sandal: 2, sandals: 2,
  blazer: 8, coat: 8, overcoat: 9, peacoat: 8, bomber: 5, parka: 4, cardigan: 5,
  hoodie: 3, sweatshirt: 3, sweat: 3, fleece: 3,
  polo: 5, tee: 3, tshirt: 3, knit: 5, sweater: 5, crewneck: 5,
  trouser: 7, trousers: 7, chino: 5, chinos: 5,
  jean: 4, jeans: 4, jogger: 3, joggers: 3, cargo: 3, shorts: 3,
};

// Only explicit person/mirror/outfit keywords → outfit-shot
// Camera roll patterns (IMG_1234, DSC_0042) are NOT selfies
const SELFIE_KWS = [
  "selfie","mirror","ootd","fitcheck","fit-check","fit check",
  "outfit of the day","full body","full-body","fullbody","lookbook",
];

export function classifyFromFilename(filename) {
  const lower = filename.toLowerCase().replace(/[_\-\.]/g, " ");
  const words = lower.split(/\s+/).filter(Boolean);

  let type = null;
  outer: for (const rule of TYPE_RULES) {
    for (const kw of rule.kws) {
      const isMultiWord = kw.includes(" ");
      if (isMultiWord ? lower.includes(kw) : words.includes(kw)) {
        type = rule.type;
        break outer;
      }
    }
  }

  let color = null;
  for (const rule of COLOR_RULES) {
    for (const kw of rule.kws) {
      if (words.includes(kw) || lower.includes(kw)) { color = rule.color; break; }
    }
    if (color) break;
  }

  let formality = null;
  for (const word of words) {
    if (FORMALITY_MAP[word] != null) { formality = FORMALITY_MAP[word]; break; }
  }
  if (formality == null) formality = { shirt: 5, pants: 5, shoes: 5, jacket: 7 }[type] ?? 5;

  const isSelfieFilename = SELFIE_KWS.some(k => lower.includes(k));
  const isCameraRoll = /^(img|dsc|dscn|photo|pic|pxl|screenshot|wp|cam|capture)[\s_]?\d{3,}/i.test(
    filename.replace(/\.[^.]+$/, "")
  );
  const confidence = type != null ? (isCameraRoll ? "medium" : "high") : "low";

  return { type: type ?? null, color: color ?? null, formality, isSelfieFilename, isCameraRoll, confidence };
}

// ─── Pixel helpers ────────────────────────────────────────────────────────────

const PALETTE = [
  { name: "black",  r: 18,  g: 18,  b: 18  },
  { name: "white",  r: 242, g: 242, b: 242 },
  { name: "grey",   r: 128, g: 128, b: 128 },
  { name: "navy",   r: 20,  g: 35,  b: 85  },
  { name: "blue",   r: 45,  g: 95,  b: 195 },
  { name: "brown",  r: 95,  g: 55,  b: 25  },
  { name: "tan",    r: 175, g: 140, b: 95  },
  { name: "beige",  r: 215, g: 198, b: 165 },
  { name: "olive",  r: 95,  g: 105, b: 45  },
  { name: "green",  r: 35,  g: 125, b: 55  },
  { name: "red",    r: 175, g: 35,  b: 35  },
];

function colorDist(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt(2*(r1-r2)**2 + 4*(g1-g2)**2 + 3*(b1-b2)**2);
}
function nearestPalette(r, g, b) {
  let best = PALETTE[0]; let bestD = Infinity;
  for (const p of PALETTE) {
    const d = colorDist(r, g, b, p.r, p.g, p.b);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best.name;
}
function loadImageFromDataURL(dataURL) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = () => rej(new Error("img decode failed"));
    img.src = dataURL;
  });
}

// Returns true if pixel should be treated as background
function isBgPixel(r, g, b) {
  if (r > 215 && g > 215 && b > 215) return true;                          // near-white
  if (Math.max(r,g,b) - Math.min(r,g,b) < 15 && r > 185 && g > 185 && b > 185) return true; // light neutral
  if (r > 155 && r > g + 18 && r > b + 18 && g > 120 && b > 120) return true; // pink/mauve bedding
  if (r > 170 && g > 155 && b > 130 && Math.max(r,g,b) - Math.min(r,g,b) < 40) return true; // warm beige floor/rug
  return false;
}

export async function extractDominantColor(thumbnailDataURL) {
  if (!thumbnailDataURL || !thumbnailDataURL.startsWith("data:")) return null;
  try {
    const SIZE = 48;
    const img = await loadImageFromDataURL(thumbnailDataURL);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

    const CENTER = SIZE / 2;
    const EDGE_ZONE = SIZE * 0.22;
    const tally = {};
    let counted = 0;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
        if (a < 100) continue;
        if (isBgPixel(r, g, b)) continue;
        const dist = Math.sqrt((x - CENTER)**2 + (y - CENTER)**2);
        const weight = dist > (CENTER - EDGE_ZONE) ? 1 : 3;
        const name = nearestPalette(r, g, b);
        tally[name] = (tally[name] ?? 0) + weight;
        counted += weight;
      }
    }

    if (counted < 15) return null;
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const top = sorted[0]; const runner = sorted[1];
    // Prefer runner-up over ambiguous grey (grey = common shadow/background tone)
    if (top?.[0] === "grey" && runner && runner[1] > top[1] * 0.7) return runner[0];
    return top?.[0] ?? null;
  } catch { return null; }
}

/**
 * Pixel zone analysis at 30×30.
 *
 * Returns:
 *   likelyType        — "shoes" | "pants" | "shirt" | null
 *   likelyOutfitShot  — ONLY via filename keywords, never via zones alone
 *   flatLay           — true when garment fills frame evenly (the NORMAL case for flat-lay photos)
 *   debug             — object with all intermediate values for logging
 */
export async function analyzeImageContent(thumbnailDataURL) {
  const none = { likelyType: null, likelyOutfitShot: false, flatLay: false, debug: {} };
  if (!thumbnailDataURL || !thumbnailDataURL.startsWith("data:")) return none;
  try {
    const SIZE = 30;
    const img = await loadImageFromDataURL(thumbnailDataURL);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

    let topNB = 0, midNB = 0, botNB = 0;
    // Also track left/right halves for bilateral shoe detection
    let leftNB = 0, rightNB = 0;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
        if (a < 100) continue;
        if (isBgPixel(r, g, b)) continue;
        if (y < 10)      topNB++;
        else if (y < 20) midNB++;
        else             botNB++;
        if (x < 15) leftNB++; else rightNB++;
      }
    }

    const total = topNB + midNB + botNB;
    if (total < 8) return { ...none, debug: { total, reason: "too-few-pixels" } };

    const topF = topNB / total;
    const midF = midNB / total;
    const botF = botNB / total;
    const maxLR = Math.max(leftNB, rightNB);
    const minLR = Math.min(leftNB, rightNB);
    const bilatBalance = minLR / (maxLR || 1); // 1.0 = perfectly bilateral

    // ── Flat-lay detection ──────────────────────────────────────────────────
    // A garment laid flat on a bed fills the frame evenly — this is the GOOD CASE.
    // HIGH total + EVEN zones = flat-lay garment, NOT outfit-shot.
    const isEven = Math.max(topF, midF, botF) - Math.min(topF, midF, botF) < 0.12;
    const flatLay = total > 200 && isEven;

    // ── Shoe detection ──────────────────────────────────────────────────────
    // Shoes: low-to-medium occupancy, bottom-heavy OR bilateral pair
    // Guard: total must be < 500 — a full-frame flat-lay shirt is not shoes
    // Bilateral: two shoes side by side have balanced left/right pixel mass
    const shoesLowTotal = total < 450;
    const shoesBottomHeavy = botF > 0.48 && topF < 0.22;
    const shoesBilateral = bilatBalance > 0.6 && total < 350 && botF > 0.35;
    const likelyShoes = shoesLowTotal && (shoesBottomHeavy || shoesBilateral);

    const shoesReason = likelyShoes
      ? (shoesBilateral ? "bilateral-pair" : "bottom-heavy")
      : null;

    // ── Pants detection ─────────────────────────────────────────────────────
    // Pants laid flat: mid+bot heavy, topF low, MEDIUM total (not a tiny closeup)
    // Guard against wrist/watch closeups: total must be > 80 AND not be too small
    // Guard against flat-lay shirts: if flatLay is true, don't also call pants
    const likelyPants = !flatLay
      && !likelyShoes
      && (midF + botF) > 0.70
      && topF < 0.30
      && total > 80
      && total < 800; // wrist closeup would be low total; full garment flat-lay would flatLay=true

    const pantsReason = likelyPants ? `mid+bot=${((midF+botF)*100).toFixed(0)}%` : null;

    // ── Hanger/shirt detection ───────────────────────────────────────────────
    // Shirt on hanger: top-heavy, medium total, narrow bottom
    const likelyHangerShirt = !flatLay && !likelyShoes && !likelyPants
      && topF > 0.40 && botF < 0.20 && total > 40 && total < 600;

    const hangerReason = likelyHangerShirt ? `topF=${topF.toFixed(2)}` : null;

    // ── Type resolution ──────────────────────────────────────────────────────
    let likelyType = null;
    if (likelyShoes)       likelyType = "shoes";
    else if (likelyPants)  likelyType = "pants";
    else if (likelyHangerShirt) likelyType = "shirt";
    // flatLay → null type (let default shirt handle it — it's probably a shirt/jacket/knit)

    // ── Outfit-shot: NEVER from pixel zones ─────────────────────────────────
    // Outfit-shot detection is 100% filename-driven (selfie/mirror keywords).
    // Zone analysis cannot reliably detect a person vs a flat-lay garment.
    // This prevents the core bug: even zones + high total ≠ person.
    const likelyOutfitShot = false;

    const debug = {
      total, topF: +topF.toFixed(3), midF: +midF.toFixed(3), botF: +botF.toFixed(3),
      bilatBalance: +bilatBalance.toFixed(3),
      flatLay, likelyShoes, likelyPants, likelyHangerShirt,
      shoesReason, pantsReason, hangerReason,
    };

    console.log("[zones]",
      `top:${topF.toFixed(2)} mid:${midF.toFixed(2)} bot:${botF.toFixed(2)} total:${total}`,
      `| flatLay:${flatLay} bilat:${bilatBalance.toFixed(2)}`,
      `| type→${likelyType ?? "null"}`,
      shoesReason  ? `shoes:${shoesReason}`  : "",
      pantsReason  ? `pants:${pantsReason}`  : "",
      hangerReason ? `hanger:${hangerReason}` : "",
    );

    return { likelyType, likelyOutfitShot, flatLay, debug };
  } catch (e) {
    return { ...none, debug: { error: e.message } };
  }
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

function hammingDistance(h1, h2) {
  if (!h1 || !h2 || h1.length !== h2.length) return 999;
  let d = 0;
  for (let i = 0; i < h1.length; i++) if (h1[i] !== h2[i]) d++;
  return d;
}

export function findPossibleDuplicate(newHash, existingGarments, threshold = 6) {
  if (!newHash || newHash.length < 8) return null;
  for (const g of existingGarments) {
    if (g.hash && hammingDistance(newHash, g.hash) <= threshold) return g.id;
  }
  return null;
}

// ─── Master classify ──────────────────────────────────────────────────────────

export async function classify(filename, thumbnailDataURL, hash, existingGarments = []) {
  const fn = classifyFromFilename(filename);

  const [pixels, pixelColor] = await Promise.all([
    analyzeImageContent(thumbnailDataURL),
    extractDominantColor(thumbnailDataURL),
  ]);

  // ── TYPE ──────────────────────────────────────────────────────────────────
  let type, typeSource;

  if (fn.type != null && fn.confidence === "high") {
    type = fn.type;
    typeSource = "filename-high";
  } else if (fn.type != null && fn.confidence === "medium") {
    // Camera-roll file with a garment keyword — trust keyword unless image strongly disagrees
    if (pixels.likelyType && pixels.likelyType !== fn.type) {
      // Shape-obvious types (shoes/pants) override medium filename confidence
      type = (pixels.likelyType === "shoes" || pixels.likelyType === "pants")
        ? pixels.likelyType : fn.type;
      typeSource = "image-override";
    } else {
      type = fn.type;
      typeSource = "filename-medium";
    }
  } else if (fn.type == null && pixels.likelyType) {
    type = pixels.likelyType;
    typeSource = "image";
  } else {
    // No filename keyword, no image signal — flat-lay default
    // shirt is the right default (majority of wardrobe, catches knits/sweaters/jackets too)
    type = "shirt";
    typeSource = "default";
  }

  // ── COLOR ──────────────────────────────────────────────────────────────────
  const color = fn.color ?? pixelColor ?? "grey";

  // ── PHOTO TYPE ──────────────────────────────────────────────────────────────
  // ONLY filename selfie keywords trigger outfit-shot.
  // Pixel zone analysis CANNOT reliably detect a person vs a flat-lay.
  const photoType = fn.isSelfieFilename ? "outfit-shot" : "garment";

  // ── NEEDS REVIEW ────────────────────────────────────────────────────────────
  // True only when:
  //   1. Explicit outfit-shot (selfie/mirror keyword in filename)
  //   2. Absolutely no signal — camera-roll file, no color, no image type hint
  // A flat-lay garment with a detected color is NOT flagged for review.
  const totallyBlind = typeSource === "default" && !pixelColor && !pixels.likelyType;
  const needsReview  = photoType === "outfit-shot" || totallyBlind;

  const duplicateOf = findPossibleDuplicate(hash, existingGarments) ?? undefined;

  const result = {
    type, color,
    formality: fn.formality,
    photoType,
    needsReview,
    ...(duplicateOf ? { duplicateOf } : {}),
    _confidence: fn.confidence,
    _typeSource: typeSource,
    _flatLay: pixels.flatLay,
  };

  // Rich classifier log
  const fallbackReason = typeSource === "default"
    ? `no-filename-keyword; pixelType=${pixels.likelyType ?? "null"}; flatLay=${pixels.flatLay}`
    : null;

  console.log(
    "[classifier]", filename,
    "→", result.type, result.color,
    "| photo:", result.photoType,
    "| review:", result.needsReview,
    "| src:", typeSource,
    "| pixColor:", pixelColor,
    "| imgType:", pixels.likelyType,
    "| flatLay:", pixels.flatLay,
    "| outfitShotReason:", fn.isSelfieFilename ? "selfie-keyword" : "none",
    ...(pixels.debug?.shoesReason  ? ["| shoes:", pixels.debug.shoesReason]  : []),
    ...(pixels.debug?.pantsReason  ? ["| pants:", pixels.debug.pantsReason]  : []),
    ...(pixels.debug?.hangerReason ? ["| hanger:", pixels.debug.hangerReason] : []),
    ...(fallbackReason             ? ["| fallback:", fallbackReason]           : []),
    ...(duplicateOf                ? ["| DUPE:", duplicateOf]                  : []),
  );

  return result;
}
