import { describe, it, expect } from "vitest";
import { normalizeType, isAccessoryType, OUTFIT_TYPES } from "../src/classifier/normalizeType.js";
import { normalizeType as featureNormalizeType } from "../src/features/wardrobe/normalizeType.js";
import { buildGarmentName } from "../src/features/wardrobe/garmentNamer.js";
import { isPersonLike, isSelfieFilename, shouldExcludeAsOutfitPhoto } from "../src/classifier/personFilter.js";
import { detectDominantColor } from "../src/classifier/colorDetection.js";

// ─── normalizeType (classifier) ─────────────────────────────────────────────

describe("normalizeType — classifier version", () => {
  const cases = [
    ["sneaker", "shoes"], ["sneakers", "shoes"], ["boots", "shoes"],
    ["loafer", "shoes"], ["derby", "shoes"], ["trainer", "shoes"],
    ["brogue", "shoes"], ["oxfords", "shoes"], ["sandals", "shoes"],
    ["jeans", "pants"], ["jean", "pants"], ["trousers", "pants"],
    ["chinos", "pants"], ["slacks", "pants"], ["shorts", "pants"],
    ["joggers", "pants"],
    ["blazer", "jacket"], ["coat", "jacket"], ["overcoat", "jacket"],
    ["bomber", "jacket"], ["parka", "jacket"], ["peacoat", "jacket"],
    ["cardigan", "sweater"], ["pullover", "sweater"], ["hoodie", "sweater"],
    ["sweatshirt", "sweater"], ["crewneck", "sweater"],
    ["polo", "shirt"], ["tee", "shirt"], ["tshirt", "shirt"],
    ["henley", "shirt"], ["flannel", "shirt"], ["overshirt", "jacket"],
    ["belts", "belt"], ["sunglass", "sunglasses"], ["cap", "hat"],
    ["scarves", "scarf"], ["backpack", "bag"], ["accessories", "accessory"],
  ];

  cases.forEach(([input, expected]) => {
    it(`"${input}" → "${expected}"`, () => {
      expect(normalizeType(input)).toBe(expected);
    });
  });

  it("null → shirt (default)", () => {
    expect(normalizeType(null)).toBe("shirt");
  });

  it("undefined → shirt (default)", () => {
    expect(normalizeType(undefined)).toBe("shirt");
  });

  it("already canonical type passes through", () => {
    expect(normalizeType("shirt")).toBe("shirt");
    expect(normalizeType("pants")).toBe("pants");
    expect(normalizeType("shoes")).toBe("shoes");
  });

  it("strips non-alpha characters", () => {
    expect(normalizeType("  sneaker! ")).toBe("shoes");
  });

  it("knitwear → sweater", () => {
    expect(normalizeType("knitwear")).toBe("sweater");
  });

  it("knit → sweater", () => {
    expect(normalizeType("knit")).toBe("sweater");
  });

  it("blouse → shirt", () => {
    expect(normalizeType("blouse")).toBe("shirt");
  });

  it("top → shirt", () => {
    expect(normalizeType("top")).toBe("shirt");
  });

  it("outfit-photo → outfit-photo", () => {
    expect(normalizeType("outfit-photo")).toBe("outfit-photo");
  });

  it("outfit-shot → outfit-photo", () => {
    expect(normalizeType("outfit-shot")).toBe("outfit-photo");
  });

  it("windbreaker → jacket", () => {
    expect(normalizeType("windbreaker")).toBe("jacket");
  });

  it("raincoat → jacket", () => {
    expect(normalizeType("raincoat")).toBe("jacket");
  });

  // New expanded types
  it("moccasin → shoes", () => expect(normalizeType("moccasin")).toBe("shoes"));
  it("espadrilles → shoes", () => expect(normalizeType("espadrilles")).toBe("shoes"));
  it("cargos → pants", () => expect(normalizeType("cargos")).toBe("pants"));
  it("corduroys → pants", () => expect(normalizeType("corduroys")).toBe("pants"));
  it("sweatpants → pants", () => expect(normalizeType("sweatpants")).toBe("pants"));
  it("vest → jacket", () => expect(normalizeType("vest")).toBe("jacket"));
  it("gilet → jacket", () => expect(normalizeType("gilet")).toBe("jacket"));
  it("trench → jacket", () => expect(normalizeType("trench")).toBe("jacket"));
  it("turtleneck → sweater", () => expect(normalizeType("turtleneck")).toBe("sweater"));
  it("quarter-zip → sweater", () => expect(normalizeType("quarter-zip")).toBe("sweater"));
  it("half-zip → sweater", () => expect(normalizeType("half-zip")).toBe("sweater"));
  it("button-down → shirt", () => expect(normalizeType("button-down")).toBe("shirt"));
  it("hawaiian → shirt", () => expect(normalizeType("hawaiian")).toBe("shirt"));
  it("linen → shirt", () => expect(normalizeType("linen")).toBe("shirt"));
  it("fedora → hat", () => expect(normalizeType("fedora")).toBe("hat"));
  it("beret → hat", () => expect(normalizeType("beret")).toBe("hat"));
  it("shawl → scarf", () => expect(normalizeType("shawl")).toBe("scarf"));
  it("messenger → bag", () => expect(normalizeType("messenger")).toBe("bag"));
  it("tie → accessory", () => expect(normalizeType("tie")).toBe("accessory"));
  it("wallet → accessory", () => expect(normalizeType("wallet")).toBe("accessory"));
});

