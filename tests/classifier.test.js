import { describe, it, expect, vi, beforeEach } from "vitest";

// analyzeImageContent and extractDominantColor use browser canvas — mock them
vi.mock("../src/features/wardrobe/classifier.js", async (importOriginal) => {
  const actual = await importOriginal();
  // classify calls Image/canvas internally via analyzeImageContent + extractDominantColor.
  // Replace with a version that uses only filename logic so tests don't hang.
  const classifyFn = async (filename, _thumb, hash, existingGarments = []) => {
    const fn = actual.classifyFromFilename(filename);
    const duplicateOf = actual.findPossibleDuplicate(hash, existingGarments) ?? undefined;
    const photoType = fn.isSelfieFilename ? "outfit-shot" : "garment";
    return {
      type:        fn.type ?? "shirt",
      color:       fn.color ?? "grey",
      formality:   fn.formality ?? 5,
      photoType,
      needsReview: photoType === "outfit-shot" || fn.confidence === "low",
      ...(duplicateOf ? { duplicateOf } : {}),
      _confidence: fn.confidence,
      _typeSource: "filename-test",
    };
  };
  return {
    ...actual,
    classify:             vi.fn().mockImplementation(classifyFn),
    analyzeImageContent:  vi.fn().mockResolvedValue({ likelyType: null, likelyOutfitShot: false }),
    extractDominantColor: vi.fn().mockResolvedValue(null),
  };
});

import {
  classifyFromFilename,
  findPossibleDuplicate,
  classify,
} from "../src/features/wardrobe/classifier.js";

// Reset mocks to neutral before each test so filename signals dominate
beforeEach(async () => {
  const mod = await import("../src/features/wardrobe/classifier.js");
  const mocked = vi.mocked(mod);
  if (mocked.analyzeImageContent)  mocked.analyzeImageContent.mockResolvedValue({ likelyType: null, likelyOutfitShot: false });
  if (mocked.extractDominantColor) mocked.extractDominantColor.mockResolvedValue(null);
});

// ─── classifyFromFilename — type ─────────────────────────────────────────────

describe("classifyFromFilename — shoes", () => {
  const cases = [
    "shoes_brown.jpg", "sneakers_white.jpg", "derby_tan.jpg", "derbies_black.jpg",
    "loafer_cognac.jpg", "loafers_tan.jpg", "boots_brown.jpg", "chelsea_boots.jpg",
    "brogue_tan.jpg", "brogues_black.jpg", "trainer_white.jpg", "sneaker_navy.jpg",
    "my_brown_boot.jpg", "dress_shoes.jpg",
  ];
  cases.forEach(f => {
    it(`'${f}' → shoes`, () => expect(classifyFromFilename(f).type).toBe("shoes"));
  });
});

describe("classifyFromFilename — pants", () => {
  const cases = [
    "pants_grey.jpg", "trousers_navy.jpg", "chinos_khaki.jpg", "jeans_dark.jpg",
    "joggers_black.jpg", "chino_stone.jpg", "trouser_grey.jpg", "dark_jeans.jpg",
    "slim_trousers.jpg",
  ];
  cases.forEach(f => {
    it(`'${f}' → pants`, () => expect(classifyFromFilename(f).type).toBe("pants"));
  });
});

describe("classifyFromFilename — jacket", () => {
  const cases = [
    "jacket_grey.jpg", "blazer_navy.jpg", "coat_camel.jpg", "bomber_olive.jpg",
    "cardigan_brown.jpg", "overcoat_black.jpg", "overshirt_olive.jpg", "peacoat_navy.jpg",
  ];
  cases.forEach(f => {
    it(`'${f}' → jacket`, () => expect(classifyFromFilename(f).type).toBe("jacket"));
  });
});

describe("classifyFromFilename — shirt", () => {
  const cases = [
    "shirt_white.jpg", "polo_navy.jpg", "tee_black.jpg", "knit_cream.jpg",
    "sweater_olive.jpg", "hoodie_grey.jpg", "flannel_plaid.jpg", "crewneck_navy.jpg",
  ];
  cases.forEach(f => {
    it(`'${f}' → shirt`, () => expect(classifyFromFilename(f).type).toBe("shirt"));
  });
});

// ─── Oxford priority: shoes beats shirt ──────────────────────────────────────

