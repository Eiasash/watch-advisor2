import { describe, it, expect } from "vitest";
import { weatherLayerSuggestion, weatherDisplayText } from "../src/config/weatherRules.js";
import { getLayerRecommendation, formatWeatherText } from "../src/weather/weatherService.js";

// ─── weatherLayerSuggestion (features/weather/weatherRules.js) ───────────────

describe("weatherLayerSuggestion", () => {
  it("temp < 10 → heavy-jacket", () => {
    expect(weatherLayerSuggestion({ temperature: 5 })).toBe("heavy-jacket");
  });

  it("temp = 9 → heavy-jacket", () => {
    expect(weatherLayerSuggestion({ temperature: 9 })).toBe("heavy-jacket");
  });

  it("temp = 10 → jacket (boundary)", () => {
    expect(weatherLayerSuggestion({ temperature: 10 })).toBe("jacket");
  });

  it("temp = 15 → jacket", () => {
    expect(weatherLayerSuggestion({ temperature: 15 })).toBe("jacket");
  });

  it("temp = 16 → light-sweater (boundary)", () => {
    expect(weatherLayerSuggestion({ temperature: 16 })).toBe("light-sweater");
  });

  it("temp = 20 → light-sweater", () => {
    expect(weatherLayerSuggestion({ temperature: 20 })).toBe("light-sweater");
  });

  it("temp = 21 → optional-layer (boundary)", () => {
    expect(weatherLayerSuggestion({ temperature: 21 })).toBe("optional-layer");
  });

  it("temp = 25 → optional-layer", () => {
    expect(weatherLayerSuggestion({ temperature: 25 })).toBe("optional-layer");
  });

  it("temp = 26 → no-layer (boundary)", () => {
    expect(weatherLayerSuggestion({ temperature: 26 })).toBe("no-layer");
  });

  it("temp = 35 → no-layer", () => {
    expect(weatherLayerSuggestion({ temperature: 35 })).toBe("no-layer");
  });

  it("negative temp → heavy-jacket", () => {
    expect(weatherLayerSuggestion({ temperature: -5 })).toBe("heavy-jacket");
  });
});

// ─── weatherDisplayText ──────────────────────────────────────────────────────

describe("weatherDisplayText", () => {
  it("formats cold weather correctly", () => {
    const result = weatherDisplayText({ temperature: 5 });
    expect(result).toBe("5°C — heavy jacket recommended");
  });

  it("formats warm weather correctly", () => {
    const result = weatherDisplayText({ temperature: 30 });
    expect(result).toBe("30°C — no extra layer needed");
  });

  it("returns null for null weather", () => {
    expect(weatherDisplayText(null)).toBe(null);
  });

  it("returns null for undefined weather", () => {
    expect(weatherDisplayText(undefined)).toBe(null);
  });
});

// ─── getLayerRecommendation (weather/weatherService.js) ──────────────────────

// v1.13.18 — 4-tier model (coat/sweater/jacket/none) realigned with engine
// + system-prompt rule (NO sweater at ≥14°C on the Mediterranean coast).
// Earlier 3-tier model produced the 2026-05-07 visible mismatch.
describe("getLayerRecommendation (engine-aligned)", () => {
  it("temp < 10 → coat", () => {
    const result = getLayerRecommendation(5);
    expect(result.layer).toBe("coat");
    expect(result.label).toContain("Heavy coat");
  });

  it("temp = 10 → sweater (band start)", () => {
    expect(getLayerRecommendation(10).layer).toBe("sweater");
  });

  it("temp = 12 → sweater", () => {
    expect(getLayerRecommendation(12).layer).toBe("sweater");
  });

  it("temp = 14 → jacket (NOT sweater — Mediterranean rule)", () => {
    expect(getLayerRecommendation(14).layer).toBe("jacket");
  });

  it("temp = 16 → jacket (the 2026-05-07 incident temp — must NOT be sweater)", () => {
    const r = getLayerRecommendation(16);
    expect(r.layer).toBe("jacket");
    expect(r.label).not.toMatch(/[Ss]weater/);
  });

  it("temp = 21 → jacket", () => {
    expect(getLayerRecommendation(21).layer).toBe("jacket");
  });

  it("temp = 22 → none (boundary)", () => {
    expect(getLayerRecommendation(22).layer).toBe("none");
  });

  it("temp = 35 → none", () => {
    expect(getLayerRecommendation(35).layer).toBe("none");
  });
});

// ─── formatWeatherText (weather/weatherService.js) ───────────────────────────

describe("formatWeatherText", () => {
  it("formats full weather object (sweater band)", () => {
    const result = formatWeatherText({ tempC: 12, description: "Partly cloudy" });
    expect(result).toBe("12°C Partly cloudy — Sweater + jacket recommended");
  });

  it("formats full weather object (jacket band — incident temp)", () => {
    const result = formatWeatherText({ tempC: 16, description: "Partly cloudy" });
    expect(result).toBe("16°C Partly cloudy — Light jacket recommended");
  });

  it("returns null for null", () => {
    expect(formatWeatherText(null)).toBe(null);
  });

  it("returns null for undefined", () => {
    expect(formatWeatherText(undefined)).toBe(null);
  });
});