// ─── normalizeType (feature version — now re-exports classifier) ────────────

describe("normalizeType — feature version (unified)", () => {
  it("sweater → sweater (canonical type, outfit engine handles slot mapping)", () => {
    expect(featureNormalizeType("sweater")).toBe("sweater");
  });

  it("hoodie → sweater", () => {
    expect(featureNormalizeType("hoodie")).toBe("sweater");
  });

  it("outfit-photo → outfit-photo (passthrough)", () => {
    expect(featureNormalizeType("outfit-photo")).toBe("outfit-photo");
  });

  it("outfit-shot → outfit-photo", () => {
    expect(featureNormalizeType("outfit-shot")).toBe("outfit-photo");
  });

  it("sneaker → shoes", () => {
    expect(featureNormalizeType("sneaker")).toBe("shoes");
  });

  it("null → shirt", () => {
    expect(featureNormalizeType(null)).toBe("shirt");
  });

  it("is the same function as classifier normalizeType", () => {
    expect(featureNormalizeType).toBe(normalizeType);
  });
});

// ─── isAccessoryType ────────────────────────────────────────────────────────

describe("isAccessoryType", () => {
  it("belt → true", () => expect(isAccessoryType("belt")).toBe(true));
  it("sunglasses → true", () => expect(isAccessoryType("sunglasses")).toBe(true));
  it("hat → true", () => expect(isAccessoryType("hat")).toBe(true));
  it("scarf → true", () => expect(isAccessoryType("scarf")).toBe(true));
  it("bag → true", () => expect(isAccessoryType("bag")).toBe(true));
  it("accessory → true", () => expect(isAccessoryType("accessory")).toBe(true));
  it("shirt → false", () => expect(isAccessoryType("shirt")).toBe(false));
  it("shoes → false", () => expect(isAccessoryType("shoes")).toBe(false));
  it("pants → false", () => expect(isAccessoryType("pants")).toBe(false));
});

// ─── OUTFIT_TYPES ───────────────────────────────────────────────────────────

describe("OUTFIT_TYPES", () => {
  it("includes shirt, pants, shoes, jacket, sweater", () => {
    expect(OUTFIT_TYPES.has("shirt")).toBe(true);
    expect(OUTFIT_TYPES.has("pants")).toBe(true);
    expect(OUTFIT_TYPES.has("shoes")).toBe(true);
    expect(OUTFIT_TYPES.has("jacket")).toBe(true);
    expect(OUTFIT_TYPES.has("sweater")).toBe(true);
  });
  it("excludes accessories", () => {
    expect(OUTFIT_TYPES.has("belt")).toBe(false);
    expect(OUTFIT_TYPES.has("sunglasses")).toBe(false);
  });
});

// ─── buildGarmentName ───────────────────────────────────────────────────────

describe("buildGarmentName", () => {
  it("camera-roll filename + type + color → descriptive name", () => {
    const name = buildGarmentName("IMG20260221160813.jpg", "pants", "khaki");
    expect(name).toBe("Khaki pants");
  });

  it("descriptive filename is kept as-is", () => {
    const name = buildGarmentName("shirt_navy.jpg", "shirt", "navy");
    expect(name).toBe("shirt navy");
  });

  it("camera-roll + subtype keyword → uses subtype", () => {
    const name = buildGarmentName("IMG_1234_sneakers.jpg", "shoes", "white");
    expect(name).toBe("White sneakers");
  });

  it("camera-roll + no color → just type", () => {
    const name = buildGarmentName("IMG20260221.jpg", "shirt", null);
    expect(name).toBe("Shirt");
  });

  it("grey color is suppressed in name", () => {
    const name = buildGarmentName("IMG_1234.jpg", "shirt", "grey");
    expect(name).toBe("Shirt");
  });

  it("camera-roll with chino subtype", () => {
    const name = buildGarmentName("IMG_5678_chino.jpg", "pants", "tan");
    expect(name).toBe("Tan chinos");
  });

  it("very short filename falls back to type", () => {
    const name = buildGarmentName("ab.jpg", "shoes", "black");
    expect(name).toBe("Black shoes");
  });
});