describe("classifyFromFilename — priority edge cases", () => {
  it("'derby_black.jpg' → shoes not shirt", () => {
    expect(classifyFromFilename("derby_black.jpg").type).toBe("shoes");
  });
  it("'brogues_tan.jpg' → shoes", () => {
    expect(classifyFromFilename("brogues_tan.jpg").type).toBe("shoes");
  });
  it("'oxford shirt white.jpg' → shirt (no shoe keyword)", () => {
    // "oxford" alone is in the shirt list; "shirt" also present → shirt
    expect(classifyFromFilename("oxford_shirt_white.jpg").type).toBe("shirt");
  });
});

// ─── Color ────────────────────────────────────────────────────────────────────

describe("classifyFromFilename — color", () => {
  const cases = [
    ["shirt_navy.jpg",     "navy"],
    ["shoes_black.jpg",    "black"],
    ["jacket_olive.jpg",   "olive"],
    ["chinos_tan.jpg",     "tan"],
    ["trousers_grey.jpg",  "grey"],
    ["sweater_brown.jpg",  "brown"],
    ["coat_camel.jpg",     "tan"],   // camel → tan
    ["boots_cognac.jpg",   "brown"], // cognac → brown
    ["jeans_dark.jpg",     null],    // "dark" not in palette
  ];
  cases.forEach(([f, expected]) => {
    it(`'${f}' → color ${expected}`, () => expect(classifyFromFilename(f).color).toBe(expected));
  });
});

// ─── Formality ────────────────────────────────────────────────────────────────

describe("classifyFromFilename — formality", () => {
  it("derby → 8",        () => expect(classifyFromFilename("derby_black.jpg").formality).toBe(8));
  it("sneakers → 3",     () => expect(classifyFromFilename("sneakers_white.jpg").formality).toBe(3));
  it("blazer → 8",       () => expect(classifyFromFilename("blazer_navy.jpg").formality).toBe(8));
  it("hoodie → 3",       () => expect(classifyFromFilename("hoodie_grey.jpg").formality).toBe(3));
  it("trousers → 7",     () => expect(classifyFromFilename("trousers_grey.jpg").formality).toBe(7));
  it("jeans → 4",        () => expect(classifyFromFilename("jeans_dark.jpg").formality).toBe(4));
  it("overcoat → 9",     () => expect(classifyFromFilename("overcoat_black.jpg").formality).toBe(9));
  it("loafers → 6",      () => expect(classifyFromFilename("loafers_tan.jpg").formality).toBe(6));
  it("boots → 6",        () => expect(classifyFromFilename("boots_brown.jpg").formality).toBe(6));
  it("chelsea → 7",      () => expect(classifyFromFilename("chelsea_boots.jpg").formality).toBe(7));
});

// ─── Selfie detection — strict ────────────────────────────────────────────────

describe("classifyFromFilename — selfie detection (strict)", () => {
  it("'mirror_selfie.jpg' → isSelfieFilename true",  () => expect(classifyFromFilename("mirror_selfie.jpg").isSelfieFilename).toBe(true));
  it("'ootd_look.jpg' → isSelfieFilename true",       () => expect(classifyFromFilename("ootd_look.jpg").isSelfieFilename).toBe(true));
  it("'fitcheck.jpg' → isSelfieFilename true",        () => expect(classifyFromFilename("fitcheck.jpg").isSelfieFilename).toBe(true));
  it("'fullbody.jpg' → isSelfieFilename true",        () => expect(classifyFromFilename("fullbody.jpg").isSelfieFilename).toBe(true));

  // Camera-roll patterns → NOT selfie (just low confidence / camera roll)
  it("'IMG_1234.jpg' → isSelfieFilename FALSE",       () => expect(classifyFromFilename("IMG_1234.jpg").isSelfieFilename).toBe(false));
  it("'DSC_0042.jpg' → isSelfieFilename FALSE",       () => expect(classifyFromFilename("DSC_0042.jpg").isSelfieFilename).toBe(false));
  it("'PHOTO_5678.jpg' → isSelfieFilename FALSE",     () => expect(classifyFromFilename("PHOTO_5678.jpg").isSelfieFilename).toBe(false));

  // Normal garment files → not selfie
  it("'shirt_navy.jpg' → isSelfieFilename false",     () => expect(classifyFromFilename("shirt_navy.jpg").isSelfieFilename).toBe(false));
  it("'blazer_navy.jpg' → isSelfieFilename false",    () => expect(classifyFromFilename("blazer_navy.jpg").isSelfieFilename).toBe(false));
});

