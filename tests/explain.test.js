import { describe, it, expect } from "vitest";
import { explainOutfit } from "../src/outfitEngine/explain.js";

const watch = {
  id: "snowflake", brand: "Grand Seiko", model: "Snowflake",
  style: "sport-elegant", formality: 7, dial: "silver-white",
};

const outfit = {
  shirt:   { id: "s1", name: "White Oxford",   color: "white",  formality: 7 },
  pants:   { id: "p1", name: "Grey Trousers",  color: "grey",   formality: 7 },
  shoes:   { id: "sh1",name: "Tan Eccos",      color: "tan",    formality: 6 },
  sweater: null, layer: null, jacket: null, belt: null,
  _recommendedDial: null,
};

describe("explainOutfit", () => {
  it("returns an array", () => {
    const result = explainOutfit(watch, outfit, {}, {});
    expect(Array.isArray(result)).toBe(true);
  });

  it("first line mentions watch brand and model", () => {
    const result = explainOutfit(watch, outfit, {}, {});
    expect(result[0]).toContain("Grand Seiko");
    expect(result[0]).toContain("Snowflake");
  });

  it("mentions shirt by name", () => {
    const result = explainOutfit(watch, outfit, {}, {});
    const combined = result.join(" ");
    expect(combined).toContain("White Oxford");
  });

  it("mentions shoes when present", () => {
    const result = explainOutfit(watch, outfit, {}, {});
    const combined = result.join(" ");
    expect(combined).toContain("Tan Eccos");
  });

  it("mentions jacket when present and weather provided", () => {
    const withJacket = { ...outfit, jacket: { id: "j1", name: "Camel Coat", color: "beige", formality: 7 } };
    const result = explainOutfit(watch, withJacket, {}, { tempC: 10 });
    const combined = result.join(" ");
    expect(combined).toContain("Camel Coat");
  });

  it("includes colorMatch signal when provided", () => {
    const result = explainOutfit(watch, outfit, { colorMatch: 1.0 }, {});
    const combined = result.join(" ");
    expect(combined).toContain("Color match");
  });

  it("includes pairHarmonyScore signal when provided", () => {
    const result = explainOutfit(watch, outfit, { pairHarmonyScore: 1.0 }, {});
    const combined = result.join(" ");
    expect(combined).toContain("harmony");
  });

  it("handles empty outfit without throwing", () => {
    const empty = { shirt: null, pants: null, shoes: null, jacket: null, sweater: null, layer: null, belt: null, _recommendedDial: null };
    expect(() => explainOutfit(watch, empty, {}, {})).not.toThrow();
  });

  it("adds dual-dial note when _recommendedDial is set", () => {
    const withDial = {
      ...outfit,
      _recommendedDial: { side: "B", dial: "white", label: "white" },
    };
    const result = explainOutfit(watch, withDial, {}, {});
    const combined = result.join(" ");
    expect(combined).toContain("Reverso");
  });
});
