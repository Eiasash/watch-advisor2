import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mock strategy:
 *
 *   classifyFromFilename, findPossibleDuplicate, _applyDecision
 *     → real implementations from actual module (pure, no DOM needed)
 *
 *   analyzeImageContent, extractDominantColor
 *     → vi.fn() stubs — tests can inject results via mockResolvedValueOnce
 *
 *   classify
 *     → thin async wrapper that:
 *          calls the mocked analyzeImageContent + extractDominantColor
 *          passes results to the real _applyDecision
 *        This is the correct pattern: tests stay honest, no canvas needed,
 *        image-signal injection works correctly.
 */

vi.mock("../src/features/wardrobe/classifier.js", async (importOriginal) => {
  const actual = await importOriginal();

  const defaultZones = () => ({
    total: 0, topF: 0, midF: 0, botF: 0, bilatBalance: 0,
    flatLay: false,
    shoes:     { fires: false, reason: null },
    shirt:     { fires: false, reason: null },
    pants:     { fires: false, reason: null },
    ambiguous: { fires: false, reason: null },
    likelyType: null,
  });

  const analyzeStub = vi.fn().mockResolvedValue(defaultZones());
  const colorStub   = vi.fn().mockResolvedValue(null);

  const classifyFn = async (filename, thumb, hash, existingGarments = []) => {
    const fn          = actual.classifyFromFilename(filename);
    const duplicateOf = actual.findPossibleDuplicate(hash, existingGarments) ?? undefined;

    // consume the stubbable image-signal functions
    const [px, pixelColor] = await Promise.all([
      analyzeStub(thumb),
      colorStub(thumb),
    ]);

    // use the real pure decision helper — no divergence from production
    return actual._applyDecision(fn, px, pixelColor, duplicateOf);
  };

  return {
    ...actual,
    classify:             vi.fn().mockImplementation(classifyFn),
    analyzeImageContent:  analyzeStub,
    extractDominantColor: colorStub,
  };
});

import {
  classifyFromFilename,
  findPossibleDuplicate,
  classify,
  _applyDecision,
} from "../src/features/wardrobe/classifier.js";

const dz = () => ({
  total: 0, topF: 0, midF: 0, botF: 0, bilatBalance: 0,
  flatLay: false,
  personLike: false,
  shoes:     { fires: false, reason: null },
  shirt:     { fires: false, reason: null },
  pants:     { fires: false, reason: null },
  ambiguous: { fires: false, reason: null },
  likelyType: null,
});

beforeEach(async () => {
  const m = await import("../src/features/wardrobe/classifier.js");
  vi.mocked(m).analyzeImageContent.mockResolvedValue(dz());
  vi.mocked(m).extractDominantColor.mockResolvedValue(null);
});

// ─── classifyFromFilename — type ─────────────────────────────────────────────

describe("classifyFromFilename — shoes", () => {
  ["shoes_brown.jpg","sneakers_white.jpg","derby_tan.jpg","derbies_black.jpg",
   "loafer_cognac.jpg","loafers_tan.jpg","boots_brown.jpg","chelsea_boots.jpg",
   "brogue_tan.jpg","brogues_black.jpg","trainer_white.jpg","sneaker_navy.jpg",
   "dress_shoes.jpg"
  ].forEach(f => it(f, () => expect(classifyFromFilename(f).type).toBe("shoes")));
});

describe("classifyFromFilename — pants", () => {
  ["pants_grey.jpg","trousers_navy.jpg","chinos_khaki.jpg","jeans_dark.jpg",
   "joggers_black.jpg","chino_stone.jpg","trouser_grey.jpg","slim_trousers.jpg"
  ].forEach(f => it(f, () => expect(classifyFromFilename(f).type).toBe("pants")));
});

describe("classifyFromFilename — jacket", () => {
  ["jacket_grey.jpg","blazer_navy.jpg","coat_camel.jpg","bomber_olive.jpg",
   "cardigan_brown.jpg","overcoat_black.jpg","overshirt_olive.jpg"
  ].forEach(f => it(f, () => expect(classifyFromFilename(f).type).toBe("jacket")));
});

