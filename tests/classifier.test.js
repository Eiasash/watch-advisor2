import { describe, it, expect } from "vitest";
import { classifyFromFilename, findPossibleDuplicate, classify } from "../src/features/wardrobe/classifier.js";

// ─── Filename type classification ────────────────────────────────────────────

describe("classifyFromFilename — type", () => {
  const shoes = [
    "shoes_brown.jpg", "sneakers_white.jpg", "derby_tan.jpg", "derbies_black.jpg",
    "loafer_cognac.jpg", "boots_brown.jpg", "chelsea_boots.jpg", "brogue_tan.jpg",
    "trainer_white.jpg", "sneaker_navy.jpg",
  ];
  shoes.forEach(f => {
    it(`classifies '${f}' as shoes`, () => {
      expect(classifyFromFilename(f).type).toBe("shoes");
    });
  });

  const pants = [
    "pants_grey.jpg", "trousers_navy.jpg", "chinos_khaki.jpg", "jeans_dark.jpg",
    "joggers_black.jpg", "chino_stone.jpg", "trouser_grey.jpg",
  ];
  pants.forEach(f => {
    it(`classifies '${f}' as pants`, () => {
      expect(classifyFromFilename(f).type).toBe("pants");
    });
  });

  const jackets = [
    "jacket_grey.jpg", "blazer_navy.jpg", "coat_camel.jpg", "bomber_olive.jpg",
    "cardigan_brown.jpg", "overcoat_black.jpg", "overshirt_olive.jpg",
  ];
  jackets.forEach(f => {
    it(`classifies '${f}' as jacket`, () => {
      expect(classifyFromFilename(f).type).toBe("jacket");
    });
  });

  const shirts = [
    "shirt_white.jpg", "polo_navy.jpg", "tee_black.jpg", "knit_cream.jpg",
    "sweater_olive.jpg", "hoodie_grey.jpg",
  ];
  shirts.forEach(f => {
    it(`classifies '${f}' as shirt`, () => {
      expect(classifyFromFilename(f).type).toBe("shirt");
    });
  });
});

// ─── Shoes take priority over oxford-shirt collision ─────────────────────────

describe("classifyFromFilename — priority edge cases", () => {
  it("shoes beats shirt for 'oxford_shoes_tan.jpg'", () => {
    expect(classifyFromFilename("oxford_shoes_tan.jpg").type).toBe("shoes");
  });

  it("derby classifies as shoes not shirt", () => {
    expect(classifyFromFilename("derby_black.jpg").type).toBe("shoes");
  });
});

// ─── Color classification ─────────────────────────────────────────────────────

describe("classifyFromFilename — color", () => {
  it("extracts navy from filename", () => expect(classifyFromFilename("shirt_navy.jpg").color).toBe("navy"));
  it("extracts black from filename", () => expect(classifyFromFilename("shoes_black.jpg").color).toBe("black"));
  it("extracts olive from filename", () => expect(classifyFromFilename("jacket_olive.jpg").color).toBe("olive"));
  it("extracts tan from filename",   () => expect(classifyFromFilename("chinos_tan.jpg").color).toBe("tan"));
  it("returns null for unrecognised color", () => expect(classifyFromFilename("IMG_1234.jpg").color).toBeNull());
});

// ─── Formality rules ──────────────────────────────────────────────────────────

describe("classifyFromFilename — formality", () => {
  it("derby shoes score formality 8",   () => expect(classifyFromFilename("derby_black.jpg").formality).toBe(8));
  it("sneakers score formality 3",       () => expect(classifyFromFilename("sneakers_white.jpg").formality).toBe(3));
  it("blazer scores formality 8",        () => expect(classifyFromFilename("blazer_navy.jpg").formality).toBe(8));
  it("hoodie scores formality 3",        () => expect(classifyFromFilename("hoodie_grey.jpg").formality).toBe(3));
  it("trousers score formality 7",       () => expect(classifyFromFilename("trousers_grey.jpg").formality).toBe(7));
  it("jeans score formality 4",          () => expect(classifyFromFilename("jeans_dark.jpg").formality).toBe(4));
  it("overcoat scores formality 9",      () => expect(classifyFromFilename("overcoat_black.jpg").formality).toBe(9));
});

