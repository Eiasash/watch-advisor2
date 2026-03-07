/**
 * Garment classifier — conservative by design.
 *
 * Core philosophy:
 *   It is always better to review an ambiguous item than to wrongly classify it.
 *   pants is the most damage-prone type — restrict it severely.
 *   shoes is terminal — once detected, nothing overrides.
 *   flat-lay is the normal case for wardrobe photos — treat it as a positive signal.
 *   person-in-frame detection via pixel zones is unreliable → use filename only.
 *
 * Decision order (strict):
 *   1. Filename high-confidence   → use it
 *   2. Filename medium            → use it (shoes image can upgrade)
 *   3. Image: shoes               → terminal, return shoes
 *   4. Image: hanger/shirt        → return shirt
 *   5. Image: flat-lay            → return shirt, no review
 *   6. Image: pants               → ONLY on very strong lower-body signal
 *                                   + NOT flat-lay + NOT shoes + NOT hanger
 *                                   + topF very low + total in narrow range
 *   7. Ambiguous                  → needsReview true, type shirt (safe fallback)
 *   8. Blind                      → needsReview true
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

// Only literal selfie/mirror/ootd terms trigger selfie filename flag.
// Camera-roll filenames (IMG_1234, DSC_0042) are NOT selfies.
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
      const multi = kw.includes(" ");
      if (multi ? lower.includes(kw) : words.includes(kw)) { type = rule.type; break outer; }
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
    const d = colorDist(r,g,b,p.r,p.g,p.b);
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
 * Background pixel filter.
 */
function isBgPixel(r, g, b) {
  if (r > 215 && g > 215 && b > 215) return true;                                            // near-white
  if (Math.max(r,g,b) - Math.min(r,g,b) < 15 && r > 185 && g > 185 && b > 185) return true; // light neutral
  if (r > 155 && r > g + 18 && r > b + 18 && g > 120 && b > 120) return true;                // pink/mauve bedding
  if (r > 170 && g > 155 && b > 130 && Math.max(r,g,b) - Math.min(r,g,b) < 40) return true; // warm beige floor
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
    const tally = {}; let counted = 0;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
        if (a < 100) continue;
        if (isBgPixel(r,g,b)) continue;
        const dist = Math.sqrt((x-CENTER)**2 + (y-CENTER)**2);
        const weight = dist > (CENTER - EDGE_ZONE) ? 1 : 3;
        const name = nearestPalette(r,g,b);
        tally[name] = (tally[name] ?? 0) + weight;
        counted += weight;
      }
    }

    if (counted < 15) return null;
    const sorted = Object.entries(tally).sort((a,b) => b[1]-a[1]);
    const top = sorted[0]; const runner = sorted[1];
    // Avoid returning ambiguous grey when a color is nearly as dominant
    if (top?.[0] === "grey" && runner && runner[1] > top[1] * 0.7) return runner[0];
    return top?.[0] ?? null;
  } catch { return null; }
}

/**
 * Zone analysis at 30×30.
 *
 * Returns:
 * {
 *   total, topF, midF, botF, bilatBalance,
 *   flatLay,       — high total + even zone spread → definite garment
 *   shoes,         — { fires, reason }  terminal
 *   shirt,         — { fires, reason }  hanger/top-heavy
 *   pants,         — { fires, reason }  STRICT: only very strong lower-body
 *   ambiguous,     — { fires, reason }  everything else that wasn't caught above
 *   likelyType,    — "shoes"|"shirt"|"pants"|null
 * }
 *
 * IMPORTANT: pixel zones cannot distinguish a standing person from a garment
 * filling the frame — this was empirically proven. Therefore:
 *   - person-photo detection is FILENAME-ONLY (selfie/mirror/ootd keywords)
 *   - pixel zones only detect unambiguous structural signals:
 *       shoes (extreme bottom-heavy or bilateral compact pair)
 *       hanger (extreme top-heavy)
 *       pants (very strict: near-empty top + strong lower mass + tight total range)
 *   - everything else falls to flat-lay or ambiguous
 *
 * Pants rule is deliberately narrow:
 *   topF < 0.15   (top zone nearly empty — not just "low")
 *   topNB < 12    (absolute top pixel count; person head always exceeds this)
 *   midF+botF > 0.85
 *   total 90–500  (excludes tiny closeups AND massive flat-lays)
 *   not flatLay, not shoes, not shirt, not personLike
 * This catches actual folded jeans / laid-flat trousers while rejecting
 * person legs, long knitwear, seated outfit shots, and partial body crops.
 */