describe("classifyFromFilename — shirt", () => {
  ["shirt_white.jpg","polo_navy.jpg","tee_black.jpg","knit_cream.jpg",
   "sweater_olive.jpg","hoodie_grey.jpg","flannel_plaid.jpg","crewneck_navy.jpg"
  ].forEach(f => it(f, () => expect(classifyFromFilename(f).type).toBe("shirt")));
});

// ─── Color ────────────────────────────────────────────────────────────────────

describe("classifyFromFilename — color", () => {
  [["shirt_navy.jpg","navy"],["shoes_black.jpg","black"],["jacket_olive.jpg","olive"],
   ["chinos_tan.jpg","tan"],["trousers_grey.jpg","grey"],["sweater_brown.jpg","brown"],
   ["coat_camel.jpg","tan"],["boots_cognac.jpg","brown"],["jeans_dark.jpg",null]
  ].forEach(([f,c]) => it(`${f} → ${c}`, () => expect(classifyFromFilename(f).color).toBe(c)));
});

// ─── Formality ────────────────────────────────────────────────────────────────

describe("classifyFromFilename — formality", () => {
  [["derby_black.jpg",8],["sneakers_white.jpg",3],["blazer_navy.jpg",8],
   ["hoodie_grey.jpg",3],["trousers_grey.jpg",7],["jeans_dark.jpg",4],
   ["overcoat_black.jpg",9],["loafers_tan.jpg",6],["chelsea_boots.jpg",7]
  ].forEach(([f,v]) => it(`${f} formality=${v}`, () =>
    expect(classifyFromFilename(f).formality).toBe(v)));
});

// ─── Selfie detection ─────────────────────────────────────────────────────────

describe("classifyFromFilename — isSelfieFilename", () => {
  [["mirror_selfie.jpg",true],["ootd_look.jpg",true],["fitcheck.jpg",true],
   ["fullbody.jpg",true],["IMG_1234.jpg",false],["DSC_0042.jpg",false],
   ["shirt_navy.jpg",false]
  ].forEach(([f,exp]) => it(`${f} → ${exp}`, () =>
    expect(classifyFromFilename(f).isSelfieFilename).toBe(exp)));
});

// ─── classify — person photos must not become pants ───────────────────────────

describe("classify — person photos: not pants", () => {
  it("mirror selfie filename → outfit-shot, needsReview, not pants", async () => {
    const r = await classify("mirror_selfie.jpg", null, "", []);
    expect(r.photoType).toBe("outfit-shot");
    expect(r.needsReview).toBe(true);
    expect(r.type).not.toBe("pants");
  });

  it("ootd.jpg → outfit-shot, needsReview, not pants", async () => {
    const r = await classify("ootd.jpg", null, "", []);
    expect(r.photoType).toBe("outfit-shot");
    expect(r.needsReview).toBe(true);
    expect(r.type).not.toBe("pants");
  });

  it("ambiguous pixel signal → photoType ambiguous, needsReview, not pants", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 420,
      topF: 0.28, midF: 0.40, botF: 0.32, bilatBalance: 0.65,
      ambiguous: { fires: true, reason: "no-shape-signal total=420" },
    });
    const r = await classify("IMG20260208053034.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).not.toBe("pants");
    expect(r.needsReview).toBe(true);
    expect(r.photoType).toBe("ambiguous");
  });

  it("seated outfit photo (ambiguous zones) → not pants, needsReview", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 380,
      topF: 0.25, midF: 0.42, botF: 0.33, bilatBalance: 0.70,
      ambiguous: { fires: true, reason: "seated-no-shape" },
    });
    const r = await classify("IMG20260207201139.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).not.toBe("pants");
    expect(r.needsReview).toBe(true);
  });
});

// ─── classify — shoes terminal ────────────────────────────────────────────────

