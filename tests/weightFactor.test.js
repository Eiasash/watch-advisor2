import { describe, it, expect } from "vitest";
import weightFactor from "../src/outfitEngine/scoringFactors/weightFactor.js";

function make(weight, type = "shirt") {
  return { garment: { id: "g1", weight, type } };
}
function ctx(tempC) {
  return { weather: { tempC } };
}

describe("weightFactor — untagged / missing", () => {
  it("returns 0 for null weight", () => {
    expect(weightFactor(make(null), ctx(25))).toBe(0);
  });
  it("returns 0 for undefined weight", () => {
    expect(weightFactor({ garment: { id: "g1" } }, ctx(25))).toBe(0);
  });
  it("returns 0 for numeric weight (non-string guard)", () => {
    expect(weightFactor(make(5), ctx(25))).toBe(0);
  });
  it("returns 0 for boolean weight (non-string guard)", () => {
    expect(weightFactor(make(true), ctx(25))).toBe(0);
  });
  it("returns 0 when tempC is null", () => {
    expect(weightFactor(make("heavy"), { weather: {} })).toBe(0);
  });
  it("returns 0 when weather is absent from context", () => {
    expect(weightFactor(make("heavy"), {})).toBe(0);
  });
  it("returns 0 for null garment", () => {
    expect(weightFactor({ garment: null }, ctx(25))).toBe(0);
  });
});

describe("weightFactor — hot weather (>22°C)", () => {
  it("penalises heavy garment in heat by -0.15", () => {
    expect(weightFactor(make("heavy"), ctx(28))).toBe(-0.15);
  });
  it("rewards ultralight in heat by +0.08", () => {
    expect(weightFactor(make("ultralight"), ctx(30))).toBe(0.08);
  });
  it("returns 0 for medium in heat", () => {
    expect(weightFactor(make("medium"), ctx(28))).toBe(0);
  });
  it("returns 0 for light in heat", () => {
    expect(weightFactor(make("light"), ctx(28))).toBe(0);
  });
});

describe("weightFactor — cold weather (<10°C)", () => {
  it("rewards heavy garment in cold by +0.10", () => {
    expect(weightFactor(make("heavy"), ctx(5))).toBe(0.10);
  });
  it("penalises ultralight in cold by -0.10", () => {
    expect(weightFactor(make("ultralight"), ctx(5))).toBe(-0.10);
  });
  it("returns 0 for medium in cold", () => {
    expect(weightFactor(make("medium"), ctx(5))).toBe(0);
  });
});

describe("weightFactor — neutral temperature range (10–22°C)", () => {
  it("returns 0 for heavy at 15°C", () => {
    expect(weightFactor(make("heavy"), ctx(15))).toBe(0);
  });
  it("returns 0 for ultralight at 18°C", () => {
    expect(weightFactor(make("ultralight"), ctx(18))).toBe(0);
  });
  it("returns 0 at exactly 10°C boundary", () => {
    expect(weightFactor(make("heavy"), ctx(10))).toBe(0);
  });
  it("returns 0 at exactly 22°C boundary", () => {
    expect(weightFactor(make("heavy"), ctx(22))).toBe(0);
  });
});

describe("weightFactor — layer types exempt", () => {
  it("returns 0 for jacket regardless of weight", () => {
    expect(weightFactor(make("heavy", "jacket"), ctx(30))).toBe(0);
  });
  it("returns 0 for sweater regardless of weight", () => {
    expect(weightFactor(make("heavy", "sweater"), ctx(30))).toBe(0);
  });
  it("returns 0 for coat", () => {
    expect(weightFactor(make("heavy", "coat"), ctx(30))).toBe(0);
  });
});
