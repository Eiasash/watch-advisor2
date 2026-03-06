/**
 * Rule-based garment classifier.
 * Combines filename heuristics + thumbnail pixel analysis.
 * Returns { type, color, formality, photoType, needsReview, confidence }
 */

// ─── Filename rules ───────────────────────────────────────────────────────────

const TYPE_RULES = [
  // shoes — highest priority, catch before "oxford" shirt match
  { type: "shoes",  score: 10, kws: ["shoe","shoes","sneaker","sneakers","trainer","loafer","loafers","derby","derbies","boot","boots","chelsea","brogue","brogues","sandal","mule","slipper"] },
  // pants
  { type: "pants",  score: 10, kws: ["pant","pants","trouser","trousers","chino","chinos","jean","jeans","jogger","joggers","slack","slacks","bottom","shorts","cargo"] },
  // jacket / outerwear
  { type: "jacket", score: 10, kws: ["jacket","blazer","coat","overcoat","bomber","parka","anorak","gilet","cardigan","zip-up","zipup","overshirt","fleece"] },
  // shirt (after shoes so "oxford" doesn't match shoes first)
  { type: "shirt",  score: 8,  kws: ["shirt","tee","tshirt","t-shirt","polo","ocbd","oxford","knit","sweater","pullover","hoodie","sweatshirt","sweat","flannel","blouse","top","henley"] },
];

const COLOR_RULES = [
  { color: "black",  kws: ["black","noir","ebony","onyx"] },
  { color: "white",  kws: ["white","ivory","cream","ecru","off-white","offwhite"] },
  { color: "navy",   kws: ["navy","midnight","ink"] },
  { color: "blue",   kws: ["blue","cobalt","denim","indigo","sky","royal"] },
  { color: "grey",   kws: ["grey","gray","slate","charcoal","melange","ash","silver","marl"] },
  { color: "brown",  kws: ["brown","chocolate","cognac","mocha","espresso","walnut"] },
  { color: "tan",    kws: ["tan","camel","khaki","sand","wheat","biscuit","nude","taupe"] },
  { color: "beige",  kws: ["beige","stone","oat","cream","ecru","off-white"] },
  { color: "olive",  kws: ["olive","army","military","khaki-green","sage","moss"] },
  { color: "green",  kws: ["green","emerald","forest","hunter","teal","mint","pine"] },
  { color: "red",    kws: ["red","burgundy","wine","maroon","brick","rust","crimson","bordeaux"] },
];

// Mirror / selfie indicators — these are outfit shots not single garments
const SELFIE_KWS = ["selfie","mirror","outfit","ootd","look","fitcheck","fit-check","full-body","fullbody","person","me ","_me","photo","img_","dsc","dsc_","img-","pic"];

const FORMALITY_OVERRIDES = {
  // shoes
  derby: 8, derbies: 8, brogue: 8, brogues: 8, oxford: 7,
  loafer: 6, loafers: 6, chelsea: 7, boot: 6, boots: 6,
  sneaker: 3, sneakers: 3, trainer: 3,
  // tops
  blazer: 8, coat: 8, overcoat: 9,
  bomber: 5, hoodie: 3, sweatshirt: 3, sweat: 3,
  polo: 5, tee: 3, tshirt: 3,
  // bottoms
  trouser: 7, trousers: 7, chino: 5, chinos: 5, jean: 4, jeans: 4,
  jogger: 3, joggers: 3, cargo: 3,
};