// ─── Selfie / outfit shot detection ──────────────────────────────────────────

describe("classifyFromFilename — selfie/outfit shot", () => {
  it("flags IMG_1234.jpg as potential selfie", () => {
    expect(classifyFromFilename("IMG_1234.jpg").isSelfieFilename).toBe(true);
  });
  it("flags DSC_0042.jpg as potential selfie", () => {
    expect(classifyFromFilename("DSC_0042.jpg").isSelfieFilename).toBe(true);
  });
  it("flags mirror_selfie.jpg as potential selfie", () => {
    expect(classifyFromFilename("mirror_selfie.jpg").isSelfieFilename).toBe(true);
  });
  it("flags ootd_look.jpg as potential selfie", () => {
    expect(classifyFromFilename("ootd_look.jpg").isSelfieFilename).toBe(true);
  });
  it("does NOT flag shirt_navy.jpg as selfie", () => {
    expect(classifyFromFilename("shirt_navy.jpg").isSelfieFilename).toBe(false);
  });
  it("does NOT flag blazer_navy.jpg as selfie", () => {
    expect(classifyFromFilename("blazer_navy.jpg").isSelfieFilename).toBe(false);
  });
});

// ─── needsReview flag ─────────────────────────────────────────────────────────

describe("classify — needsReview", () => {
  it("sets needsReview for IMG_1234 (selfie pattern)", () => {
    const r = classify("IMG_1234.jpg", null, "", []);
    expect(r.needsReview).toBe(true);
  });
  it("sets needsReview for low confidence filename", () => {
    const r = classify("photo.jpg", null, "", []);
    expect(r.needsReview).toBe(true);
  });
  it("does NOT set needsReview for clear shoe filename", () => {
    const r = classify("derby_black.jpg", null, "0101010101010101010101010101010101010101010101010101010101010101", []);
    expect(r.needsReview).toBe(false);
  });
});

// ─── Duplicate detection ──────────────────────────────────────────────────────

describe("findPossibleDuplicate", () => {
  const existing = [
    { id: "g1", hash: "1111111111111111111111111111111111111111111111111111111111111111" },
    { id: "g2", hash: "0000000000000000000000000000000000000000000000000000000000000000" },
  ];

  it("finds near-identical hash (hamming dist 0)", () => {
    const result = findPossibleDuplicate(
      "1111111111111111111111111111111111111111111111111111111111111111",
      existing
    );
    expect(result).toBe("g1");
  });

  it("finds near-identical hash within threshold (dist 3)", () => {
    const slightlyDiff = "1111111111111111111111111111111111111111111111111111111111111000";
    expect(findPossibleDuplicate(slightlyDiff, existing)).toBe("g1");
  });

  it("returns null for clearly different hash (dist > 6)", () => {
    const different = "1111000011110000111100001111000011110000111100001111000011110000";
    expect(findPossibleDuplicate(different, existing)).toBeNull();
  });

  it("returns null for empty existing list", () => {
    expect(findPossibleDuplicate("1111", [])).toBeNull();
  });

  it("returns null for null hash", () => {
    expect(findPossibleDuplicate(null, existing)).toBeNull();
  });
});

// ─── classify() integration ───────────────────────────────────────────────────

describe("classify — integration", () => {
  it("outfit shot gets photoType=outfit-shot", () => {
    const r = classify("IMG_1234.jpg", null, "", []);
    expect(r.photoType).toBe("outfit-shot");
  });

  it("clear garment filename gets photoType=garment", () => {
    const r = classify("shirt_white.jpg", null, "", []);
    expect(r.photoType).toBe("garment");
  });

  it("uses filename color when available", () => {
    const r = classify("shirt_navy.jpg", null, "", []);
    expect(r.color).toBe("navy");
  });

  it("falls back to grey when no color signal at all", () => {
    // no thumbnail (null), no color in filename
    const r = classify("IMG_1234.jpg", null, "", []);
    expect(r.color).toBe("grey");
  });

  it("flags duplicate when hash matches", () => {
    const existing = [{ id: "g_existing", hash: "1".repeat(64) }];
    const r = classify("shirt_black.jpg", null, "1".repeat(64), existing);
    expect(r.duplicateOf).toBe("g_existing");
  });
});
