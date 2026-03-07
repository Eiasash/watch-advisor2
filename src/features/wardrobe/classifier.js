/**
 * Rule-based garment classifier.
 * Priority: strong filename match > image shape heuristics > dominant color > low-confidence fallback.
 */

// ─── Filename type rules (ordered by priority — shoes before shirt catches "oxford") ──

const TYPE_RULES = [
  { type: "shoes",  kws: ["shoe","shoes","sneaker","sneakers","trainer","trainers","loafer","loafers","derby","derbies","boot","boots","chelsea","brogue","brogues","sandal","sandals","mule","slipper","oxford shoe","oxfords","pump","pumps","heel","heels"] },
  { type: "pants",  kws: ["pant","pants","trouser","trousers","chino","chinos","jean","jeans","jogger","joggers","slack","slacks","shorts","cargo","legging","leggings","culottes"] },
  { type: "jacket", kws: ["jacket","blazer","coat","overcoat","bomber","parka","anorak","gilet","cardigan","zip-up","zipup","overshirt","fleece","windbreaker","raincoat","peacoat"] },
  { type: "shirt",  kws: ["shirt","tee","tshirt","t-shirt","polo","ocbd","knit","sweater","pullover","hoodie","sweatshirt","sweat","flannel","blouse","top","henley","jersey","crewneck"] },
];

// "oxford" alone is ambiguous (shoe model AND shirt type) — only match as shoe if "shoe/shoes" also present
// handled by token-level matching below

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
  // shoes
  derby: 8, derbies: 8, brogue: 8, brogues: 8,
  loafer: 6, loafers: 6, chelsea: 7,
  boot: 6, boots: 6,
  sneaker: 3, sneakers: 3, trainer: 3, trainers: 3,
  sandal: 2, sandals: 2,
  // tops
  blazer: 8, coat: 8, overcoat: 9, peacoat: 8,
  bomber: 5, parka: 4, cardigan: 5,
  hoodie: 3, sweatshirt: 3, sweat: 3, fleece: 3,
  polo: 5, tee: 3, tshirt: 3,
  knit: 5, sweater: 5, crewneck: 5,
  // bottoms
  trouser: 7, trousers: 7,
  chino: 5, chinos: 5,
  jean: 4, jeans: 4,
  jogger: 3, joggers: 3, cargo: 3, shorts: 3,
};

// Strict selfie/person keywords — phone number patterns handled separately
// Do NOT include: "photo", "pic", "dsc", "img" alone — too broad
const SELFIE_KWS = [
  "selfie","mirror","ootd","fitcheck","fit-check","fit check",
  "outfit of the day","full body","full-body","fullbody","lookbook",
];

export function classifyFromFilename(filename) {
  // Normalise: lowercase, replace separators with space
  const lower = filename.toLowerCase().replace(/[_\-\.]/g, " ");
  const words = lower.split(/\s+/).filter(Boolean);

  // ── Type matching ──
  let type = null;
  // Check each rule in priority order — first match wins
  outer: for (const rule of TYPE_RULES) {
    for (const kw of rule.kws) {
      // Multi-word keywords need includes(); single words get exact word boundary check
      const isMultiWord = kw.includes(" ");
      if (isMultiWord ? lower.includes(kw) : words.includes(kw)) {
        type = rule.type;
        break outer;
      }
    }
  }

  // ── Color matching ──
  let color = null;
  for (const rule of COLOR_RULES) {
    for (const kw of rule.kws) {
      if (words.includes(kw) || lower.includes(kw)) { color = rule.color; break; }
    }
    if (color) break;
  }

  // ── Formality ──
  let formality = null;
  for (const word of words) {
    if (FORMALITY_MAP[word] != null) { formality = FORMALITY_MAP[word]; break; }
  }
  if (formality == null) {
    formality = { shirt: 5, pants: 5, shoes: 5, jacket: 7 }[type] ?? 5;
  }

  // ── Selfie detection — strict ──
  // Only flag as selfie when there's a genuine selfie keyword
  // Camera roll patterns (IMG_1234, DSC_0042, PHOTO_5678) → low confidence but NOT selfie
  const isSelfieFilename = SELFIE_KWS.some(k => lower.includes(k));

  // ── Confidence ──
  // high = specific garment keyword matched
  // low  = camera-roll-style filename with no garment keyword
  // medium = everything else
  const isCameraRoll = /^(img|dsc|dscn|photo|pic|pxl|screenshot|wp|cam|capture)[\s_]?\d{3,}/i.test(filename.replace(/\.[^.]+$/, ""));
  const confidence = type != null ? (isCameraRoll ? "medium" : "high") : "low";

  return {
    type: type ?? null,          // null = no keyword match; image heuristics decide
    color: color ?? null,
    formality,
    isSelfieFilename,
    isCameraRoll,
    confidence,
  };
}