export async function analyzeImageContent(thumbnailDataURL, filename = "") {
  const none = {
    total: 0, topF: 0, midF: 0, botF: 0, bilatBalance: 0,
    flatLay: false,
    personLike: false,
    shoes:     { fires: false, reason: null },
    shirt:     { fires: false, reason: null },
    pants:     { fires: false, reason: null },
    ambiguous: { fires: false, reason: null },
    likelyType: null,
  };
  if (!thumbnailDataURL || !thumbnailDataURL.startsWith("data:")) return none;

  try {
    const SIZE = 30;
    const img = await loadImageFromDataURL(thumbnailDataURL);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

    let topNB = 0, midNB = 0, botNB = 0, leftNB = 0, rightNB = 0;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
        if (a < 100) continue;
        if (isBgPixel(r,g,b)) continue;
        if      (y < 10) topNB++;
        else if (y < 20) midNB++;
        else             botNB++;
        if (x < 15) leftNB++; else rightNB++;
      }
    }

    const total = topNB + midNB + botNB;
    if (total < 8) return { ...none, total };

    const topF = topNB / total;
    const midF = midNB / total;
    const botF = botNB / total;
    const maxLR = Math.max(leftNB, rightNB);
    const minLR = Math.min(leftNB, rightNB);
    const bilatBalance = minLR / (maxLR || 1);

    // ── Flat-lay ──────────────────────────────────────────────────────────────
    const zoneSpread = Math.max(topF, midF, botF) - Math.min(topF, midF, botF);
    const flatLay    = total > 170 && zoneSpread < 0.14;

    // ── Person-like signal (geometry only, no color) ──────────────────────────
    // A standing/seated person fills all three zones with meaningful absolute mass.
    // Flat garments on a bed do NOT — they either have near-zero top (jeans cropped
    // at waistband) or get caught by flatLay above.
    //
    // Requirements (ALL):
    //   topNB > 18    — head/shoulders always produce real top-zone pixels
    //   midNB > 40    — torso mass
    //   botNB > 40    — legs/feet present
    //   total >= 180  — minimum frame occupancy for a person
    //   !flatLay      — flat-lays are garments, not people
    //
    // Deliberately NOT using skin-tone: warm fabric (tan, beige, camel, brown leather)
    // matches any loose skin heuristic at 30×30 and produces false person signals.
    // Geometry is more reliable at this resolution.
    const personStructure = topNB > 18 && midNB > 40 && botNB > 40 && total >= 180;
    const personLike      = personStructure && !flatLay;
    const personReason    = personLike
      ? `all-zones topNB=${topNB} midNB=${midNB} botNB=${botNB} total=${total}`
      : null;

    // ── Shoes (terminal) ─────────────────────────────────────────────────────
    // Three signals — any fires (terminal, blocks pants):
    //   A. Bottom-heavy: shoe clearly in lower frame. Relaxed 0.52 → 0.44 to catch
    //      boots/shoes photographed from standing height.
    //   B. Bilateral + bottom: two shoes side by side, lower frame.
    //   C. Mid-frame compact: shoes on floor at eye level — body in mid zone,
    //      total < 280 prevents bulky sweaters from matching.
    const shoesBottomHeavy = total < 420 && botF > 0.44 && topF < 0.18;
    const shoesBilateral   = total < 350 && bilatBalance > 0.55 && botF > 0.32 && topF < 0.28;
    const shoesMidFrame    = total < 280 && botF > 0.36 && midF > 0.28 && topF < 0.18 && bilatBalance > 0.42;
    const shoesFires  = shoesBottomHeavy || shoesBilateral || shoesMidFrame;
    const shoesReason = shoesFires
      ? (shoesMidFrame && !shoesBottomHeavy && !shoesBilateral
          ? `mid-frame bilat=${bilatBalance.toFixed(2)} botF=${botF.toFixed(2)} midF=${midF.toFixed(2)} total=${total}`
          : shoesBilateral
            ? `bilateral bilat=${bilatBalance.toFixed(2)} botF=${botF.toFixed(2)} total=${total}`
            : `bottom-heavy botF=${botF.toFixed(2)} topF=${topF.toFixed(2)} total=${total}`)
      : null;

    // ── Hanger / shirt (top-heavy) ────────────────────────────────────────────
    // Shirt on hanger: top zone very dominant, narrow bottom mass, moderate total.
    const shirtFires  = !flatLay && !shoesFires
      && topF > 0.42 && botF < 0.18 && total > 30 && total < 600;
    const shirtReason = shirtFires
      ? `hanger topF=${topF.toFixed(2)} botF=${botF.toFixed(2)} total=${total}`
      : null;

    // ── Pants (very strict) ───────────────────────────────────────────────────
    // Deliberately narrow. Requirements (ALL must hold):
    //
    //   topF < 0.15      — top zone nearly empty (tightened from 0.18)
    //                      A person's head/torso always produces topF > 0.15 even
    //                      when partially cropped. Folded jeans have topF ≈ 0.02–0.10.
    //   topNB < 12       — absolute top pixels low (direct count guard)
    //                      Person standing with head near top always has topNB > 12.
    //                      Folded jeans cropped at waistband: topNB ≈ 0–8.
    //   mid+bot > 0.85   — strong lower mass (tightened from 0.82)
    //   !flatLay         — not a full-frame garment fill
    //   !shoesFires      — terminal
    //   !shirtFires      — hanger already caught
    //   !personLike      — explicit person-in-frame guard
    //   total 90–500     — narrowed upper bound (was 550)
    const pantsFires  = !flatLay && !shoesFires && !shirtFires && !personLike
      && topF < 0.15
      && topNB < 12
      && (midF + botF) > 0.85
      && total > 90 && total < 500;
    const pantsReason = pantsFires
      ? `topF=${topF.toFixed(2)} topNB=${topNB} mid+bot=${((midF+botF)*100).toFixed(0)}% total=${total}`
      : null;

    // ── Ambiguous ─────────────────────────────────────────────────────────────
    // Everything that didn't match a positive signal AND isn't a clean flat-lay.
    // Explicitly includes personLike images that didn't get caught by filename selfie kw.
    // needsReview=true in classify().
    const ambiguousFires = !shoesFires && !shirtFires && !pantsFires && !flatLay && total >= 20;
    const ambiguousReason = ambiguousFires
      ? `${personLike ? "person-like " : ""}no-shape-signal topF=${topF.toFixed(2)} midF=${midF.toFixed(2)} botF=${botF.toFixed(2)} total=${total}`
      : null;

    // ── likelyType ────────────────────────────────────────────────────────────
    let likelyType = null;
    if      (shoesFires) likelyType = "shoes";
    else if (shirtFires) likelyType = "shirt";
    else if (pantsFires) likelyType = "pants";
    // flat-lay and ambiguous → likelyType null (classify() handles them)

    console.log(
      "[zones]",
      filename,
      `top:${topF.toFixed(2)}(${topNB}) mid:${midF.toFixed(2)}(${midNB}) bot:${botF.toFixed(2)}(${botNB}) total:${total}`,
      `| bilat:${bilatBalance.toFixed(2)} flatLay:${flatLay} person:${personLike}`,
      `| →${likelyType ?? (flatLay ? "flat-lay" : ambiguousFires ? "ambiguous" : "null")}`,
      shoesFires     ? `| shoes:${shoesReason}`         : "",
      shirtFires     ? `| shirt:${shirtReason}`         : "",
      pantsFires     ? `| pants:${pantsReason}`         : "",
      personLike     ? `| personLike:${personReason}`   : "",
      flatLay        ? `| flatLay:spread=${zoneSpread.toFixed(3)}` : "",
      ambiguousFires ? `| ambiguous:${ambiguousReason}` : "",
    );

    return {
      total, topF, midF, botF, bilatBalance, flatLay,
      personLike,
      shoes:     { fires: shoesFires,     reason: shoesReason },
      shirt:     { fires: shirtFires,     reason: shirtReason },
      pants:     { fires: pantsFires,     reason: pantsReason },
      ambiguous: { fires: ambiguousFires, reason: ambiguousReason },
      likelyType,
    };
  } catch (e) {
    return { ...none, _error: e.message };
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

// ─── Pure decision helper (exported for tests) ────────────────────────────────

/**
 * Apply the full classification decision given pre-computed signals.
 * Pure function — no async, no canvas, no side effects.
 *
 * @param {object} fn          — result of classifyFromFilename()
 * @param {object} px          — result of analyzeImageContent()
 * @param {string|null} pixelColor — result of extractDominantColor()
 * @param {string|undefined} duplicateOf — result of findPossibleDuplicate()
 * @returns classification result object
 */
export function _applyDecision(fn, px, pixelColor, duplicateOf) {
  let type, typeSource, photoType, needsReview, decisionReason;

  // ── 1. Filename high-confidence ───────────────────────────────────────────
  if (fn.type != null && fn.confidence === "high") {
    type           = fn.type;
    typeSource     = "filename-high";
    photoType      = fn.isSelfieFilename ? "outfit-shot" : "garment";
    needsReview    = fn.isSelfieFilename;
    decisionReason = `filename keyword → ${fn.type}`;
  }

  // ── 2. Filename medium ────────────────────────────────────────────────────
  else if (fn.type != null && fn.confidence === "medium") {
    if (px.shoes.fires && fn.type !== "shoes") {
      type           = "shoes";
      typeSource     = "image-shoes-upgrade";
      decisionReason = `image shoes overrides medium filename; ${px.shoes.reason}`;
    } else {
      type           = fn.type;
      typeSource     = "filename-medium";
      decisionReason = `camera-roll filename keyword → ${fn.type}`;
    }
    photoType   = fn.isSelfieFilename ? "outfit-shot" : "garment";
    needsReview = fn.isSelfieFilename;
  }

  // ── 3–9. Image-driven ────────────────────────────────────────────────────
  else if (fn.isSelfieFilename) {
    type = "shirt"; typeSource = "selfie-filename";
    photoType = "outfit-shot"; needsReview = true;
    decisionReason = "selfie/mirror/ootd filename keyword";
  } else if (px.shoes.fires) {
    type = "shoes"; typeSource = "image-shoes";
    photoType = "garment"; needsReview = false;
    decisionReason = px.shoes.reason;
  } else if (px.shirt.fires) {
    type = "shirt"; typeSource = "image-shirt";
    photoType = "garment"; needsReview = false;
    decisionReason = px.shirt.reason;
  } else if (px.flatLay) {
    type = "shirt"; typeSource = "flat-lay";
    photoType = "garment"; needsReview = false;
    decisionReason = `flat-lay total=${px.total}`;
  } else if (px.pants.fires) {
    type = "pants"; typeSource = "image-pants";
    photoType = "garment"; needsReview = false;
    decisionReason = px.pants.reason;
  } else if (px.ambiguous.fires) {
    type = "shirt"; typeSource = "ambiguous";
    photoType = "ambiguous"; needsReview = true;
    decisionReason = px.ambiguous.reason;
  } else {
    const totallyBlind = !pixelColor;
    type = "shirt"; typeSource = "blind";
    photoType = "garment"; needsReview = totallyBlind;
    decisionReason = totallyBlind
      ? "no-pixels no-color no-filename"
      : `low-pixel color=${pixelColor}`;
  }

  const color = fn.color ?? pixelColor ?? "grey";

  return {
    type, color,
    formality:    fn.formality,
    photoType,
    needsReview,
    ...(duplicateOf != null ? { duplicateOf } : {}),
    _confidence:     fn.confidence,
    _typeSource:     typeSource,
    _flatLay:        px.flatLay,
    _personLike:     px.personLike ?? false,
    _ambiguous:      px.ambiguous.fires,
    _decisionReason: decisionReason,
  };
}

// ─── Master classify ──────────────────────────────────────────────────────────

export async function classify(filename, thumbnailDataURL, hash, existingGarments = []) {
  const fn = classifyFromFilename(filename);

  const [px, pixelColor] = await Promise.all([
    analyzeImageContent(thumbnailDataURL, filename),
    extractDominantColor(thumbnailDataURL),
  ]);

  const duplicateOf = findPossibleDuplicate(hash, existingGarments) ?? undefined;
  const result = _applyDecision(fn, px, pixelColor, duplicateOf);

  console.log(
    "[classifier]", filename,
    "→", result.type, result.color,
    "| photo:", result.photoType,
    "| review:", result.needsReview,
    "| src:", result._typeSource,
    "| pixColor:", pixelColor,
    "| imgType:", px.likelyType,
    "| flatLay:", px.flatLay,
    "| personLike:", px.personLike,
    "| ambiguous:", px.ambiguous.fires,
    "| reason:", result._decisionReason,
    ...(result.duplicateOf ? ["| DUPE:", result.duplicateOf] : []),
  );

  return result;
}
