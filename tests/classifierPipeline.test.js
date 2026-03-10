import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ───────────────────────────────────────────────────────

vi.mock("../src/services/imagePipeline.js", () => ({
  processImage: vi.fn().mockResolvedValue({ thumbnail: "data:image/jpeg;base64,abc", hash: "01".repeat(32) }),
}));

vi.mock("../src/services/photoQueue.js", () => ({
  enqueueOriginalCache: vi.fn(),
}));

vi.mock("../src/features/wardrobe/classifier.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    classify: vi.fn(async (filename) => {
      const fn = actual.classifyFromFilename(filename);
      return {
        type:        fn.type ?? "shirt",
        color:       fn.color ?? null,
        formality:   fn.formality ?? 5,
        photoType:   fn.isSelfieFilename ? "outfit-shot" : "garment",
        needsReview: fn.isSelfieFilename || fn.confidence === "low",
        _confidence: fn.confidence,
        _typeSource: fn.confidence === "high" ? "filename-high"
                   : fn.confidence === "medium" ? "filename-medium"
                   : "blind",
      };
    }),
    analyzeImageContent: vi.fn().mockResolvedValue({
      total: 0, topF: 0, midF: 0, botF: 0, bilatBalance: 0,
      flatLay: false, personLike: false,
      shoes: { fires: false, reason: null },
      shirt: { fires: false, reason: null },
      pants: { fires: false, reason: null },
      ambiguous: { fires: false, reason: null },
      likelyType: null,
    }),
  };
});

// Mock global fetch for Claude Vision fallback
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ type: "belt", color: "brown", formality: 5, confidence: 0.9 }),
});

import { runClassifierPipeline } from "../src/classifier/pipeline.js";
import { processImage } from "../src/services/imagePipeline.js";
import { enqueueOriginalCache } from "../src/services/photoQueue.js";
import { analyzeImageContent } from "../src/features/wardrobe/classifier.js";

function makeFile(name = "shirt_navy.jpg", size = 1024) {
  return new File(["x".repeat(size)], name, { type: "image/jpeg" });
}

beforeEach(() => {
  vi.clearAllMocks();
  processImage.mockResolvedValue({ thumbnail: "data:image/jpeg;base64,abc", hash: "01".repeat(32) });
  analyzeImageContent.mockResolvedValue({
    total: 0, topF: 0, midF: 0, botF: 0,
    flatLay: false, personLike: false,
    shoes: { fires: false, reason: null },
    shirt: { fires: false, reason: null },
    pants: { fires: false, reason: null },
    ambiguous: { fires: false, reason: null },
    likelyType: null,
  });
  global.URL.createObjectURL = vi.fn(() => "blob:mock");
});

// ─── Pipeline — basic flow ──────────────────────────────────────────────────

describe("runClassifierPipeline — basic flow", () => {
  it("returns a complete garment object with id, type, color", async () => {
    const garment = await runClassifierPipeline(makeFile("shirt_navy.jpg"));
    expect(garment.id).toMatch(/^g_/);
    expect(garment.type).toBe("shirt");
    expect(garment.color).toBe("navy");
    expect(garment.thumbnail).toBe("data:image/jpeg;base64,abc");
  });

  it("calls processImage for thumbnail + hash", async () => {
    await runClassifierPipeline(makeFile("pants_grey.jpg"));
    expect(processImage).toHaveBeenCalledTimes(1);
  });

  it("enqueues original cache after processing", async () => {
    const file = makeFile("shoes_brown.jpg");
    const garment = await runClassifierPipeline(file);
    expect(enqueueOriginalCache).toHaveBeenCalledWith(garment.id, file);
  });

  it("applies normalizeType to the classified type", async () => {
    const garment = await runClassifierPipeline(makeFile("sneakers_white.jpg"));
    expect(garment.type).toBe("shoes"); // sneakers → shoes
  });
});

// ─── Pipeline — person/outfit detection ─────────────────────────────────────