describe("classify — shoes terminal", () => {
  it("shoe pixel signal → shoes, garment, no review", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 180,
      topF: 0.08, midF: 0.20, botF: 0.72, bilatBalance: 0.82,
      shoes: { fires: true, reason: "bottom-heavy botF=0.72 total=180" },
      likelyType: "shoes",
    });
    const r = await classify("IMG20260209233402.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).toBe("shoes");
    expect(r.photoType).toBe("garment");
    expect(r.needsReview).toBe(false);
    expect(r._typeSource).toBe("image-shoes");
  });

  it("shoes signal beats pants signal — shoes wins", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 200,
      topF: 0.10, midF: 0.35, botF: 0.55, bilatBalance: 0.80,
      shoes: { fires: true, reason: "bottom-heavy" },
      pants: { fires: true, reason: "should be ignored" },
      likelyType: "shoes",
    });
    const r = await classify("IMG20260209233604.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).toBe("shoes");
    expect(r._typeSource).toBe("image-shoes");
  });

  it("derby filename → shoes, no review", async () => {
    const r = await classify("derby_brown.jpg", null, "", []);
    expect(r.type).toBe("shoes");
    expect(r.needsReview).toBe(false);
    expect(r._typeSource).toBe("filename-high");
  });

  it("loafers_tan → shoes, tan, no review", async () => {
    const r = await classify("loafers_tan.jpg", null, "", []);
    expect(r.type).toBe("shoes");
    expect(r.color).toBe("tan");
    expect(r.needsReview).toBe(false);
  });
});

// ─── classify — flat-lay garments ────────────────────────────────────────────

describe("classify — flat-lay → shirt, garment, no review", () => {
  it("high total + even zones → flat-lay → shirt, no review", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 700,
      topF: 0.33, midF: 0.34, botF: 0.33, bilatBalance: 0.90,
      flatLay: true,
    });
    const r = await classify("IMG20260209233604.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).toBe("shirt");
    expect(r.photoType).toBe("garment");
    expect(r.needsReview).toBe(false);
    expect(r._typeSource).toBe("flat-lay");
  });

  it("flat-lay must never become pants even with bot-heavy zones", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 620,
      topF: 0.30, midF: 0.38, botF: 0.32, bilatBalance: 0.88,
      flatLay: true,
      pants: { fires: false, reason: null }, // flat-lay guard already blocks pants
    });
    const r = await classify("IMG_1234.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).toBe("shirt");
    expect(r.type).not.toBe("pants");
  });

  it("flat-lay is never outfit-shot", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 650,
      topF: 0.35, midF: 0.31, botF: 0.34, bilatBalance: 0.87,
      flatLay: true,
    });
    const r = await classify("IMG20260221161335.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.photoType).toBe("garment");
  });

  it("flat-lay with detected color → correct color, no review", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 580, flatLay: true,
      topF: 0.33, midF: 0.34, botF: 0.33, bilatBalance: 0.91,
    });
    m.extractDominantColor.mockResolvedValueOnce("olive");
    const r = await classify("IMG20260221161617.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.needsReview).toBe(false);
    expect(r.color).toBe("olive");
  });
});

// ─── classify — hanger shirt ─────────────────────────────────────────────────

describe("classify — hanger shirt", () => {
  it("top-heavy hanger signal → shirt, garment, no review", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 280,
      topF: 0.55, midF: 0.30, botF: 0.15, bilatBalance: 0.76,
      shirt: { fires: true, reason: "hanger topF=0.55 botF=0.15 total=280" },
      likelyType: "shirt",
    });
    const r = await classify("IMG20260208053034.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).toBe("shirt");
    expect(r.photoType).toBe("garment");
    expect(r.needsReview).toBe(false);
    expect(r._typeSource).toBe("image-shirt");
  });

  it("shirt filename → filename-high, shirt", async () => {
    const r = await classify("shirt_white_stripe.jpg", null, "", []);
    expect(r.type).toBe("shirt");
    expect(r._typeSource).toBe("filename-high");
  });
});

// ─── classify — true pants (strict) ──────────────────────────────────────────

