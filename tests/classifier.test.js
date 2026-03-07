import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Test strategy:
 *   classifyFromFilename / findPossibleDuplicate — pure functions, test real implementations.
 *   classify — mocked to call stubbable analyzeImageContent + extractDominantColor,
 *               then runs the exact same decision logic as the real classify so
 *               per-test zone injection produces realistic results.
 */

vi.mock("../src/features/wardrobe/classifier.js", async (importOriginal) => {
  const actual = await importOriginal();

  const defaultZonesObj = () => ({
    total: 0, topF: 0, midF: 0, botF: 0, bilatBalance: 0,
    flatLay: false,
    shoes:     { fires: false, reason: null },
    shirt:     { fires: false, reason: null },
    pants:     { fires: false, reason: null },
    ambiguous: { fires: false, reason: null },
    likelyType: null,
  });

  const analyzeStub = vi.fn().mockResolvedValue(defaultZonesObj());
  const colorStub   = vi.fn().mockResolvedValue(null);

  const classifyFn = async (filename, thumb, hash, existingGarments = []) => {
    const fn  = actual.classifyFromFilename(filename);
    const dup = actual.findPossibleDuplicate(hash, existingGarments) ?? undefined;

    const [px, pixelColor] = await Promise.all([analyzeStub(thumb), colorStub(thumb)]);

    let type, typeSource, photoType, needsReview, decisionReason;

    if (fn.type != null && fn.confidence === "high") {
      type = fn.type; typeSource = "filename-high";
      photoType = fn.isSelfieFilename ? "outfit-shot" : "garment";
      needsReview = fn.isSelfieFilename;
      decisionReason = `filename-high ${fn.type}`;
    } else if (fn.type != null && fn.confidence === "medium") {
      if (px.shoes?.fires && fn.type !== "shoes") {
        type = "shoes"; typeSource = "image-shoes-upgrade";
        decisionReason = `image-shoes-upgrade`;
      } else {
        type = fn.type; typeSource = "filename-medium";
        decisionReason = `filename-medium ${fn.type}`;
      }
      photoType = fn.isSelfieFilename ? "outfit-shot" : "garment";
      needsReview = fn.isSelfieFilename;
    } else {
      if (fn.isSelfieFilename) {
        type = "shirt"; typeSource = "selfie-filename";
        photoType = "outfit-shot"; needsReview = true;
        decisionReason = "selfie-filename";
      } else if (px.shoes?.fires) {
        type = "shoes"; typeSource = "image-shoes";
        photoType = "garment"; needsReview = false;
        decisionReason = px.shoes.reason;
      } else if (px.shirt?.fires) {
        type = "shirt"; typeSource = "image-shirt";
        photoType = "garment"; needsReview = false;
        decisionReason = px.shirt.reason;
      } else if (px.flatLay) {
        type = "shirt"; typeSource = "flat-lay";
        photoType = "garment"; needsReview = false;
        decisionReason = `flat-lay total=${px.total}`;
      } else if (px.pants?.fires) {
        type = "pants"; typeSource = "image-pants";
        photoType = "garment"; needsReview = false;
        decisionReason = px.pants.reason;
      } else if (px.ambiguous?.fires) {
        type = "shirt"; typeSource = "ambiguous";
        photoType = "ambiguous"; needsReview = true;
        decisionReason = px.ambiguous.reason;
      } else {
        const totallyBlind = !pixelColor;
        type = "shirt"; typeSource = "blind";
        photoType = "garment"; needsReview = totallyBlind;
        decisionReason = totallyBlind ? "blind" : `low-pixel color=${pixelColor}`;
      }
    }

    return {
      type, color: fn.color ?? pixelColor ?? "grey",
      formality: fn.formality ?? 5,
      photoType, needsReview,
      ...(dup ? { duplicateOf: dup } : {}),
      _confidence: fn.confidence, _typeSource: typeSource,
      _flatLay: px.flatLay ?? false,
      _ambiguous: px.ambiguous?.fires ?? false,
      _decisionReason: decisionReason,
    };
  };

  return {
    ...actual,
    classify:             vi.fn().mockImplementation(classifyFn),
    analyzeImageContent:  analyzeStub,
    extractDominantColor: colorStub,
  };
});

import { classifyFromFilename, findPossibleDuplicate, classify } from
  "../src/features/wardrobe/classifier.js";

const dz = () => ({
  total: 0, topF: 0, midF: 0, botF: 0, bilatBalance: 0,
  flatLay: false,
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
  ].forEach(f => it(`${f} → shoes`, () => expect(classifyFromFilename(f).type).toBe("shoes")));
});

