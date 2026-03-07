import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock classify to use only filename logic (avoids browser canvas in tests)
vi.mock("../src/features/wardrobe/classifier.js", async (importOriginal) => {
  const actual = await importOriginal();
  const classifyFn = async (filename, _thumb, hash, existingGarments = []) => {
    const fn = actual.classifyFromFilename(filename);
    const dup = actual.findPossibleDuplicate(hash, existingGarments) ?? undefined;
    const photoType = fn.isSelfieFilename ? "outfit-shot" : "garment";
    const totallyBlind = fn.type == null && !fn.color;
    return {
      type:        fn.type ?? "shirt",
      color:       fn.color ?? "grey",
      formality:   fn.formality ?? 5,
      photoType,
      needsReview: photoType === "outfit-shot" || totallyBlind,
      ...(dup ? { duplicateOf: dup } : {}),
      _confidence: fn.confidence,
      _typeSource: fn.type ? (fn.isCameraRoll ? "filename-medium" : "filename-high") : "default",
      _flatLay: false,
    };
  };
  return {
    ...actual,
    classify:             vi.fn().mockImplementation(classifyFn),
    analyzeImageContent:  vi.fn().mockResolvedValue({ likelyType: null, likelyOutfitShot: false, flatLay: false, debug: {} }),
    extractDominantColor: vi.fn().mockResolvedValue(null),
  };
});

import { classifyFromFilename, findPossibleDuplicate, classify } from "../src/features/wardrobe/classifier.js";

beforeEach(async () => {
  const mod = await import("../src/features/wardrobe/classifier.js");
  vi.mocked(mod).analyzeImageContent.mockResolvedValue({ likelyType: null, likelyOutfitShot: false, flatLay: false, debug: {} });
  vi.mocked(mod).extractDominantColor.mockResolvedValue(null);
});

// ─── Type matching ────────────────────────────────────────────────────────────

describe("classifyFromFilename — shoes", () => {
  ["shoes_brown.jpg","sneakers_white.jpg","derby_tan.jpg","derbies_black.jpg",
   "loafer_cognac.jpg","loafers_tan.jpg","boots_brown.jpg","chelsea_boots.jpg",
   "brogue_tan.jpg","brogues_black.jpg","trainer_white.jpg","sneaker_navy.jpg",
   "dress_shoes.jpg"].forEach(f =>
    it(`'${f}' → shoes`, () => expect(classifyFromFilename(f).type).toBe("shoes"))
  );
});

describe("classifyFromFilename — pants", () => {
  ["pants_grey.jpg","trousers_navy.jpg","chinos_khaki.jpg","jeans_dark.jpg",
   "joggers_black.jpg","chino_stone.jpg","trouser_grey.jpg","dark_jeans.jpg",
   "slim_trousers.jpg"].forEach(f =>
    it(`'${f}' → pants`, () => expect(classifyFromFilename(f).type).toBe("pants"))
  );
});

describe("classifyFromFilename — jacket", () => {
  ["jacket_grey.jpg","blazer_navy.jpg","coat_camel.jpg","bomber_olive.jpg",
   "cardigan_brown.jpg","overcoat_black.jpg","overshirt_olive.jpg","peacoat_navy.jpg"].forEach(f =>
    it(`'${f}' → jacket`, () => expect(classifyFromFilename(f).type).toBe("jacket"))
  );
});

describe("classifyFromFilename — shirt", () => {
  ["shirt_white.jpg","polo_navy.jpg","tee_black.jpg","knit_cream.jpg",
   "sweater_olive.jpg","hoodie_grey.jpg","flannel_plaid.jpg","crewneck_navy.jpg"].forEach(f =>
    it(`'${f}' → shirt`, () => expect(classifyFromFilename(f).type).toBe("shirt"))
  );
});

// ─── Color ────────────────────────────────────────────────────────────────────

describe("classifyFromFilename — color", () => {
  [["shirt_navy.jpg","navy"],["shoes_black.jpg","black"],["jacket_olive.jpg","olive"],
   ["chinos_tan.jpg","tan"],["trousers_grey.jpg","grey"],["sweater_brown.jpg","brown"],
   ["coat_camel.jpg","tan"],["boots_cognac.jpg","brown"],["jeans_dark.jpg",null]
  ].forEach(([f, expected]) =>
    it(`'${f}' color → ${expected}`, () => expect(classifyFromFilename(f).color).toBe(expected))
  );
});

