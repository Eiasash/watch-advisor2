import { describe, it, expect, vi, beforeEach } from "vitest";

describe("getWeather", () => {
  let getWeather;

  beforeEach(async () => {
    // Mock navigator.geolocation
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: vi.fn((resolve) =>
          resolve({ coords: { latitude: 25.0, longitude: 55.0 } })
        ),
      },
    });
    vi.stubGlobal("fetch", vi.fn());
    const mod = await import("../src/features/weather/getWeather.js");
    getWeather = mod.getWeather;
  });

  it("returns current weather data", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          current_weather: { temperature: 32, windspeed: 10, weathercode: 0 },
        }),
    });
    const result = await getWeather();
    expect(result.temperature).toBe(32);
    expect(result.windspeed).toBe(10);
  });

  it("calls Open-Meteo with correct coordinates", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ current_weather: {} }),
    });
    await getWeather();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("latitude=25")
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("longitude=55")
    );
  });

  it("throws when geolocation fails", async () => {
    globalThis.navigator.geolocation.getCurrentPosition = vi.fn((_, reject) =>
      reject(new Error("denied"))
    );
    await expect(getWeather()).rejects.toThrow("denied");
  });

  it("throws when fetch fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(getWeather()).rejects.toThrow("offline");
  });
});
