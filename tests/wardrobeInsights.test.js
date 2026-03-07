import { describe, it, expect } from "vitest";
import { computeInsights } from "../src/wardrobe/wardrobeInsights.js";

const makeGarment = (id, type, color, extras = {}) => ({ id, type, color, ...extras });

describe("computeInsights", () => {
  it("counts garments by type correctly", () => {
    const garments = [
      makeGarment("1", "shirt", "white"),
      makeGarment("2", "shirt", "blue"),
      makeGarment("3", "pants", "navy"),
      makeGarment("4", "shoes", "black"),
      makeGarment("5", "jacket", "grey"),
      makeGarment("6", "sweater", "red"),
    ];
    const result = computeInsights(garments);
    expect(result.total).toBe(6);
    expect(result.shirts).toBe(2);
    expect(result.pants).toBe(1);
    expect(result.shoes).toBe(1);
    expect(result.jackets).toBe(1);
    expect(result.sweaters).toBe(1);
    expect(result.accessories).toBe(0);
  });

  it("counts accessory types", () => {
    const garments = [
      makeGarment("1", "belt", "brown"),
      makeGarment("2", "sunglasses", "black"),
      makeGarment("3", "hat", "navy"),
      makeGarment("4", "scarf", "red"),
      makeGarment("5", "bag", "tan"),
      makeGarment("6", "accessory", "silver"),
    ];
    const result = computeInsights(garments);
    expect(result.accessories).toBe(6);
    expect(result.total).toBe(6);
  });

  it("excludes outfit-photo type", () => {
    const garments = [
      makeGarment("1", "shirt", "white"),
      makeGarment("2", "outfit-photo", "none"),
    ];
    const result = computeInsights(garments);
    expect(result.total).toBe(1);
    expect(result.shirts).toBe(1);
  });

  it("excludes garments with excludeFromWardrobe flag", () => {
    const garments = [
      makeGarment("1", "shirt", "white"),
      makeGarment("2", "shirt", "blue", { excludeFromWardrobe: true }),
    ];
    const result = computeInsights(garments);
    expect(result.total).toBe(1);
    expect(result.shirts).toBe(1);
  });

  it("computes dominant colors sorted by frequency", () => {
    const garments = [
      makeGarment("1", "shirt", "navy"),
      makeGarment("2", "shirt", "navy"),
      makeGarment("3", "shirt", "navy"),
      makeGarment("4", "pants", "black"),
      makeGarment("5", "pants", "black"),
      makeGarment("6", "shoes", "brown"),
    ];
    const result = computeInsights(garments);
    expect(result.dominantColors[0]).toEqual({ color: "navy", count: 3 });
    expect(result.dominantColors[1]).toEqual({ color: "black", count: 2 });
    expect(result.dominantColors[2]).toEqual({ color: "brown", count: 1 });
  });

  it("limits dominant colors to 6", () => {
    const colors = ["white", "black", "navy", "grey", "brown", "tan", "red", "blue"];
    const garments = colors.map((c, i) => makeGarment(String(i), "shirt", c));
    const result = computeInsights(garments);
    expect(result.dominantColors.length).toBe(6);
  });

  it("handles empty garments array", () => {
    const result = computeInsights([]);
    expect(result.total).toBe(0);
    expect(result.shirts).toBe(0);
    expect(result.dominantColors).toEqual([]);
  });

  it("handles null entries in garments array", () => {
    const garments = [null, makeGarment("1", "shirt", "white"), undefined];
    const result = computeInsights(garments);
    expect(result.total).toBe(1);
  });

  it("falls back to category when type is missing", () => {
    const garments = [{ id: "1", category: "shirt", color: "white" }];
    const result = computeInsights(garments);
    expect(result.shirts).toBe(1);
  });
});