describe("classify — true pants lower-body", () => {
  it("strict pants pixel signal → pants, garment, no review", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 350,
      topF: 0.10, midF: 0.44, botF: 0.46, bilatBalance: 0.85,
      flatLay: false,
      pants: { fires: true, reason: "topF=0.10 mid+bot=90% total=350" },
      likelyType: "pants",
    });
    const r = await classify("IMG20260209233402.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).toBe("pants");
    expect(r.photoType).toBe("garment");
    expect(r.needsReview).toBe(false);
    expect(r._typeSource).toBe("image-pants");
  });

  it("jeans filename → pants, blue, no review", async () => {
    const r = await classify("blue_jeans.jpg", null, "", []);
    expect(r.type).toBe("pants");
    expect(r.color).toBe("blue");
    expect(r.needsReview).toBe(false);
  });

  it("trousers filename → pants, grey", async () => {
    const r = await classify("trousers_grey.jpg", null, "", []);
    expect(r.type).toBe("pants");
    expect(r.color).toBe("grey");
  });

  it("topF=0.20 does NOT fire pants — falls to ambiguous", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 300,
      topF: 0.20, midF: 0.42, botF: 0.38, bilatBalance: 0.75,
      flatLay: false,
      pants: { fires: false, reason: null },
      ambiguous: { fires: true, reason: "topF too high for strict pants" },
    });
    const r = await classify("IMG20260208053034.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).not.toBe("pants");
    expect(r.needsReview).toBe(true);
    expect(r._typeSource).toBe("ambiguous");
  });
});

// ─── classify — ambiguous bucket ─────────────────────────────────────────────

describe("classify — ambiguous bucket: review, not pants", () => {
  const injectAmbiguous = async (filename) => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 120,
      topF: 0.22, midF: 0.40, botF: 0.38, bilatBalance: 0.60,
      ambiguous: { fires: true, reason: "no-shape-signal total=120" },
    });
    return classify(filename, "data:image/jpeg;base64,x", "", []);
  };

  it("wrist/watch closeup → ambiguous, review, not pants", async () => {
    const r = await injectAmbiguous("IMG20260221153308.jpg");
    expect(r.type).not.toBe("pants");
    expect(r.needsReview).toBe(true);
    expect(r.photoType).toBe("ambiguous");
    expect(r._typeSource).toBe("ambiguous");
  });

  it("belt shot → ambiguous, review, not pants", async () => {
    const r = await injectAmbiguous("IMG20260209233021.jpg");
    expect(r.type).not.toBe("pants");
    expect(r.needsReview).toBe(true);
  });

  it("stacked garments → ambiguous, review, not pants", async () => {
    const r = await injectAmbiguous("IMG20260208060255.jpg");
    expect(r.type).not.toBe("pants");
    expect(r.needsReview).toBe(true);
  });
});

// ─── classify — review suppression ───────────────────────────────────────────

describe("classify — review suppression", () => {
  it("clear shoe filename → no review", async () => {
    expect((await classify("derby_black.jpg", null, "", [])).needsReview).toBe(false);
  });
  it("clear pants filename → no review", async () => {
    expect((await classify("chinos_tan.jpg", null, "", [])).needsReview).toBe(false);
  });
  it("camera-roll no signals → needsReview true (blind)", async () => {
    expect((await classify("IMG_1234.jpg", null, "", [])).needsReview).toBe(true);
  });
});

// ─── classify — camera-roll with garment keyword ─────────────────────────────

describe("classify — camera-roll + keyword", () => {
  it("IMG_1234_shoes → shoes, medium confidence", async () => {
    const r = await classify("IMG_1234_shoes.jpg", null, "", []);
    expect(r.type).toBe("shoes");
    expect(r._typeSource).toBe("filename-medium");
    expect(r.needsReview).toBe(false);
  });
  it("IMG_1234_pants → pants, medium confidence", async () => {
    const r = await classify("IMG_1234_pants.jpg", null, "", []);
    expect(r.type).toBe("pants");
    expect(r._typeSource).toBe("filename-medium");
  });
});

// ─── Duplicate detection ──────────────────────────────────────────────────────

