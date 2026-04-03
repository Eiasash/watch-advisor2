import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLayerRecommendation, formatWeatherText, fetchWeather, fetchWeatherForecast } from "../src/weather/weatherService.js";

// ─── Pure function tests ─────────────────────────────────────────────────────

describe("getLayerRecommendation", () => {
  it("recommends coat below 10°C", () => {
    expect(getLayerRecommendation(5).layer).toBe("coat");
    expect(getLayerRecommendation(9).layer).toBe("coat");
    expect(getLayerRecommendation(-5).layer).toBe("coat");
  });

  it("recommends sweater between 10-15°C", () => {
    expect(getLayerRecommendation(10).layer).toBe("sweater");
    expect(getLayerRecommendation(15).layer).toBe("sweater");
  });

  it("recommends light jacket between 16-21°C", () => {
    expect(getLayerRecommendation(16).layer).toBe("light-jacket");
    expect(getLayerRecommendation(21).layer).toBe("light-jacket");
  });

  it("recommends no layer at 22°C and above", () => {
    expect(getLayerRecommendation(22).layer).toBe("none");
    expect(getLayerRecommendation(35).layer).toBe("none");
  });

  it("includes a human-readable label", () => {
    expect(getLayerRecommendation(5).label).toContain("coat");
    expect(getLayerRecommendation(12).label).toContain("Sweater");
    expect(getLayerRecommendation(18).label).toContain("Light layer");
    expect(getLayerRecommendation(25).label).toContain("No extra");
  });

  it("handles boundary value 10 as sweater not coat", () => {
    expect(getLayerRecommendation(10).layer).toBe("sweater");
  });

  it("handles boundary value 16 as light-jacket not sweater", () => {
    expect(getLayerRecommendation(16).layer).toBe("light-jacket");
  });

  it("handles boundary value 22 as none not light-jacket", () => {
    expect(getLayerRecommendation(22).layer).toBe("none");
  });
});

describe("formatWeatherText", () => {
  it("formats weather with temp, description, and layer recommendation", () => {
    const result = formatWeatherText({ tempC: 25, description: "Clear sky" });
    expect(result).toContain("25°C");
    expect(result).toContain("Clear sky");
    expect(result).toContain("No extra layer");
  });

  it("returns null for null input", () => {
    expect(formatWeatherText(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(formatWeatherText(undefined)).toBeNull();
  });

  it("includes coat recommendation for cold weather", () => {
    const result = formatWeatherText({ tempC: 3, description: "Snow" });
    expect(result).toContain("coat");
  });

  it("includes sweater recommendation for cool weather", () => {
    const result = formatWeatherText({ tempC: 14, description: "Partly cloudy" });
    expect(result).toContain("Sweater");
  });
});

// ─── API integration tests (mocked) ─────────────────────────────────────────

describe("fetchWeather", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches current weather using geolocation", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (resolve) => resolve({ coords: { latitude: 40.7, longitude: -74.0 } }),
      },
    });
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({
          current_weather: { temperature: 22, weathercode: 0 },
        }),
      })
    ));

    const result = await fetchWeather();
    expect(result.tempC).toBe(22);
    expect(result.description).toBe("Clear sky");
    expect(result.weathercode).toBe(0);
  });

  it("maps weather codes correctly", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (resolve) => resolve({ coords: { latitude: 0, longitude: 0 } }),
      },
    });

    const testCases = [
      { code: 0, expected: "Clear sky" },
      { code: 2, expected: "Partly cloudy" },
      { code: 45, expected: "Foggy" },
      { code: 55, expected: "Rain" },
      { code: 71, expected: "Snow" },
      { code: 95, expected: "Thunderstorm" },
      { code: 100, expected: "Unknown" },
    ];

    for (const { code, expected } of testCases) {
      vi.stubGlobal("fetch", vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({
            current_weather: { temperature: 20, weathercode: code },
          }),
        })
      ));
      const result = await fetchWeather();
      expect(result.description).toBe(expected);
    }
  });

  it("falls back to Jerusalem coords when geolocation fails", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_, reject) => reject(new Error("denied")),
      },
    });
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({
          current_weather: { temperature: 15, weathercode: 3 },
        }),
      })
    ));

    // Should not reject — falls back to Jerusalem lat/lng
    const result = await fetchWeather();
    expect(result.tempC).toBe(15);
    expect(result.description).toBe("Partly cloudy");
    // Verify fetch was called with Jerusalem coords
    const url = fetch.mock.calls[0][0];
    expect(url).toContain("31.7683");
    expect(url).toContain("35.2137");
  });
});

describe("fetchWeatherForecast", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 7-day forecast with averaged temps", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (resolve) => resolve({ coords: { latitude: 40.7, longitude: -74.0 } }),
      },
    });
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({
          daily: {
            time: ["2026-03-08", "2026-03-09"],
            temperature_2m_max: [20, 22],
            temperature_2m_min: [10, 12],
            weathercode: [0, 55],
          },
        }),
      })
    ));

    const result = await fetchWeatherForecast();
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2026-03-08");
    expect(result[0].tempC).toBe(15); // (20+10)/2
    expect(result[0].tempMin).toBe(10);
    expect(result[0].tempMax).toBe(20);
    expect(result[0].description).toBe("Clear sky");
    expect(result[1].description).toBe("Rain");
  });

  it("returns empty array when daily data is missing", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (resolve) => resolve({ coords: { latitude: 0, longitude: 0 } }),
      },
    });
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ daily: null }),
      })
    ));

    const result = await fetchWeatherForecast();
    expect(result).toEqual([]);
  });
});
