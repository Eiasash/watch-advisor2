import { describe, it, expect } from "vitest";
import { _applyDecision, classifyFromFilename } from "../src/features/wardrobe/classifier.js";

/**
 * Classifier boundary tests — tests the exact boundaries of pixel zone thresholds.
 * All tests use _applyDecision directly (pure function, no mocks needed).
 */

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

const blankFn = () => classifyFromFilename("IMG_1234.jpg"); // no keyword, low confidence

// ─── Pants boundary: total 89 (below range) / 90 (at boundary) / 91 (in range) ──

describe("classifier boundary — pants total range [90–500]", () => {
  const pantsPx = (total) => ({
    ...blankPx(),
    total,
    topF: 0.10,
    midF: 0.45,
    botF: 0.45,
    personLike: false,
    pants: { fires: total >= 90 && total < 500, reason: total >= 90 && total < 500 ? `topF=0.10 total=${total}` : null },
    ambiguous: { fires: !(total >= 90 && total < 500), reason: total < 90 || total >= 500 ? "out of range" : null },
  });

  it("total=89 → pants does NOT fire (below range)", () => {
    const r = _applyDecision(blankFn(), pantsPx(89), null, undefined);
    expect(r.type).not.toBe("pants");
  });

  it("total=90 → pants fires (at lower boundary)", () => {
    const r = _applyDecision(blankFn(), pantsPx(90), null, undefined);
    expect(r.type).toBe("pants");
    expect(r._typeSource).toBe("image-pants");
  });

  it("total=91 → pants fires (just above lower boundary)", () => {
    const r = _applyDecision(blankFn(), pantsPx(91), null, undefined);
    expect(r.type).toBe("pants");
  });

  it("total=499 → pants fires (just below upper boundary)", () => {
    const r = _applyDecision(blankFn(), pantsPx(499), null, undefined);
    expect(r.type).toBe("pants");
  });

  it("total=500 → pants does NOT fire (at upper boundary)", () => {
    const r = _applyDecision(blankFn(), pantsPx(500), null, undefined);
    expect(r.type).not.toBe("pants");
  });

  it("total=501 → pants does NOT fire (above range)", () => {
    const r = _applyDecision(blankFn(), pantsPx(501), null, undefined);
    expect(r.type).not.toBe("pants");
  });
});

// ─── Pants boundary: topF at exactly 0.15 ────────────────────────────────────

describe("classifier boundary — pants topF < 0.15", () => {
  it("topF=0.14 → pants fires (below threshold)", () => {
    const px = {
      ...blankPx(),
      total: 200, topF: 0.14, midF: 0.43, botF: 0.43,
      pants: { fires: true, reason: "topF=0.14" },
    };
    const r = _applyDecision(blankFn(), px, null, undefined);
    expect(r.type).toBe("pants");
  });

  it("topF=0.15 → pants does NOT fire (at threshold)", () => {
    const px = {
      ...blankPx(),
      total: 200, topF: 0.15, midF: 0.43, botF: 0.42,
      pants: { fires: false, reason: null },
      ambiguous: { fires: true, reason: "topF at threshold" },
    };
    const r = _applyDecision(blankFn(), px, null, undefined);
    expect(r.type).not.toBe("pants");
  });

  it("topF=0.16 → pants does NOT fire (above threshold)", () => {
    const px = {
      ...blankPx(),
      total: 200, topF: 0.16, midF: 0.42, botF: 0.42,
      pants: { fires: false, reason: null },
      ambiguous: { fires: true, reason: "topF too high" },
    };
    const r = _applyDecision(blankFn(), px, null, undefined);
    expect(r.type).not.toBe("pants");
  });
});

// ─── Flat-lay boundary: zoneSpread at exactly 0.18 ──────────────────────────

describe("classifier boundary — flat-lay zoneSpread < 0.18", () => {
  it("flatLay=true, total=141 → flat-lay fires", () => {
    const px = {
      ...blankPx(),
      total: 141, topF: 0.33, midF: 0.34, botF: 0.33,
      flatLay: true,
    };
    const r = _applyDecision(blankFn(), px, null, undefined);
    expect(r._typeSource).toBe("flat-lay");
    expect(r.needsReview).toBe(false);
  });

  it("flatLay=false with total=140 → NOT flat-lay (boundary)", () => {
    const px = {
      ...blankPx(),
      total: 140, topF: 0.33, midF: 0.34, botF: 0.33,
      flatLay: false, // total <= 140 → not flatLay
      ambiguous: { fires: true, reason: "total at boundary" },
    };
    const r = _applyDecision(blankFn(), px, null, undefined);
    expect(r._typeSource).not.toBe("flat-lay");
  });
});

// ─── Flat-lay type bias: botF > topF + 0.08 boundary ────────────────────────