// ─── Async pixel analysis ─────────────────────────────────────────────────────
// Both functions return Promises — they wait for Image.onload before drawing.

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
  // Weighted Euclidean — human eye is most sensitive to green
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

/**
 * Extract dominant non-background color from thumbnail.
 * Center pixels weighted 3×, edge pixels 1×.
 * Async — waits for image decode.
 */
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
    const EDGE_ZONE = SIZE * 0.22; // outer 22% = likely background

    const tally = {};
    let counted = 0;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
        if (a < 100) continue;

        // Skip background: near-white OR near light-grey
        const isNearWhite = r > 215 && g > 215 && b > 215;
        // Light neutral: grey/beige background — but be conservative to avoid eating cream garments.
        // Only skip if saturation is very low AND brightness very high (>185 all channels)
        const isLightNeutral = Math.max(r,g,b) - Math.min(r,g,b) < 15 && r > 185 && g > 185 && b > 185;
        // Pink/mauve fluffy surface (common bedding in wardrobe photos): r dominant, g≈b, mid-bright
        const isPinkBg = r > 160 && r > g + 20 && r > b + 20 && g > 130 && b > 130;
        if (isNearWhite || isLightNeutral || isPinkBg) continue;

        // Weight by proximity to center
        const distFromCenter = Math.sqrt((x - CENTER)**2 + (y - CENTER)**2);
        const isEdge = distFromCenter > (CENTER - EDGE_ZONE);
        const weight = isEdge ? 1 : 3;

        const name = nearestPalette(r, g, b);
        tally[name] = (tally[name] ?? 0) + weight;
        counted += weight;
      }
    }

    if (counted < 15) return null;

    // Don't return grey if it's barely ahead — grey is a common background/shadow tone
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    const runner = sorted[1];
    if (top?.[0] === "grey" && runner && runner[1] > top[1] * 0.7) {
      return runner[0]; // prefer runner-up over ambiguous grey win
    }
    return top?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Analyse image content zones.
 * Async — waits for image decode.
 * Returns { likelyType, likelyOutfitShot }
 */