describe("runClassifierPipeline — outfit photo exclusion", () => {
  it("selfie filename → outfit-photo with excludeFromWardrobe", async () => {
    const garment = await runClassifierPipeline(makeFile("mirror_selfie.jpg"));
    expect(garment.type).toBe("outfit-photo");
    expect(garment.excludeFromWardrobe).toBe(true);
    expect(garment.photoType).toBe("outfit-shot");
  });

  it("ootd filename → outfit-photo", async () => {
    const garment = await runClassifierPipeline(makeFile("ootd_look.jpg"));
    expect(garment.type).toBe("outfit-photo");
    expect(garment.excludeFromWardrobe).toBe(true);
  });

  it("person-like zones → outfit-photo", async () => {
    analyzeImageContent.mockResolvedValueOnce({
      total: 300, topF: 0.40, midF: 0.35, botF: 0.25,
      flatLay: false, personLike: false,
      shoes: { fires: false, reason: null },
      shirt: { fires: false, reason: null },
      pants: { fires: false, reason: null },
      ambiguous: { fires: false, reason: null },
      likelyType: null,
    });
    const garment = await runClassifierPipeline(makeFile("IMG_1234.jpg"));
    expect(garment.type).toBe("outfit-photo");
    expect(garment.excludeFromWardrobe).toBe(true);
  });
});

// ─── Pipeline — Claude Vision fallback ──────────────────────────────────────

describe("runClassifierPipeline — Claude Vision fallback", () => {
  it("triggers Claude fallback for blind/ambiguous sources", async () => {
    // IMG_1234.jpg has no filename keywords → blind → triggers fallback
    const garment = await runClassifierPipeline(makeFile("IMG_1234.jpg"));
    expect(fetch).toHaveBeenCalled();
    // Claude returns belt/brown → should be normalized
    expect(garment.type).toBe("belt");
    expect(garment.color).toBe("brown");
  });

  it("does NOT trigger fallback for high-confidence filenames", async () => {
    await runClassifierPipeline(makeFile("shirt_navy.jpg"));
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ─── Pipeline — duplicate detection ─────────────────────────────────────────

describe("runClassifierPipeline — duplicate detection", () => {
  it("detects duplicate when hash matches existing garment", async () => {
    const existing = [{ id: "old1", hash: "01".repeat(32) }];
    const garment = await runClassifierPipeline(makeFile("shirt_white.jpg"), existing);
    expect(garment.duplicateOf).toBe("old1");
  });

  it("no duplicate with different hash", async () => {
    processImage.mockResolvedValue({ thumbnail: "data:abc", hash: "11".repeat(32) });
    const existing = [{ id: "old1", hash: "00".repeat(32) }];
    const garment = await runClassifierPipeline(makeFile("shirt_white.jpg"), existing);
    expect(garment.duplicateOf).toBeUndefined();
  });
});

// ─── Pipeline — descriptive naming ──────────────────────────────────────────

describe("runClassifierPipeline — garment naming", () => {
  it("camera-roll files get descriptive names", async () => {
    const garment = await runClassifierPipeline(makeFile("IMG20260221160813.jpg"));
    // Should not be the raw camera filename
    expect(garment.name).not.toContain("IMG20260221160813");
  });

  it("descriptive filenames are kept", async () => {
    const garment = await runClassifierPipeline(makeFile("shirt_navy.jpg"));
    expect(garment.name).toContain("shirt");
  });
});

// ─── Pipeline — material/pattern/colorAlternatives propagation ──────────────

describe("runClassifierPipeline — AI material + pattern propagation", () => {
  it("propagates material and pattern from Claude Vision fallback", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        type: "sweater", color: "charcoal", material: "wool",
        pattern: "cable knit", formality: 6, confidence: 0.92,
        color_alternatives: ["dark green", "slate", "grey"],
      }),
    });
    const garment = await runClassifierPipeline(makeFile("IMG_9999.jpg"));
    expect(garment.type).toBe("sweater");
    expect(garment.color).toBe("charcoal");
    expect(garment.material).toBe("wool");
    expect(garment.pattern).toBe("cable knit");
  });

  it("normalizes AI color alternatives to scoring palette", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        type: "pants", color: "denim", formality: 4, confidence: 0.85,
        color_alternatives: ["dark navy", "ivory", "camel"],
      }),
    });
    const garment = await runClassifierPipeline(makeFile("DSC_0042.jpg"));
    expect(garment.color).toBe("blue"); // denim → blue
    expect(garment.colorAlternatives).toEqual(["navy", "cream", "tan"]);
  });

  it("omits material/pattern when AI does not return them", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ type: "belt", color: "brown", formality: 5, confidence: 0.9 }),
    });
    const garment = await runClassifierPipeline(makeFile("IMG_5555.jpg"));
    expect(garment.material).toBeUndefined();
    expect(garment.pattern).toBeUndefined();
    expect(garment.colorAlternatives).toBeUndefined();
  });
});

