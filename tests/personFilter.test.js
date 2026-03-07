import { describe, it, expect } from "vitest";
import { isPersonLike, isSelfieFilename, shouldExcludeAsOutfitPhoto } from "../src/classifier/personFilter.js";

// ─── isPersonLike ───────────────────────────────────────────────────────────

describe("isPersonLike", () => {
  it("detects person-like zone distribution", () => {
    expect(isPersonLike({ topF: 0.4, midF: 0.35, botF: 0.25, total: 200 })).toBe(true);
  });

  it("rejects low-total images (< 50 features)", () => {
    expect(isPersonLike({ topF: 0.5, midF: 0.4, botF: 0.3, total: 30 })).toBe(false);
  });

  it("rejects flat-lay distribution (low topF)", () => {
    expect(isPersonLike({ topF: 0.1, midF: 0.5, botF: 0.4, total: 200 })).toBe(false);
  });

  it("rejects when midF too low", () => {
    expect(isPersonLike({ topF: 0.4, midF: 0.15, botF: 0.45, total: 200 })).toBe(false);
  });

  it("rejects when botF too low", () => {
    expect(isPersonLike({ topF: 0.5, midF: 0.4, botF: 0.1, total: 200 })).toBe(false);
  });

  it("handles null zones", () => {
    expect(isPersonLike(null)).toBe(false);
  });

  it("handles undefined zones", () => {
    expect(isPersonLike(undefined)).toBe(false);
  });

  it("handles boundary: exactly 50 features", () => {
    expect(isPersonLike({ topF: 0.4, midF: 0.35, botF: 0.25, total: 50 })).toBe(true);
  });

  it("handles boundary: 51 features", () => {
    expect(isPersonLike({ topF: 0.4, midF: 0.35, botF: 0.25, total: 51 })).toBe(true);
  });

  it("boundary: topF exactly 0.35 → false (not > 0.35)", () => {
    expect(isPersonLike({ topF: 0.35, midF: 0.35, botF: 0.3, total: 200 })).toBe(false);
  });
});

// ─── isSelfieFilename ───────────────────────────────────────────────────────

describe("isSelfieFilename", () => {
  it("detects selfie keyword", () => {
    expect(isSelfieFilename("my_selfie.jpg")).toBe(true);
  });

  it("detects mirror keyword", () => {
    expect(isSelfieFilename("mirror-photo.png")).toBe(true);
  });

  it("detects ootd keyword", () => {
    expect(isSelfieFilename("ootd-2026.jpg")).toBe(true);
  });

  it("detects fitcheck (no separator)", () => {
    expect(isSelfieFilename("fitcheck_morning.jpg")).toBe(true);
  });

  it("detects fit-check (hyphenated)", () => {
    expect(isSelfieFilename("my-fit-check.jpg")).toBe(true);
  });

  it("detects 'full body' with underscores", () => {
    expect(isSelfieFilename("full_body_photo.jpg")).toBe(true);
  });

  it("detects lookbook", () => {
    expect(isSelfieFilename("lookbook-spring.jpg")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(isSelfieFilename("MIRROR_SELFIE.JPG")).toBe(true);
    expect(isSelfieFilename("OoTd_Today.Png")).toBe(true);
  });

  it("returns false for regular garment names", () => {
    expect(isSelfieFilename("blue_shirt.jpg")).toBe(false);
    expect(isSelfieFilename("pants_navy.png")).toBe(false);
    expect(isSelfieFilename("IMG_1234.jpg")).toBe(false);
  });

  it("returns false for 'fit' alone (not fitcheck)", () => {
    expect(isSelfieFilename("good-fit.jpg")).toBe(false);
  });

  it("returns false for 'look' alone (not lookbook)", () => {
    expect(isSelfieFilename("cool-look.jpg")).toBe(false);
  });
});

// ─── shouldExcludeAsOutfitPhoto ─────────────────────────────────────────────

describe("shouldExcludeAsOutfitPhoto", () => {
  it("excludes when filename matches selfie keyword", () => {
    expect(shouldExcludeAsOutfitPhoto("selfie.jpg", null)).toBe(true);
  });

  it("excludes when zones indicate person", () => {
    expect(shouldExcludeAsOutfitPhoto("IMG_1234.jpg", { topF: 0.4, midF: 0.35, botF: 0.25, total: 200 })).toBe(true);
  });

  it("does NOT exclude regular garment file with garment-like zones", () => {
    expect(shouldExcludeAsOutfitPhoto("shirt.jpg", { topF: 0.1, midF: 0.5, botF: 0.4, total: 200 })).toBe(false);
  });

  it("excludes when BOTH filename and zones match", () => {
    expect(shouldExcludeAsOutfitPhoto("mirror.jpg", { topF: 0.5, midF: 0.4, botF: 0.3, total: 200 })).toBe(true);
  });

  it("does not exclude plain IMG filename with null zones", () => {
    expect(shouldExcludeAsOutfitPhoto("IMG_9999.jpg", null)).toBe(false);
  });

  it("does not exclude when zones total is too low", () => {
    expect(shouldExcludeAsOutfitPhoto("photo.jpg", { topF: 0.5, midF: 0.4, botF: 0.3, total: 20 })).toBe(false);
  });
});