export function classifyFromFilename(filename) {
  const lower = filename.toLowerCase().replace(/[_\-\.]/g, " ");
  const words = lower.split(/\s+/);

  // Type
  let type = null;
  let typeScore = 0;
  for (const rule of TYPE_RULES) {
    if (rule.kws.some(k => lower.includes(k))) {
      if (rule.score > typeScore) { type = rule.type; typeScore = rule.score; }
    }
  }

  // Color
  let color = null;
  for (const rule of COLOR_RULES) {
    if (rule.kws.some(k => lower.includes(k))) { color = rule.color; break; }
  }

  // Formality from individual words
  let formality = null;
  for (const word of words) {
    if (FORMALITY_OVERRIDES[word] != null) {
      formality = FORMALITY_OVERRIDES[word];
      break;
    }
  }
  // Default formality by type if no word matched
  if (formality == null) {
    formality = { shirt: 5, pants: 5, shoes: 5, jacket: 7 }[type] ?? 5;
  }

  // Selfie / outfit shot detection from filename
  const isSelfieFilename = SELFIE_KWS.some(k => lower.includes(k))
    || /^img_?\d{4,}/i.test(filename)   // IMG_1234 pattern
    || /^dsc_?\d{4,}/i.test(filename)   // DSC_1234 pattern
    || /^photo_?\d{4,}/i.test(filename);

  // Confidence: high if type matched from specific keyword, medium if defaulted
  const confidence = type ? (typeScore >= 10 ? "high" : "medium") : "low";

  return {
    type: type ?? "shirt",
    color: color ?? null,       // null = not found from filename, will use pixel
    formality,
    isSelfieFilename,
    confidence,
    typeScore,
  };
}

// ─── Pixel analysis on thumbnail ─────────────────────────────────────────────

const PALETTE = [
  { name: "black",  r: 20,  g: 20,  b: 20  },
  { name: "white",  r: 240, g: 240, b: 240 },
  { name: "grey",   r: 128, g: 128, b: 128 },
  { name: "navy",   r: 25,  g: 40,  b: 90  },
  { name: "blue",   r: 50,  g: 100, b: 200 },
  { name: "brown",  r: 100, g: 60,  b: 30  },
  { name: "tan",    r: 180, g: 145, b: 100 },
  { name: "beige",  r: 220, g: 200, b: 170 },
  { name: "olive",  r: 100, g: 110, b: 50  },
  { name: "green",  r: 40,  g: 130, b: 60  },
  { name: "red",    r: 180, g: 40,  b: 40  },
];

function colorDist(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
}

function nearestPaletteColor(r, g, b) {
  let best = PALETTE[0]; let bestD = Infinity;
  for (const p of PALETTE) {
    const d = colorDist(r, g, b, p.r, p.g, p.b);
    if (d < bestD) { bestD = d; best = p; }
  }
  return { name: best.name, dist: bestD };
}

/**
 * Extract dominant color from thumbnail data URL.
 * Samples every 4th pixel, ignores near-white background.
 * Returns palette color name.
 */
export function extractDominantColor(thumbnailDataURL) {
  if (!thumbnailDataURL) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 60; canvas.height = 60;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.src = thumbnailDataURL;
    // Draw synchronously — img is already decoded if from same session
    ctx.drawImage(img, 0, 0, 60, 60);
    const { data } = ctx.getImageData(0, 0, 60, 60);

    // Tally palette hits, ignoring near-white (background) pixels
    const tally = {};
    let counted = 0;
    for (let i = 0; i < data.length; i += 16) { // step 4 pixels
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 128) continue;
      // Skip near-white background (>210 on all channels)
      if (r > 210 && g > 210 && b > 210) continue;
      const { name } = nearestPaletteColor(r, g, b);
      tally[name] = (tally[name] ?? 0) + 1;
      counted++;
    }

    if (counted < 10) return null; // not enough non-background pixels

    const dominant = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
    return dominant ?? null;
  } catch {
    return null;
  }
}

/**
 * Heuristic image-content analysis on 240×240 thumbnail.
 * Returns { likelyType, likelyOutfitShot, likelyHanger }
 * Uses pixel brightness distribution to infer content.
 */