export async function analyzeImageContent(thumbnailDataURL) {
  const none = { likelyType: null, likelyOutfitShot: false };
  if (!thumbnailDataURL || !thumbnailDataURL.startsWith("data:")) return none;
  try {
    const SIZE = 30;
    const img = await loadImageFromDataURL(thumbnailDataURL);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

    // Count non-background pixels per vertical third
    let topNB = 0, midNB = 0, botNB = 0;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
        if (a < 100) continue;
        const isNearWhite = r > 210 && g > 210 && b > 210;
        // Pink/beige fluffy surface: skip only if near-neutral AND all channels high
        const isLightNeutral = Math.max(r,g,b) - Math.min(r,g,b) < 15 && r > 180 && g > 180 && b > 180;
        // Pink/mauve fluffy bedding background
        const isPinkBg = r > 160 && r > g + 20 && r > b + 20 && g > 130 && b > 130;
        if (isNearWhite || isLightNeutral || isPinkBg) continue;
        if (y < 10)       topNB++;
        else if (y < 20)  midNB++;
        else              botNB++;
      }
    }

    const total = topNB + midNB + botNB;
    if (total < 8) return none; // very few non-bg pixels

    const topF = topNB / total;
    const midF = midNB / total;
    const botF = botNB / total;

    // Debug — remove after tuning
    console.log("[zones]", `top:${topF.toFixed(2)} mid:${midF.toFixed(2)} bot:${botF.toFixed(2)} total:${total}`);

    // Outfit/person shot: requires VERY strong evidence of a person.
    // A flat-lay garment with arms spread out naturally fills all three zones — do NOT flag it.
    // Only flag if zone distribution is truly even AND there is a lot of non-bg content,
    // suggesting a full person or complex multi-garment scene.
    const likelyOutfitShot = topF > 0.30 && midF > 0.30 && botF > 0.30 && total > 200;

    // Shoes: dominant mass in lower half, compressed vertical spread
    const likelyShoes  = botF > 0.55 && topF < 0.18;

    // Pants: mass in mid+bottom, relatively little at top
    const likelyPants  = (midF + botF) > 0.72 && topF < 0.28 && total > 60;

    // Hanger/shirt: mass in top+mid
    const likelyShirt  = topF > 0.38 && botF < 0.22;

    let likelyType = null;
    if (likelyShoes)      likelyType = "shoes";
    else if (likelyPants) likelyType = "pants";
    else if (likelyShirt) likelyType = "shirt";

    return { likelyType, likelyOutfitShot };
  } catch {
    return none;
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

// ─── Master classify — async ──────────────────────────────────────────────────

export async function classify(filename, thumbnailDataURL, hash, existingGarments = []) {
  const fn = classifyFromFilename(filename);

  // Run pixel analysis async (properly waits for image decode now)
  const [pixels, pixelColor] = await Promise.all([
    analyzeImageContent(thumbnailDataURL),
    extractDominantColor(thumbnailDataURL),
  ]);

  // ── TYPE PRIORITY ──
  // A. Strong filename match
  // B. Image shape heuristic
  // C. Aspect-ratio hint for pants (portrait photo + lower color mass)
  // D. Default shirt
  let type;
  let typeSource;

  if (fn.type != null && fn.confidence === "high") {
    type = fn.type;
    typeSource = "filename-high";
  } else if (fn.type != null && fn.confidence === "medium") {
    if (pixels.likelyType && pixels.likelyType !== fn.type) {
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
  } else if (fn.type == null) {
    type = "shirt"; // reasonable default — majority of wardrobe is upper body
    typeSource = "default";
  } else {
    type = fn.type;
    typeSource = "filename-low";
  }

  // ── COLOR ──
  const color = fn.color ?? pixelColor ?? "grey";

  // ── PHOTO TYPE ──
  // Strict: only explicit selfie keywords or very strong image evidence
  const photoType = (fn.isSelfieFilename || pixels.likelyOutfitShot) ? "outfit-shot" : "garment";

  // ── NEEDS REVIEW ──
  // Flag only when we genuinely have nothing to work with:
  // - outfit shot / person in frame
  // - type AND color are both unknown (truly blind)
  // If we found a color, pixel analysis worked — don't flag review just because
  // the zone heuristic couldn't determine type. shirt is a good default.
  const noSignals = typeSource === "default" && !pixelColor;
  const needsReview = photoType === "outfit-shot" || noSignals;

  const duplicateOf = findPossibleDuplicate(hash, existingGarments) ?? undefined;

  const result = {
    type,
    color,
    formality: fn.formality,
    photoType,
    needsReview,
    ...(duplicateOf ? { duplicateOf } : {}),
    _confidence: fn.confidence,
    _typeSource: typeSource,
  };

  console.log("[classifier]", filename, "→", result.type, result.color,
    "| photoType:", result.photoType,
    "| needsReview:", result.needsReview,
    "| src:", typeSource, "conf:", fn.confidence,
    "| pixelColor:", pixelColor, "likelyType:", pixels.likelyType,
    "| outfitShot:", pixels.likelyOutfitShot,
    ...(duplicateOf ? ["| DUPE:", duplicateOf] : [])
  );

  return result;
}
