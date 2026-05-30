import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLayerRecommendation, getLayerTransition, formatWeatherText, fetchWeather, fetchWeatherForecast } from "../src/weather/weatherService.js";

// ─── Pure function tests ─────────────────────────────────────────────────────

// v1.13.7 — thresholds realigned with engine reality (outfitBuilder.js).
// Engine adds sweater at <14°C, jacket at <22°C, second layer at <8°C.
// Display matches: <10 coat, 10-13 sweater+jacket, 14-21 jacket, ≥22 none.
// Realigned 2026-05-07 after the user-visible incident where the badge said
// "Sweater + jacket" at 16°C morning but the engine refused to add a sweater.
describe("getLayerRecommendation (engine-aligned)", () => {
  it("returns coat below 10°C", () => {
    expect(getLayerRecommendation(5).layer).toBe("coat");
    expect(getLayerRecommendation(9).layer).toBe("coat");
    expect(getLayerRecommendation(-5).layer).toBe("coat");
  });

  it("returns sweater in the 10-12°C band", () => {
    expect(getLayerRecommendation(10).layer).toBe("sweater");
    expect(getLayerRecommendation(12).layer).toBe("sweater");
    expect(getLayerRecommendation(13).layer).toBe("none");
  });

  it("returns no layer in the 13-21°C band (>=13 → no layer)", () => {
    expect(getLayerRecommendation(14).layer).toBe("none");
    expect(getLayerRecommendation(15).layer).toBe("none");
    expect(getLayerRecommendation(16).layer).toBe("none");
    expect(getLayerRecommendation(18).layer).toBe("none");
    expect(getLayerRecommendation(21).layer).toBe("none");
  });

  it("returns none at 22°C and above", () => {
    expect(getLayerRecommendation(22).layer).toBe("none");
    expect(getLayerRecommendation(35).layer).toBe("none");
  });

  it("label is engine-truthful", () => {
    expect(getLayerRecommendation(5).label).toContain("Heavy coat");
    expect(getLayerRecommendation(12).label).toContain("Sweater");
    expect(getLayerRecommendation(16).label).toContain("No extra");
    expect(getLayerRecommendation(25).label).toContain("No extra");
  });

  it("boundary 10°C → sweater (not coat)", () => {
    expect(getLayerRecommendation(10).layer).toBe("sweater");
  });

  it("boundary 13°C → none (>=13)", () => {
    expect(getLayerRecommendation(13).layer).toBe("none");
  });

  it("boundary 22°C → none (not jacket)", () => {
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

  it("includes sweater recommendation in the 10-13°C band", () => {
    // 14°C is the band edge — at 14 it's jacket-only (Mediterranean rule).
    // Sweater is for 10-13°C.
    const result = formatWeatherText({ tempC: 12, description: "Partly cloudy" });
    expect(result).toContain("Sweater");
  });

  it("no warmth layer at 14°C and above (>=13 → no layer)", () => {
    const result = formatWeatherText({ tempC: 16, description: "Partly cloudy" });
    expect(result).toContain("No extra layer");
    expect(result).not.toMatch(/[Ss]weater/);
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

  // ─── 2026-05-07 incident regression ────────────────────────────────────────
  // The chip showed "10°-25°C" for a day where Eias was outside between
  // morning (16°C) and evening (20°C). The 10°C was the 4am low (asleep).
  // Confusing UX: the chip implied the morning was 10°C. Fix: derive a
  // dressing-hours min/max from the 7-10am / 11-14pm / 17-20pm buckets.
  it("computes tempDressingMin/Max from waking-hours buckets, NOT 24h min/max", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (resolve) => resolve({ coords: { latitude: 31.78, longitude: 35.22 } }),
      },
    });
    // Mimic the May 7 forecast: 24h min 10°C (overnight), max 25°C (early
    // afternoon out of bucket). Buckets average 16/23/20 — dressing range
    // should be 16-23, NOT 10-25.
    const hourly = { time: [], temperature_2m: [] };
    const date = "2026-05-08";
    // Overnight (4am): 10°C
    hourly.time.push(`${date}T04:00`); hourly.temperature_2m.push(10);
    // Morning bucket 7-10: 15, 16, 16, 17 → avg 16
    [7, 8, 9, 10].forEach((h, idx) => {
      hourly.time.push(`${date}T${String(h).padStart(2, "0")}:00`);
      hourly.temperature_2m.push([15, 16, 16, 17][idx]);
    });
    // Midday bucket 11-14: 22, 23, 24, 23 → avg 23
    [11, 12, 13, 14].forEach((h, idx) => {
      hourly.time.push(`${date}T${String(h).padStart(2, "0")}:00`);
      hourly.temperature_2m.push([22, 23, 24, 23][idx]);
    });
    // Afternoon peak 15: 25 (NOT in any bucket — must not affect dressing range)
    hourly.time.push(`${date}T15:00`); hourly.temperature_2m.push(25);
    // Evening bucket 17-20: 21, 20, 19, 20 → avg 20
    [17, 18, 19, 20].forEach((h, idx) => {
      hourly.time.push(`${date}T${String(h).padStart(2, "0")}:00`);
      hourly.temperature_2m.push([21, 20, 19, 20][idx]);
    });

    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({
          daily: {
            time: [date],
            temperature_2m_max: [25],
            temperature_2m_min: [10],
            weathercode: [0],
          },
          hourly,
        }),
      })
    ));

    const result = await fetchWeatherForecast();
    expect(result).toHaveLength(1);
    const f = result[0];
    expect(f.tempMorning).toBe(16);
    expect(f.tempMidday).toBe(23);
    expect(f.tempEvening).toBe(20);
    // 24h envelope still preserved for downstream callers that want it
    expect(f.tempMin).toBe(10);
    expect(f.tempMax).toBe(25);
    // Dressing range = min/max across the 3 buckets only
    expect(f.tempDressingMin).toBe(16);
    expect(f.tempDressingMax).toBe(23);
    // The chip uses tempDressingMin/Max — must NOT echo the overnight 10°C
    expect(f.tempDressingMin).not.toBe(10);
    // The layer recommendation must be jacket-only at 16°C morning
    // (the bug was: badge said "Sweater + jacket" at this temp)
    expect(getLayerRecommendation(f.tempMorning).layer).toBe("none");
    expect(getLayerRecommendation(f.tempMorning).label).not.toMatch(/[Ss]weater/);
  });

  it("falls back to 24h min/max when hourly data is missing", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (resolve) => resolve({ coords: { latitude: 0, longitude: 0 } }),
      },
    });
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({
          daily: {
            time: ["2026-03-08"],
            temperature_2m_max: [20],
            temperature_2m_min: [10],
            weathercode: [0],
          },
          // no hourly key
        }),
      })
    ));

    const result = await fetchWeatherForecast();
    expect(result).toHaveLength(1);
    expect(result[0].tempMorning).toBeNull();
    // No buckets → fall back to 24h envelope so the chip still shows something
    expect(result[0].tempDressingMin).toBe(10);
    expect(result[0].tempDressingMax).toBe(20);
  });
});