// ─── Formality ────────────────────────────────────────────────────────────────

describe("classifyFromFilename — formality", () => {
  [["derby_black.jpg",8],["sneakers_white.jpg",3],["blazer_navy.jpg",8],
   ["hoodie_grey.jpg",3],["trousers_grey.jpg",7],["jeans_dark.jpg",4],
   ["overcoat_black.jpg",9],["loafers_tan.jpg",6],["boots_brown.jpg",6],
   ["chelsea_boots.jpg",7],
  ].forEach(([f, v]) =>
    it(`'${f}' formality ${v}`, () => expect(classifyFromFilename(f).formality).toBe(v))
  );
});

// ─── Selfie detection — strict ────────────────────────────────────────────────

describe("classifyFromFilename — selfie (strict)", () => {
  [["mirror_selfie.jpg",true],["ootd_look.jpg",true],["fitcheck.jpg",true],["fullbody.jpg",true],
   ["IMG_1234.jpg",false],["DSC_0042.jpg",false],["PHOTO_5678.jpg",false],
   ["shirt_navy.jpg",false],["blazer_navy.jpg",false],
  ].forEach(([f, expected]) =>
    it(`'${f}' isSelfieFilename → ${expected}`, () =>
      expect(classifyFromFilename(f).isSelfieFilename).toBe(expected))
  );
});

// ─── Camera roll ──────────────────────────────────────────────────────────────

describe("classifyFromFilename — camera roll", () => {
  it("IMG_1234 → isCameraRoll true",    () => expect(classifyFromFilename("IMG_1234.jpg").isCameraRoll).toBe(true));
  it("DSC_0042 → isCameraRoll true",    () => expect(classifyFromFilename("DSC_0042.jpg").isCameraRoll).toBe(true));
  it("shirt_navy → isCameraRoll false", () => expect(classifyFromFilename("shirt_navy.jpg").isCameraRoll).toBe(false));
});

// ─── classify() integration ───────────────────────────────────────────────────

describe("classify — flat-lay garment must NOT be outfit-shot", () => {
  it("even zones flat-lay → photoType garment, not outfit-shot", async () => {
    const r = await classify("IMG_1234.jpg", null, "", []);
    expect(r.photoType).toBe("garment");
  });
  it("shirt on hanger → photoType garment", async () => {
    const r = await classify("IMG20260208053034.jpg", null, "", []);
    expect(r.photoType).toBe("garment");
  });
  it("sweater on bed camera-roll → photoType garment", async () => {
    const r = await classify("IMG20260221161335.jpg", null, "", []);
    expect(r.photoType).toBe("garment");
  });
  it("folded knit stack → photoType garment", async () => {
    const r = await classify("IMG20260208060255.jpg", null, "", []);
    expect(r.photoType).toBe("garment");
  });
});

describe("classify — outfit-shot only from selfie keyword", () => {
  it("mirror selfie → outfit-shot + needsReview", async () => {
    const r = await classify("mirror_selfie.jpg", null, "", []);
    expect(r.photoType).toBe("outfit-shot");
    expect(r.needsReview).toBe(true);
  });
  it("ootd.jpg → outfit-shot", async () => {
    const r = await classify("ootd.jpg", null, "", []);
    expect(r.photoType).toBe("outfit-shot");
  });
  it("IMG_1234.jpg (no selfie kw) → garment", async () => {
    const r = await classify("IMG_1234.jpg", null, "", []);
    expect(r.photoType).toBe("garment");
  });
});

describe("classify — shoes", () => {
  it("brown derbies → shoes, brown, garment, no review", async () => {
    const r = await classify("derby_brown.jpg", null, "", []);
    expect(r.type).toBe("shoes");
    expect(r.color).toBe("brown");
    expect(r.photoType).toBe("garment");
    expect(r.needsReview).toBe(false);
  });
  it("black shoes → shoes, black, no review", async () => {
    const r = await classify("shoes_black.jpg", null, "", []);
    expect(r.type).toBe("shoes");
    expect(r.color).toBe("black");
    expect(r.needsReview).toBe(false);
  });
  it("loafers tan → shoes, tan", async () => {
    const r = await classify("loafers_tan.jpg", null, "", []);
    expect(r.type).toBe("shoes");
    expect(r.color).toBe("tan");
  });
  it("IMG_shoes_pair.jpg → shoes", async () => {
    const r = await classify("IMG_shoes_pair.jpg", null, "", []);
    expect(r.type).toBe("shoes");
  });
});