describe("classifier boundary — flat-lay botF > topF + 0.08 type bias", () => {
  it("botF - topF = 0.09 → pants (just above 0.08)", () => {
    const px = {
      ...blankPx(),
      total: 500, flatLay: true,
      topF: 0.30, midF: 0.31, botF: 0.39, // botF - topF = 0.09
    };
    const r = _applyDecision(blankFn(), px, null, undefined);
    expect(r.type).toBe("pants");
    expect(r._typeSource).toBe("flat-lay");
  });

  it("botF - topF = 0.08 → shirt (exactly at 0.08, NOT > 0.08)", () => {
    const px = {
      ...blankPx(),
      total: 500, flatLay: true,
      topF: 0.30, midF: 0.32, botF: 0.38, // botF - topF = 0.08 exactly
    };
    const r = _applyDecision(blankFn(), px, null, undefined);
    expect(r.type).toBe("shirt");
    expect(r._typeSource).toBe("flat-lay");
  });

  it("botF - topF = 0.07 → shirt (below 0.08)", () => {
    const px = {
      ...blankPx(),
      total: 500, flatLay: true,
      topF: 0.30, midF: 0.33, botF: 0.37, // botF - topF = 0.07
    };
    const r = _applyDecision(blankFn(), px, null, undefined);
    expect(r.type).toBe("shirt");
    expect(r._typeSource).toBe("flat-lay");
  });
});

// ─── Shoes boundary: terminal override ──────────────────────────────────────

describe("classifier boundary — shoes terminal", () => {
  it("shoes overrides medium filename that isn't shoes", () => {
    const fn = classifyFromFilename("IMG_1234_pants.jpg"); // medium confidence, pants
    const px = {
      ...blankPx(),
      shoes: { fires: true, reason: "bottom-heavy" },
    };
    const r = _applyDecision(fn, px, null, undefined);
    expect(r.type).toBe("shoes");
    expect(r._typeSource).toBe("image-shoes-upgrade");
  });

  it("shoes does NOT override high-confidence filename", () => {
    const fn = classifyFromFilename("pants_grey.jpg"); // high confidence, pants
    const px = {
      ...blankPx(),
      shoes: { fires: true, reason: "bottom-heavy" },
    };
    const r = _applyDecision(fn, px, null, undefined);
    expect(r.type).toBe("pants");
    expect(r._typeSource).toBe("filename-high");
  });
});

// ─── Blind path: with and without pixelColor ────────────────────────────────

describe("classifier boundary — blind path", () => {
  it("no signals, no pixelColor → needsReview true", () => {
    const r = _applyDecision(blankFn(), blankPx(), null, undefined);
    expect(r.needsReview).toBe(true);
    expect(r._typeSource).toBe("blind");
  });

  it("no signals, pixelColor present → needsReview false", () => {
    const r = _applyDecision(blankFn(), blankPx(), "navy", undefined);
    expect(r.needsReview).toBe(false);
    expect(r._typeSource).toBe("blind");
    expect(r.color).toBe("navy");
  });
});

// ─── Filename confidence levels ─────────────────────────────────────────────

describe("classifier boundary — filename confidence levels", () => {
  it("non-camera-roll filename with keyword → high confidence", () => {
    const r = classifyFromFilename("shirt_navy.jpg");
    expect(r.confidence).toBe("high");
  });

  it("camera-roll filename with keyword → medium confidence", () => {
    const r = classifyFromFilename("IMG_1234_shirt.jpg");
    expect(r.confidence).toBe("medium");
  });

  it("camera-roll filename without keyword → low confidence", () => {
    const r = classifyFromFilename("IMG_1234.jpg");
    expect(r.confidence).toBe("low");
  });

  it("DSC pattern detected as camera roll", () => {
    const r = classifyFromFilename("DSC_0042_shoes.jpg");
    expect(r.confidence).toBe("medium");
    expect(r.isCameraRoll).toBe(true);
  });

  it("PXL pattern detected as camera roll", () => {
    const r = classifyFromFilename("PXL_20260307_shirt.jpg");
    expect(r.confidence).toBe("medium");
    expect(r.isCameraRoll).toBe(true);
  });
});

// ─── Accessory types from filename ──────────────────────────────────────────

describe("classifier boundary — accessory/special types", () => {
  it("belt → belt type", () => {
    expect(classifyFromFilename("belt_brown.jpg").type).toBe("belt");
  });

  it("sunglasses → sunglasses type", () => {
    expect(classifyFromFilename("sunglasses_black.jpg").type).toBe("sunglasses");
  });

  it("hat → hat type", () => {
    expect(classifyFromFilename("baseball_cap.jpg").type).toBe("hat");
  });

  it("scarf → scarf type", () => {
    expect(classifyFromFilename("scarf_navy.jpg").type).toBe("scarf");
  });

  it("bag → bag type", () => {
    expect(classifyFromFilename("backpack_black.jpg").type).toBe("bag");
  });

  it("accessory → accessory type", () => {
    expect(classifyFromFilename("watch_strap_brown.jpg").type).toBe("accessory");
  });
});