describe("classifyFromFilename — pants", () => {
  ["pants_grey.jpg","trousers_navy.jpg","chinos_khaki.jpg","jeans_dark.jpg",
   "joggers_black.jpg","chino_stone.jpg","trouser_grey.jpg","slim_trousers.jpg"
  ].forEach(f => it(`${f} → pants`, () => expect(classifyFromFilename(f).type).toBe("pants")));
});

describe("classifyFromFilename — jacket", () => {
  ["jacket_grey.jpg","blazer_navy.jpg","coat_camel.jpg","bomber_olive.jpg",
   "cardigan_brown.jpg","overcoat_black.jpg","overshirt_olive.jpg"
  ].forEach(f => it(`${f} → jacket`, () => expect(classifyFromFilename(f).type).toBe("jacket")));
});

describe("classifyFromFilename — shirt", () => {
  ["shirt_white.jpg","polo_navy.jpg","tee_black.jpg","knit_cream.jpg",
   "sweater_olive.jpg","hoodie_grey.jpg","flannel_plaid.jpg","crewneck_navy.jpg"
  ].forEach(f => it(`${f} → shirt`, () => expect(classifyFromFilename(f).type).toBe("shirt")));
});

// ─── Color / formality ────────────────────────────────────────────────────────

describe("classifyFromFilename — color", () => {
  [["shirt_navy.jpg","navy"],["shoes_black.jpg","black"],["jacket_olive.jpg","olive"],
   ["chinos_tan.jpg","tan"],["trousers_grey.jpg","grey"],["sweater_brown.jpg","brown"],
   ["coat_camel.jpg","tan"],["boots_cognac.jpg","brown"],["jeans_dark.jpg",null]
  ].forEach(([f,c]) => it(`${f} → ${c}`, () => expect(classifyFromFilename(f).color).toBe(c)));
});

describe("classifyFromFilename — formality", () => {
  [["derby_black.jpg",8],["sneakers_white.jpg",3],["blazer_navy.jpg",8],
   ["hoodie_grey.jpg",3],["trousers_grey.jpg",7],["jeans_dark.jpg",4],
   ["overcoat_black.jpg",9],["loafers_tan.jpg",6],["chelsea_boots.jpg",7]
  ].forEach(([f,v]) => it(`${f} formality=${v}`, () => expect(classifyFromFilename(f).formality).toBe(v)));
});

// ─── Selfie detection ─────────────────────────────────────────────────────────

describe("classifyFromFilename — selfie strict", () => {
  [["mirror_selfie.jpg",true],["ootd_look.jpg",true],["fitcheck.jpg",true],
   ["fullbody.jpg",true],["IMG_1234.jpg",false],["DSC_0042.jpg",false],
   ["shirt_navy.jpg",false]
  ].forEach(([f,exp]) =>
    it(`${f} isSelfieFilename=${exp}`, () =>
      expect(classifyFromFilename(f).isSelfieFilename).toBe(exp)));
});

// ─── mirror selfie / person photos must NOT become pants ─────────────────────

describe("classify — person photos must not become pants", () => {
  it("mirror selfie filename → outfit-shot, review, not pants", async () => {
    const r = await classify("mirror_selfie.jpg", null, "", []);
    expect(r.photoType).toBe("outfit-shot");
    expect(r.needsReview).toBe(true);
    expect(r.type).not.toBe("pants");
  });

  it("ootd.jpg → outfit-shot, review, not pants", async () => {
    const r = await classify("ootd.jpg", null, "", []);
    expect(r.photoType).toBe("outfit-shot");
    expect(r.needsReview).toBe(true);
    expect(r.type).not.toBe("pants");
  });

  it("ambiguous image signal → photoType ambiguous, review, not pants", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 420,
      topF: 0.28, midF: 0.40, botF: 0.32, bilatBalance: 0.65,
      ambiguous: { fires: true, reason: "no-shape-signal" },
    });
    const r = await classify("IMG20260208053034.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).not.toBe("pants");
    expect(r.needsReview).toBe(true);
    expect(r.photoType).toBe("ambiguous");
  });

  it("seated outfit photo (ambiguous) → not pants", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 380,
      topF: 0.25, midF: 0.42, botF: 0.33, bilatBalance: 0.70,
      ambiguous: { fires: true, reason: "no-shape-signal" },
    });
    const r = await classify("IMG20260207201139.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).not.toBe("pants");
    expect(r.needsReview).toBe(true);
  });
});

// ─── Shoes terminal ───────────────────────────────────────────────────────────