export function analyzeImageContent(thumbnailDataURL) {
  if (!thumbnailDataURL) return { likelyType: null, likelyOutfitShot: false, likelyHanger: false };
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 30; canvas.height = 30;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.src = thumbnailDataURL;
    ctx.drawImage(img, 0, 0, 30, 30);
    const { data } = ctx.getImageData(0, 0, 30, 30);
    const W = 30, H = 30;

    // Divide into zones: top-third, mid-third, bottom-third
    let topBrightness = 0, midBrightness = 0, botBrightness = 0;
    let topNonBg = 0, midNonBg = 0, botNonBg = 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = data[i], g = data[i+1], b = data[i+2];
        const brightness = (r + g + b) / 3;
        const isNonBg = !(r > 210 && g > 210 && b > 210);
        const zone = y < 10 ? "top" : y < 20 ? "mid" : "bot";
        if (zone === "top")      { topBrightness += brightness; if (isNonBg) topNonBg++; }
        else if (zone === "mid") { midBrightness += brightness; if (isNonBg) midNonBg++; }
        else                     { botBrightness += brightness; if (isNonBg) botNonBg++; }
      }
    }

    const totalNonBg = topNonBg + midNonBg + botNonBg;
    const topFrac = totalNonBg > 0 ? topNonBg / totalNonBg : 0;
    const botFrac = totalNonBg > 0 ? botNonBg / totalNonBg : 0;
    const midFrac = totalNonBg > 0 ? midNonBg / totalNonBg : 0;

    // Outfit/selfie: content spread fairly evenly across all zones
    // (a single garment item tends to be concentrated in one zone)
    const isEvenlySpread = topFrac > 0.25 && midFrac > 0.25 && botFrac > 0.25;
    const likelyOutfitShot = isEvenlySpread && totalNonBg > 200;

    // Footwear heuristic: most content in bottom half, relatively wide shape
    const likelyShoes = botFrac > 0.5 && topFrac < 0.2 && totalNonBg > 50;

    // Hanger/top heuristic: content concentrated top-to-mid
    const likelyHanger = topFrac > 0.4 && botFrac < 0.2 && totalNonBg > 50;

    // Pants heuristic: content tall and concentrated mid-to-bottom
    const likelyPants = midFrac + botFrac > 0.7 && topFrac < 0.25 && totalNonBg > 80;

    let likelyType = null;
    if (likelyShoes)  likelyType = "shoes";
    else if (likelyPants) likelyType = "pants";
    else if (likelyHanger) likelyType = "shirt"; // or jacket — needs filename to distinguish

    return { likelyType, likelyOutfitShot, likelyHanger };
  } catch {
    return { likelyType: null, likelyOutfitShot: false, likelyHanger: false };
  }
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

/**
 * Hamming distance between two dHash strings.
 */
function hammingDistance(h1, h2) {
  if (!h1 || !h2 || h1.length !== h2.length) return 999;
  let dist = 0;
  for (let i = 0; i < h1.length; i++) if (h1[i] !== h2[i]) dist++;
  return dist;
}

/**
 * Check if a new hash is likely a duplicate of an existing garment.
 * Returns matching garment id or null.
 */
export function findPossibleDuplicate(newHash, existingGarments, threshold = 6) {
  if (!newHash || newHash.length < 8) return null;
  for (const g of existingGarments) {
    if (g.hash && hammingDistance(newHash, g.hash) <= threshold) return g.id;
  }
  return null;
}

// ─── Master classify function ─────────────────────────────────────────────────

/**
 * Full classification pipeline.
 * @param {string} filename
 * @param {string|null} thumbnailDataURL
 * @param {Array} existingGarments
 */
export function classify(filename, thumbnailDataURL, hash, existingGarments = []) {
  const fn = classifyFromFilename(filename);
  const pixels = analyzeImageContent(thumbnailDataURL);

  // Dominant color: filename wins if found, else pixel extraction
  const pixelColor = extractDominantColor(thumbnailDataURL);
  const color = fn.color ?? pixelColor ?? "grey";

  // Type: filename-derived if high confidence, else blend with pixel hints
  let type = fn.type;
  let typeSource = "filename";
  if (fn.confidence === "low" && pixels.likelyType) {
    type = pixels.likelyType;
    typeSource = "image";
  } else if (fn.confidence === "medium" && pixels.likelyType && pixels.likelyType !== fn.type) {
    // Conflict — lower confidence, flag for review
    typeSource = "conflict";
  }

  // Outfit shot: filename selfie clue OR image analysis says evenly spread content
  const photoType = (fn.isSelfieFilename || pixels.likelyOutfitShot) ? "outfit-shot" : "garment";

  // needsReview: selfie shots, low confidence, or type conflict
  const needsReview = photoType === "outfit-shot"
    || fn.confidence === "low"
    || typeSource === "conflict";

  // Duplicate check
  const duplicateOf = findPossibleDuplicate(hash, existingGarments);

  return {
    type,
    color,
    formality: fn.formality,
    photoType,
    needsReview,
    duplicateOf: duplicateOf ?? undefined,
    _confidence: fn.confidence,
    _typeSource: typeSource,
  };
}