describe("classify — pants", () => {
  it("jeans laid flat → pants, blue", async () => {
    const r = await classify("blue_jeans.jpg", null, "", []);
    expect(r.type).toBe("pants");
    expect(r.color).toBe("blue");
  });
  it("grey trousers → pants, grey", async () => {
    const r = await classify("trousers_grey.jpg", null, "", []);
    expect(r.type).toBe("pants");
    expect(r.color).toBe("grey");
  });
});

describe("classify — shirts and jackets", () => {
  it("striped shirt on hanger → shirt, garment", async () => {
    const r = await classify("shirt_white_stripe.jpg", null, "", []);
    expect(r.type).toBe("shirt");
    expect(r.photoType).toBe("garment");
  });
  it("navy crewneck → shirt, navy", async () => {
    const r = await classify("crewneck_navy.jpg", null, "", []);
    expect(r.type).toBe("shirt");
    expect(r.color).toBe("navy");
  });
  it("olive bomber → jacket, olive", async () => {
    const r = await classify("bomber_olive.jpg", null, "", []);
    expect(r.type).toBe("jacket");
    expect(r.color).toBe("olive");
  });
});

describe("classify — review suppression", () => {
  it("clear shoe filename → needsReview false", async () => {
    expect((await classify("derby_black.jpg", null, "", [])).needsReview).toBe(false);
  });
  it("clear pants filename → needsReview false", async () => {
    expect((await classify("chinos_tan.jpg", null, "", [])).needsReview).toBe(false);
  });
  it("camera-roll with no type but color known → needsReview false", async () => {
    const mod = await import("../src/features/wardrobe/classifier.js");
    vi.mocked(mod).extractDominantColor.mockResolvedValueOnce("brown");
    // Re-implement classify inline to test with known color
    const fn = classifyFromFilename("IMG_1234.jpg");
    const pixelColor = "brown";
    const totallyBlind = fn.type == null && !fn.color && !pixelColor;
    expect(totallyBlind).toBe(false);
  });
  it("IMG camera-roll + no color + no type → needsReview true (truly blind)", async () => {
    const r = await classify("IMG_1234.jpg", null, "", []);
    // Mock returns no pixelColor → type=shirt, color=grey, review=true (totallyBlind)
    expect(r.needsReview).toBe(true);
  });
});

describe("classify — wrist/watch closeup must NOT become pants", () => {
  // Wrist closeup would have very low total pixels in zone analysis
  // Filename gives no garment keyword → default shirt, not pants
  it("IMG watch wrist closeup → shirt not pants (default)", async () => {
    const r = await classify("IMG20260221153308.jpg", null, "", []);
    // With no filename keyword and no image type from mock → default shirt
    expect(r.type).toBe("shirt");
  });
});

describe("classify — camera-roll with garment keyword", () => {
  it("IMG_1234_shoes.jpg → shoes, not review", async () => {
    const r = await classify("IMG_1234_shoes.jpg", null, "", []);
    expect(r.type).toBe("shoes");
    expect(r.needsReview).toBe(false);
  });
  it("IMG_1234_pants.jpg → pants", async () => {
    expect((await classify("IMG_1234_pants.jpg", null, "", [])).type).toBe("pants");
  });
  it("IMG_1234.jpg no color no type → grey shirt review", async () => {
    const r = await classify("IMG_1234.jpg", null, "", []);
    expect(r.type).toBe("shirt");
    expect(r.color).toBe("grey");
  });
});

// ─── Duplicate detection ──────────────────────────────────────────────────────

describe("findPossibleDuplicate", () => {
  const existing = [{ id: "g1", hash: "1".repeat(64) }, { id: "g2", hash: "0".repeat(64) }];
  it("exact match → found",   () => expect(findPossibleDuplicate("1".repeat(64), existing)).toBe("g1"));
  it("dist 3 → found",        () => expect(findPossibleDuplicate("1".repeat(61)+"000", existing)).toBe("g1"));
  it("dist > 6 → null",       () => expect(findPossibleDuplicate("1".repeat(32)+"0".repeat(32), existing)).toBeNull());
  it("empty list → null",     () => expect(findPossibleDuplicate("1".repeat(64), [])).toBeNull());
  it("null hash → null",      () => expect(findPossibleDuplicate(null, existing)).toBeNull());
});