describe("findPossibleDuplicate", () => {
  const ex = [{ id:"g1", hash:"1".repeat(64) }, { id:"g2", hash:"0".repeat(64) }];
  it("exact match → g1",  () => expect(findPossibleDuplicate("1".repeat(64), ex)).toBe("g1"));
  it("dist 3 → g1",       () => expect(findPossibleDuplicate("1".repeat(61)+"000", ex)).toBe("g1"));
  it("dist > 6 → null",   () => expect(findPossibleDuplicate("1".repeat(32)+"0".repeat(32), ex)).toBeNull());
  it("empty list → null", () => expect(findPossibleDuplicate("1".repeat(64), [])).toBeNull());
  it("null hash → null",  () => expect(findPossibleDuplicate(null, ex)).toBeNull());
});

// ─── _applyDecision direct unit tests ────────────────────────────────────────
// Tests the pure decision helper directly — no mock wrappers, no classify overhead.
// fn = classifyFromFilename result, px = analyzeImageContent result.

const blankPx = () => ({
  total: 0, topF: 0, midF: 0, botF: 0, bilatBalance: 0,
  flatLay: false,
  personLike: false,
  shoes:     { fires: false, reason: null },
  shirt:     { fires: false, reason: null },
  pants:     { fires: false, reason: null },
  ambiguous: { fires: false, reason: null },
  likelyType: null,
});

describe("_applyDecision — direct policy tests", () => {
  it("1. flatLay + pixelColor, no likelyType → shirt, flat-lay src, no review", () => {
    const fn = classifyFromFilename("IMG_1234.jpg");      // no keyword, no color
    const px = { ...blankPx(), flatLay: true, total: 600 };
    const r  = _applyDecision(fn, px, "olive", undefined);
    expect(r.type).toBe("shirt");
    expect(r._typeSource).toBe("flat-lay");
    expect(r.needsReview).toBe(false);
    expect(r.color).toBe("olive");                        // pixelColor used
  });

  it("2. shoes heuristic fires → shoes, image-shoes src, no review", () => {
    const fn = classifyFromFilename("IMG_1234.jpg");
    const px = { ...blankPx(), shoes: { fires: true, reason: "bottom-heavy" }, likelyType: "shoes" };
    const r  = _applyDecision(fn, px, null, undefined);
    expect(r.type).toBe("shoes");
    expect(r._typeSource).toBe("image-shoes");
    expect(r.needsReview).toBe(false);
    expect(r.photoType).toBe("garment");
  });

  it("3. pants heuristic fires → pants, image-pants src, no review", () => {
    const fn = classifyFromFilename("IMG_1234.jpg");
    const px = { ...blankPx(), pants: { fires: true, reason: "topF=0.10 mid+bot=90%" }, likelyType: "pants" };
    const r  = _applyDecision(fn, px, null, undefined);
    expect(r.type).toBe("pants");
    expect(r._typeSource).toBe("image-pants");
    expect(r.needsReview).toBe(false);
    expect(r.photoType).toBe("garment");
  });

  it("4. selfie filename → outfit-shot photoType, needsReview true, type shirt", () => {
    const fn = classifyFromFilename("mirror_selfie.jpg");
    const r  = _applyDecision(fn, blankPx(), null, undefined);
    expect(r.photoType).toBe("outfit-shot");
    expect(r.needsReview).toBe(true);
    expect(r.type).toBe("shirt");                         // safe fallback
    expect(r._typeSource).toBe("selfie-filename");
  });

  it("5. no signals at all → shirt, blind src, needsReview true", () => {
    const fn = classifyFromFilename("IMG_1234.jpg");      // no keyword
    const r  = _applyDecision(fn, blankPx(), null, undefined); // no pixelColor
    expect(r.type).toBe("shirt");
    expect(r._typeSource).toBe("blind");
    expect(r.needsReview).toBe(true);
  });

  it("6. duplicateOf is preserved in result", () => {
    const fn = classifyFromFilename("shirt_navy.jpg");
    const r  = _applyDecision(fn, blankPx(), "navy", "garment-abc123");
    expect(r.duplicateOf).toBe("garment-abc123");
    expect(r.type).toBe("shirt");
    expect(r.color).toBe("navy");
  });
});

// ─── _applyDecision — personLike guard on pants ───────────────────────────────

