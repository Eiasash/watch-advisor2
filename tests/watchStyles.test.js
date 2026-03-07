import { describe, it, expect } from "vitest";
import { watchStyles, STYLE_TO_SLOTS, STYLE_FORMALITY_TARGET } from "../src/outfitEngine/watchStyles.js";

describe("watchStyles data integrity", () => {
  const allStyles = Object.keys(watchStyles);

  it("all watchStyles keys have matching STYLE_TO_SLOTS entries", () => {
    for (const style of allStyles) {
      expect(STYLE_TO_SLOTS[style]).toBeDefined();
    }
  });

  it("all watchStyles keys have matching STYLE_FORMALITY_TARGET entries", () => {
    for (const style of allStyles) {
      expect(STYLE_FORMALITY_TARGET[style]).toBeDefined();
    }
  });

  it("STYLE_FORMALITY_TARGET values are within valid range [1–10]", () => {
    for (const [style, target] of Object.entries(STYLE_FORMALITY_TARGET)) {
      expect(target).toBeGreaterThanOrEqual(1);
      expect(target).toBeLessThanOrEqual(10);
    }
  });

  it("STYLE_TO_SLOTS always includes shirt, pants, shoes", () => {
    for (const [style, slots] of Object.entries(STYLE_TO_SLOTS)) {
      expect(slots.shirt).toBe("shirt");
      expect(slots.pants).toBe("pants");
      expect(slots.shoes).toBe("shoes");
    }
  });

  it("no extra keys in STYLE_FORMALITY_TARGET without watchStyles entry", () => {
    for (const style of Object.keys(STYLE_FORMALITY_TARGET)) {
      expect(watchStyles[style]).toBeDefined();
    }
  });

  it("watchStyles arrays contain only strings", () => {
    for (const [style, garments] of Object.entries(watchStyles)) {
      expect(Array.isArray(garments)).toBe(true);
      for (const g of garments) {
        expect(typeof g).toBe("string");
      }
    }
  });

  it("dress style has highest formality", () => {
    expect(STYLE_FORMALITY_TARGET.dress).toBeGreaterThanOrEqual(STYLE_FORMALITY_TARGET.sport);
    expect(STYLE_FORMALITY_TARGET.dress).toBeGreaterThanOrEqual(STYLE_FORMALITY_TARGET.diver);
  });
});