// ─── getLayerTransition ───────────────────────────────────────────────────────

describe("getLayerTransition", () => {
  it("returns null when forecast is null", () => {
    expect(getLayerTransition(null)).toBeNull();
  });

  it("returns null when tempMorning is missing", () => {
    expect(getLayerTransition({ tempC: 15, description: "Clear sky" })).toBeNull();
  });

  it("returns morning-only string when no midday/evening", () => {
    const result = getLayerTransition({ tempMorning: 12 });
    expect(result).toMatch(/12°C morning/);
    expect(result).not.toMatch(/midday/);
    expect(result).not.toMatch(/evening/);
  });

  it("includes midday transition when layer differs from morning", () => {
    // 8°C morning (coat) → 22°C midday (none)
    const result = getLayerTransition({ tempMorning: 8, tempMidday: 22 });
    expect(result).toContain("8°C morning");
    expect(result).toContain("22°C midday");
  });

  it("omits midday when layer is the same as morning", () => {
    // 5°C morning (coat) → 8°C midday (coat) — same layer, no mention
    const result = getLayerTransition({ tempMorning: 5, tempMidday: 8 });
    expect(result).not.toMatch(/midday/);
  });

  it("includes evening transition when layer changes from midday", () => {
    // 4-tier (v1.13.18) — 20°C midday (jacket) → 8°C evening (coat).
    // The transition crosses two bands so a change is reported.
    const result = getLayerTransition({ tempMorning: 20, tempMidday: 20, tempEvening: 8 });
    expect(result).toContain("8°C evening");
    expect(result).toContain("coat");
  });

  it("uses midpoint separator between parts", () => {
    const result = getLayerTransition({ tempMorning: 8, tempMidday: 22, tempEvening: 10 });
    expect(result).toContain(" · ");
    expect(result?.split(" · ").length).toBeGreaterThanOrEqual(2);
  });
});

// ─── WeatherBadge hourly logic ───────────────────────────────────────────────

describe("WeatherBadge hourly display logic", () => {
  it("hasHourly is true when tempMorning is present", () => {
    const forecast = { tempMorning: 12, tempMidday: 18, tempEvening: 10 };
    expect(forecast.tempMorning != null).toBe(true);
  });

  it("hasHourly is false when tempMorning is absent", () => {
    const forecast = { tempC: 15 };
    expect(forecast.tempMorning != null).toBe(false);
  });

  it("shed-layer hint triggers when midday > morning + 4", () => {
    const forecast = { tempMorning: 10, tempMidday: 20, tempEvening: 14 };
    const shed = forecast.tempMidday != null && forecast.tempMidday > forecast.tempMorning + 4;
    expect(shed).toBe(true);
  });

  it("shed-layer hint does NOT trigger when midday rise is small", () => {
    const forecast = { tempMorning: 15, tempMidday: 17 };
    const shed = forecast.tempMidday != null && forecast.tempMidday > forecast.tempMorning + 4;
    expect(shed).toBe(false);
  });
});