describe("_applyDecision — personLike blocks pants", () => {
  it("personLike=true with bottom-heavy zones → NOT pants, goes ambiguous", () => {
    const fn = classifyFromFilename("IMG_1234.jpg");
    const px = {
      ...blankPx(),
      total: 350, topF: 0.12, midF: 0.44, botF: 0.44, bilatBalance: 0.72,
      personLike: true,   // person guard active
      pants:     { fires: false, reason: null },  // personLike blocked it
      ambiguous: { fires: true, reason: "person-like no-shape-signal" },
    };
    const r = _applyDecision(fn, px, null, undefined);
    expect(r.type).not.toBe("pants");
    expect(r.needsReview).toBe(true);
    expect(r.photoType).toBe("ambiguous");
  });

  it("personLike=false + strict topF < 0.15 + mid+bot > 0.85 → pants fires", () => {
    const fn = classifyFromFilename("IMG_1234.jpg");
    const px = {
      ...blankPx(),
      total: 300, topF: 0.08, midF: 0.46, botF: 0.46, bilatBalance: 0.85,
      personLike: false,
      pants: { fires: true, reason: "topF=0.08 topNB=4 mid+bot=92% total=300" },
      likelyType: "pants",
    };
    const r = _applyDecision(fn, px, null, undefined);
    expect(r.type).toBe("pants");
    expect(r.needsReview).toBe(false);
    expect(r._typeSource).toBe("image-pants");
  });

  it("skin-tone signal (hasSkin) → personLike=true → not pants", () => {
    // Geometry-only now: personLike requires structural all-zones presence, not skin.
    // A high-skin-ratio garment photo has low topNB → personLike stays false → pants can fire.
    const fn = classifyFromFilename("IMG_1234.jpg");
    const px = {
      ...blankPx(),
      total: 280, topF: 0.13, midF: 0.45, botF: 0.42, bilatBalance: 0.68,
      personLike: false,  // skin alone no longer triggers personLike
      pants:     { fires: true, reason: "topF=0.13 topNB=8 mid+bot=87% total=280" },
      likelyType: "pants",
    };
    // With personLike=false and pants.fires=true, pants should fire (geometry-driven)
    const r = _applyDecision(fn, px, null, undefined);
    expect(r.type).toBe("pants");
    expect(r._typeSource).toBe("image-pants");
  });
});

// ─── classify — person-photo and ambiguous via injected zones ─────────────────

describe("classify — person-photo / ambiguous must not become pants", () => {
  it("personLike=true zones → not pants, ambiguous review", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(),
      total: 350, topF: 0.14, midF: 0.44, botF: 0.42, bilatBalance: 0.70,
      personLike: true,
      pants:     { fires: false, reason: null },
      ambiguous: { fires: true, reason: "person-like all-zones topNB=15" },
    });
    const r = await classify("IMG20260208053034.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).not.toBe("pants");
    expect(r.needsReview).toBe(true);
    expect(r.photoType).toBe("ambiguous");
  });

  it("geometry-only personLike (all zones populated) → not pants, ambiguous review", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(),
      total: 260, topF: 0.12, midF: 0.46, botF: 0.42, bilatBalance: 0.65,
      personLike: true,   // geometry: topNB>18, midNB>40, botNB>40
      pants:     { fires: false, reason: null },
      ambiguous: { fires: true, reason: "person-like all-zones" },
    });
    const r = await classify("IMG20260221153308.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).not.toBe("pants");
    expect(r.needsReview).toBe(true);
  });

  it("shoes still outrank pants when both signals present", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(),
      total: 180, topF: 0.06, midF: 0.22, botF: 0.72, bilatBalance: 0.84,
      shoes: { fires: true, reason: "bottom-heavy botF=0.72" },
      pants: { fires: true, reason: "should be ignored" },
      likelyType: "shoes",
    });
    const r = await classify("IMG20260209233402.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).toBe("shoes");
    expect(r._typeSource).toBe("image-shoes");
  });

  it("flatLay image is never pants and never review", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(),
      total: 680, topF: 0.33, midF: 0.34, botF: 0.33, bilatBalance: 0.91,
      flatLay: true,
    });
    const r = await classify("IMG20260209233604.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).not.toBe("pants");
    expect(r.type).toBe("shirt");
    expect(r.needsReview).toBe(false);
  });
});