// ─── Pipeline — sweater classification ──────────────────────────────────────

describe("runClassifierPipeline — sweater vs shirt classification", () => {
  it("sweater_olive.jpg → type sweater (not shirt)", async () => {
    const garment = await runClassifierPipeline(makeFile("sweater_olive.jpg"));
    expect(garment.type).toBe("sweater");
    expect(garment.color).toBe("olive");
  });

  it("hoodie_grey.jpg → type sweater", async () => {
    const garment = await runClassifierPipeline(makeFile("hoodie_grey.jpg"));
    expect(garment.type).toBe("sweater");
  });

  it("crewneck_navy.jpg → type sweater", async () => {
    const garment = await runClassifierPipeline(makeFile("crewneck_navy.jpg"));
    expect(garment.type).toBe("sweater");
  });

  it("shirt_white.jpg → type shirt (not sweater)", async () => {
    const garment = await runClassifierPipeline(makeFile("shirt_white.jpg"));
    expect(garment.type).toBe("shirt");
  });

  it("polo_navy.jpg → type shirt", async () => {
    const garment = await runClassifierPipeline(makeFile("polo_navy.jpg"));
    expect(garment.type).toBe("shirt");
  });

  it("flat-lay 'shirt' result triggers Vision fallback — crewneck correctly reclassified", async () => {
    // Simulate pixel classifier producing flat-lay → shirt (as happens with folded crewnecks)
    const { classify } = await import("../src/features/wardrobe/classifier.js");
    classify.mockResolvedValueOnce({
      type: "shirt", color: "navy", formality: 6,
      photoType: "garment", needsReview: false,
      _typeSource: "flat-lay",
    });
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve({
        type: "sweater", color: "navy", material: "knit",
        pattern: "cable knit", formality: 6, confidence: 0.93,
      }),
    });
    const garment = await runClassifierPipeline(makeFile("IMG_4521.jpg"));
    expect(fetch).toHaveBeenCalled(); // Vision fallback fired
    expect(garment.type).toBe("sweater");
    expect(garment.material).toBe("knit");
    expect(garment.pattern).toBe("cable knit");
    expect(garment._typeSource ?? garment.color).toBeTruthy(); // result valid
  });

  it("flat-lay 'pants' result does NOT trigger Vision fallback", async () => {
    const { classify } = await import("../src/features/wardrobe/classifier.js");
    classify.mockResolvedValueOnce({
      type: "pants", color: "stone", formality: 5,
      photoType: "garment", needsReview: false,
      _typeSource: "flat-lay",
    });
    global.fetch = vi.fn();
    const garment = await runClassifierPipeline(makeFile("IMG_4522.jpg"));
    expect(fetch).not.toHaveBeenCalled(); // no Vision for flat-lay pants
    expect(garment.type).toBe("pants");
  });
});

// ─── normalizeAIColor export ────────────────────────────────────────────────

import { normalizeAIColor } from "../src/classifier/pipeline.js";

describe("normalizeAIColor — maps AI colors to scoring palette", () => {
  it("maps denim → blue", () => expect(normalizeAIColor("denim")).toBe("blue"));
  it("maps camel → tan", () => expect(normalizeAIColor("camel")).toBe("tan"));
  it("maps ivory → cream", () => expect(normalizeAIColor("ivory")).toBe("cream"));
  it("maps rust → brown", () => expect(normalizeAIColor("rust")).toBe("brown"));
  it("maps maroon → burgundy", () => expect(normalizeAIColor("maroon")).toBe("burgundy"));
  it("maps gray → grey", () => expect(normalizeAIColor("gray")).toBe("grey"));
  it("passes canonical colors through", () => expect(normalizeAIColor("navy")).toBe("navy"));
  it("returns null for null input", () => expect(normalizeAIColor(null)).toBe(null));
  it("handles case insensitivity", () => expect(normalizeAIColor("DENIM")).toBe("blue"));
});