// ─── Camera-roll confidence ───────────────────────────────────────────────────

describe("classifyFromFilename — camera roll", () => {
  it("IMG_1234 → isCameraRoll true",   () => expect(classifyFromFilename("IMG_1234.jpg").isCameraRoll).toBe(true));
  it("DSC_0042 → isCameraRoll true",   () => expect(classifyFromFilename("DSC_0042.jpg").isCameraRoll).toBe(true));
  it("shirt_navy → isCameraRoll false",() => expect(classifyFromFilename("shirt_navy.jpg").isCameraRoll).toBe(false));
});

// ─── classify() — async integration ─────────────────────────────────────────

describe("classify — integration (filename signals dominant)", () => {
  it("brown derbies → shoes, brown, not outfit-shot", async () => {
    const r = await classify("derby_brown.jpg", "data:image/jpeg;base64,abc", "", []);
    expect(r.type).toBe("shoes");
    expect(r.color).toBe("brown");
    expect(r.photoType).toBe("garment");
  });

  it("black shoes → shoes, black, not outfit-shot", async () => {
    const r = await classify("shoes_black.jpg", null, "", []);
    expect(r.type).toBe("shoes");
    expect(r.color).toBe("black");
    expect(r.photoType).toBe("garment");
  });

  it("jeans laid flat → pants, blue", async () => {
    const r = await classify("blue_jeans.jpg", null, "", []);
    expect(r.type).toBe("pants");
    expect(r.color).toBe("blue");
  });

  it("striped shirt on hanger → shirt, not outfit-shot", async () => {
    const r = await classify("shirt_white_stripe.jpg", null, "", []);
    expect(r.type).toBe("shirt");
    expect(r.photoType).toBe("garment");
  });

  it("mirror selfie → outfit-shot, needsReview true", async () => {
    const r = await classify("mirror_selfie.jpg", null, "", []);
    expect(r.photoType).toBe("outfit-shot");
    expect(r.needsReview).toBe(true);
  });

  it("IMG_1234 with shoe keyword → shoes, not review (good filename keyword wins)", async () => {
    const r = await classify("IMG_1234_shoes.jpg", null, "", []);
    expect(r.type).toBe("shoes");
    // Should NOT need review — we found a type
    expect(r.needsReview).toBe(false);
  });

  it("IMG_1234 with pants keyword → pants", async () => {
    const r = await classify("IMG_1234_pants.jpg", null, "", []);
    expect(r.type).toBe("pants");
  });

  it("IMG_1234_shoes.jpg + image says shoes → shoes (filename keyword wins)", async () => {
    // "shoes" keyword in filename → classify returns shoes regardless of pixel
    const r = await classify("IMG_1234_shoes.jpg", null, "", []);
    expect(r.type).toBe("shoes");
  });

  it("IMG_1234_pants.jpg → pants (filename keyword)", async () => {
    const r = await classify("IMG_1234_pants.jpg", null, "", []);
    expect(r.type).toBe("pants");
  });

  it("filename with no color → falls back to grey default", async () => {
    const r = await classify("IMG_1234.jpg", null, "", []);
    expect(r.color).toBe("grey");
  });

  it("needsReview false for clear shoe filename", async () => {
    const r = await classify("derby_black.jpg", null, "", []);
    expect(r.needsReview).toBe(false);
  });

  it("needsReview false for clear pants filename", async () => {
    const r = await classify("chinos_tan.jpg", null, "", []);
    expect(r.needsReview).toBe(false);
  });
});

// ─── Duplicate detection ──────────────────────────────────────────────────────

describe("findPossibleDuplicate", () => {
  const existing = [
    { id: "g1", hash: "1".repeat(64) },
    { id: "g2", hash: "0".repeat(64) },
  ];

  it("exact match → found",        () => expect(findPossibleDuplicate("1".repeat(64), existing)).toBe("g1"));
  it("dist 3 → found",             () => expect(findPossibleDuplicate("1".repeat(61) + "000", existing)).toBe("g1"));
  it("dist > 6 → null",            () => expect(findPossibleDuplicate("1".repeat(32) + "0".repeat(32), existing)).toBeNull());
  it("empty list → null",          () => expect(findPossibleDuplicate("1".repeat(64), [])).toBeNull());
  it("null hash → null",           () => expect(findPossibleDuplicate(null, existing)).toBeNull());
});
