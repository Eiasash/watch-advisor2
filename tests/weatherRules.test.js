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

describe("getLayerRecommendation", () => {
  it("temp < 10 → coat", () => {
    const result = getLayerRecommendation(5);
    expect(result.layer).toBe("coat");
    expect(result.label).toContain("Heavy coat");
  });

  it("temp = 10 → sweater (boundary)", () => {
    expect(getLayerRecommendation(10).layer).toBe("sweater");
  });

  it("temp = 15 → sweater", () => {
    expect(getLayerRecommendation(15).layer).toBe("sweater");
  });

  it("temp = 16 → light-jacket (boundary)", () => {
    expect(getLayerRecommendation(16).layer).toBe("light-jacket");
  });

  it("temp = 21 → light-jacket", () => {
    expect(getLayerRecommendation(21).layer).toBe("light-jacket");
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
  it("formats full weather object", () => {
    const result = formatWeatherText({ tempC: 12, description: "Partly cloudy" });
    expect(result).toBe("12°C Partly cloudy — Sweater recommended");
  });

  it("returns null for null", () => {
    expect(formatWeatherText(null)).toBe(null);
  });

  it("returns null for undefined", () => {
    expect(formatWeatherText(undefined)).toBe(null);
  });
});