describe("classify — shoes are terminal", () => {
  it("shoe image signal → shoes, never pants", async () => {
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
  });

  it("shoes cannot be overridden by pants signal", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    // Both shoes and pants fire — shoes must win
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 200,
      topF: 0.10, midF: 0.35, botF: 0.55, bilatBalance: 0.80,
      shoes: { fires: true, reason: "bottom-heavy" },
      pants: { fires: true, reason: "should be ignored" },
      likelyType: "shoes",
    });
    const r = await classify("IMG20260209233604.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).toBe("shoes");
  });

  it("derby filename → shoes, no review", async () => {
    const r = await classify("derby_brown.jpg", null, "", []);
    expect(r.type).toBe("shoes");
    expect(r.needsReview).toBe(false);
  });

  it("loafers filename → shoes, tan, no review", async () => {
    const r = await classify("loafers_tan.jpg", null, "", []);
    expect(r.type).toBe("shoes");
    expect(r.color).toBe("tan");
    expect(r.needsReview).toBe(false);
  });
});

// ─── Flat-lay garments ────────────────────────────────────────────────────────

describe("classify — flat-lay → shirt, garment, no review", () => {
  it("even zones + high total = flat-lay → shirt, no review", async () => {
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
  });

  it("flat-lay knit: not outfit-shot", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 650,
      topF: 0.35, midF: 0.31, botF: 0.34, bilatBalance: 0.87,
      flatLay: true,
    });
    const r = await classify("IMG20260221161335.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.photoType).toBe("garment");
    expect(r.needsReview).toBe(false);
  });

  it("flat-lay must NEVER become pants", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 620,
      topF: 0.30, midF: 0.38, botF: 0.32, bilatBalance: 0.88,
      flatLay: true,
      // Even if pants would fire without flatLay guard — flatLay takes priority
      pants: { fires: false, reason: null },
    });
    const r = await classify("IMG_1234.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).not.toBe("pants");
    expect(r.type).toBe("shirt");
  });
});

// ─── Hanger shirt ─────────────────────────────────────────────────────────────

describe("classify — hanger shirt", () => {
  it("top-heavy hanger → shirt, garment, no review", async () => {
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
  });

  it("shirt filename → shirt, garment", async () => {
    const r = await classify("shirt_white_stripe.jpg", null, "", []);
    expect(r.type).toBe("shirt");
    expect(r.photoType).toBe("garment");
  });
});

// ─── True pants (strict lower-body) ──────────────────────────────────────────

describe("classify — true pants lower-body", () => {
  it("strict pants heuristic → pants, garment, no review", async () => {
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
});

// ─── Ambiguous bucket ─────────────────────────────────────────────────────────

describe("classify — ambiguous: review, not pants", () => {
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

// ─── pants topF guard — must be nearly empty top ─────────────────────────────

describe("classify — pants requires topF < 0.18 (strict)", () => {
  it("topF=0.20 (above threshold) → NOT pants, goes ambiguous", async () => {
    const m = await import("../src/features/wardrobe/classifier.js");
    // If pants.fires=false and ambiguous.fires=true, must not be pants
    m.analyzeImageContent.mockResolvedValueOnce({
      ...dz(), total: 300,
      topF: 0.20, midF: 0.42, botF: 0.38, bilatBalance: 0.75,
      flatLay: false,
      pants: { fires: false, reason: null }, // strict guard prevented it
      ambiguous: { fires: true, reason: "topF too high for pants" },
    });
    const r = await classify("IMG20260208053034.jpg", "data:image/jpeg;base64,x", "", []);
    expect(r.type).not.toBe("pants");
    expect(r.needsReview).toBe(true);
  });
});

// ─── review suppression ───────────────────────────────────────────────────────

describe("classify — review suppression", () => {
  it("clear shoe filename → no review", async () => {
    expect((await classify("derby_black.jpg", null, "", [])).needsReview).toBe(false);
  });
  it("clear pants filename → no review", async () => {
    expect((await classify("chinos_tan.jpg", null, "", [])).needsReview).toBe(false);
  });
  it("camera-roll no signals → review true (blind)", async () => {
    expect((await classify("IMG_1234.jpg", null, "", [])).needsReview).toBe(true);
  });
  it("flat-lay with detected color → no review", async () => {
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

// ─── Duplicate detection ──────────────────────────────────────────────────────

describe("findPossibleDuplicate", () => {
  const ex = [{ id:"g1", hash:"1".repeat(64) }, { id:"g2", hash:"0".repeat(64) }];
  it("exact → g1",    () => expect(findPossibleDuplicate("1".repeat(64), ex)).toBe("g1"));
  it("dist 3 → g1",   () => expect(findPossibleDuplicate("1".repeat(61)+"000", ex)).toBe("g1"));
  it("dist>6 → null", () => expect(findPossibleDuplicate("1".repeat(32)+"0".repeat(32), ex)).toBeNull());
  it("empty → null",  () => expect(findPossibleDuplicate("1".repeat(64), [])).toBeNull());
  it("null → null",   () => expect(findPossibleDuplicate(null, ex)).toBeNull());
});