// ─── personFilter ───────────────────────────────────────────────────────────

describe("isPersonLike", () => {
  it("returns true for person-like zones", () => {
    expect(isPersonLike({ topF: 0.40, midF: 0.35, botF: 0.25, total: 300 })).toBe(true);
  });
  it("returns false for garment zones (low topF)", () => {
    expect(isPersonLike({ topF: 0.10, midF: 0.45, botF: 0.45, total: 300 })).toBe(false);
  });
  it("returns false for null zones", () => {
    expect(isPersonLike(null)).toBe(false);
  });
  it("returns false for low total", () => {
    expect(isPersonLike({ topF: 0.40, midF: 0.35, botF: 0.25, total: 30 })).toBe(false);
  });
});

describe("isSelfieFilename", () => {
  const trueNames = ["mirror_selfie.jpg", "ootd_look.jpg", "fitcheck.jpg", "fullbody.jpg", "lookbook.jpg"];
  const falseNames = ["shirt_navy.jpg", "IMG_1234.jpg", "DSC_0042.jpg"];

  trueNames.forEach(f => {
    it(`"${f}" → true`, () => expect(isSelfieFilename(f)).toBe(true));
  });
  falseNames.forEach(f => {
    it(`"${f}" → false`, () => expect(isSelfieFilename(f)).toBe(false));
  });
});

describe("shouldExcludeAsOutfitPhoto", () => {
  it("selfie filename → exclude", () => {
    expect(shouldExcludeAsOutfitPhoto("mirror_selfie.jpg", { topF: 0, midF: 0, botF: 0, total: 0 })).toBe(true);
  });
  it("person-like zones → exclude", () => {
    expect(shouldExcludeAsOutfitPhoto("IMG_1234.jpg", { topF: 0.40, midF: 0.35, botF: 0.25, total: 300 })).toBe(true);
  });
  it("garment photo → not excluded", () => {
    expect(shouldExcludeAsOutfitPhoto("IMG_1234.jpg", { topF: 0.10, midF: 0.45, botF: 0.45, total: 300 })).toBe(false);
  });
});

// ─── detectDominantColor — pure function tests ──────────────────────────────

describe("detectDominantColor", () => {
  function makeImageData(width, height, r, g, b) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
    return { data, width, height };
  }

  it("all navy pixels → navy", () => {
    const img = makeImageData(8, 8, 20, 35, 85);
    expect(detectDominantColor(img, 8, 8)).toBe("navy");
  });

  it("all dark pixels → black", () => {
    const img = makeImageData(8, 8, 15, 15, 15);
    expect(detectDominantColor(img, 8, 8)).toBe("black");
  });

  it("all brown pixels → brown", () => {
    const img = makeImageData(8, 8, 95, 55, 25);
    expect(detectDominantColor(img, 8, 8)).toBe("brown");
  });

  it("returns null if too few non-background pixels", () => {
    // All white = background, filtered out
    const img = makeImageData(4, 4, 240, 240, 240);
    expect(detectDominantColor(img, 4, 4)).toBeNull();
  });

  it("ambiguous gray with strong runner-up → returns runner-up", () => {
    const width = 10, height = 10;
    const data = new Uint8ClampedArray(width * height * 4);
    // 55 gray pixels, 45 navy pixels
    for (let i = 0; i < 55 * 4; i += 4) {
      data[i] = 128; data[i + 1] = 128; data[i + 2] = 128; data[i + 3] = 255;
    }
    for (let i = 55 * 4; i < 100 * 4; i += 4) {
      data[i] = 20; data[i + 1] = 35; data[i + 2] = 85; data[i + 3] = 255;
    }
    const result = detectDominantColor({ data, width, height }, width, height);
    // Navy is >70% of gray, so gray should be replaced by navy
    expect(result).toBe("navy");
  });
});
