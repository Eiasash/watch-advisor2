import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ────────────────────────────────────────────────────────────

let appConfigResult = { data: null, error: null };
let garmentsResult = { data: [], error: null };
let historyResult = { data: [], error: null };
let upsertCalls = [];

function makeChain(resolveWith) {
  const chain = {
    select: vi.fn(() => chain),
    eq:     vi.fn(() => chain),
    not:    vi.fn(() => chain),
    gte:    vi.fn(() => chain),
    order:  vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(resolveWith())),
    // terminal for garments/history queries (no .single)
    then:   undefined,
  };
  // Make the chain thenable so `await supabase.from(...).select(...).eq(...)` resolves
  chain[Symbol.for("thenable")] = true;
  // Allow `await chain` by making it a promise too
  const promise = Promise.resolve(resolveWith());
  chain.then = promise.then.bind(promise);
  chain.catch = promise.catch.bind(promise);
  return chain;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table) => {
      if (table === "app_config") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve(appConfigResult)),
            })),
          })),
          upsert: vi.fn((...args) => {
            upsertCalls.push(args);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === "garments") {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          not: vi.fn(() => chain),
          then: undefined,
        };
        const p = Promise.resolve(garmentsResult);
        chain.then = p.then.bind(p);
        chain.catch = p.catch.bind(p);
        return chain;
      }
      if (table === "history") {
        const chain = {
          select: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          order: vi.fn(() => chain),
          then: undefined,
        };
        const p = Promise.resolve(historyResult);
        chain.then = p.then.bind(p);
        chain.catch = p.catch.bind(p);
        return chain;
      }
      return makeChain(() => ({ data: [], error: null }));
    }),
  })),
}));

// ── Claude client mock ───────────────────────────────────────────────────────

vi.mock("../netlify/functions/_claudeClient.js", () => ({
  callClaude: vi.fn().mockResolvedValue({
    content: [{ text: JSON.stringify({
      watch: "GS Snowflake",
      watchId: "snowflake",
      strap: "brown leather",
      shirt: "Navy Polo",
      sweater: null,
      layer: null,
      pants: "Grey Chinos",
      shoes: "Brown Derby",
      jacket: null,
      belt: null,
      reasoning: "Great combo",
      score: 8.5,
      layerTip: null,
    }) }],
  }),
  getConfiguredModel: vi.fn().mockResolvedValue("claude-sonnet-4-6"),
}));

// ── Environment ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv("CLAUDE_API_KEY", "test-key");
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  vi.stubGlobal("fetch", vi.fn());
  appConfigResult = { data: null, error: null };
  garmentsResult = { data: [
    { id: "g1", name: "Navy Polo", type: "shirt", category: "shirt", color: "navy", brand: "Lacoste", formality: 5 },
    { id: "g2", name: "Grey Chinos", type: "pants", category: "pants", color: "grey", formality: 5 },
    { id: "g3", name: "Brown Derby", type: "shoes", category: "shoes", color: "brown", formality: 6 },
  ], error: null };
  historyResult = { data: [], error: null };
  upsertCalls = [];
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("daily-pick handler", () => {
  let handler;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../netlify/functions/daily-pick.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS", async () => {
    const result = await handler({ httpMethod: "OPTIONS" });
    expect(result.statusCode).toBe(204);
  });

  it("returns 500 when CLAUDE_API_KEY missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    vi.resetModules();
    const mod = await import("../netlify/functions/daily-pick.js");
    const result = await mod.handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain("CLAUDE_API_KEY");
  });

  it("returns cached pick when less than 4 hours old", async () => {
    const freshPick = {
      watch: "GS Snowflake",
      generatedAt: new Date().toISOString(),
      score: 9,
    };
    appConfigResult = { data: { value: freshPick }, error: null };

    const result = await handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.watch).toBe("GS Snowflake");
    expect(body.score).toBe(9);
  });

  it("regenerates when cache is stale (> 4 hours)", async () => {
    const stalePick = {
      watch: "Old Pick",
      generatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    };
    appConfigResult = { data: { value: stalePick }, error: null };

    // Weather fetch mock
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        current_weather: { temperature: 22, weathercode: 1 },
        hourly: { time: [], temperature_2m: [] },
      }),
    });

    const result = await handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    // Should be the new AI pick, not the stale cache
    expect(body.watch).toBe("GS Snowflake");
    expect(body.generatedAt).toBeDefined();
  });

  it("bypasses cache when forceRefresh is true", async () => {
    const freshPick = {
      watch: "Cached",
      generatedAt: new Date().toISOString(),
    };
    appConfigResult = { data: { value: freshPick }, error: null };

    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        current_weather: { temperature: 18, weathercode: 0 },
        hourly: { time: [], temperature_2m: [] },
      }),
    });

    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ forceRefresh: true }),
    });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.watch).toBe("GS Snowflake"); // AI-generated, not "Cached"
  });

  it("uses weather from POST body when provided", async () => {
    appConfigResult = { data: null, error: null };

    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        weather: { tempC: 30, tempMorning: 25, tempMidday: 32, tempEvening: 28, description: "hot" },
      }),
    });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.weather.tempC).toBe(30);
    // fetch should NOT have been called for weather
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("falls back to default weather on fetch failure", async () => {
    appConfigResult = { data: null, error: null };
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    // Default fallback weather
    expect(body.weather.tempC).toBe(15);
  });

  it("returns 500 when AI response is not valid JSON", async () => {
    appConfigResult = { data: null, error: null };
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        current_weather: { temperature: 20, weathercode: 1 },
        hourly: { time: [], temperature_2m: [] },
      }),
    });

    const { callClaude } = await import("../netlify/functions/_claudeClient.js");
    callClaude.mockResolvedValueOnce({
      content: [{ text: "Sorry, I can't help with that." }],
    });

    vi.resetModules();
    // Re-import to pick up the new mock
    const mod = await import("../netlify/functions/daily-pick.js");
    const result = await mod.handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain("parse");
  });

  it("returns 500 when Supabase credentials missing", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "");
    vi.resetModules();
    const mod = await import("../netlify/functions/daily-pick.js");
    const result = await mod.handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain("Supabase");
  });

  it("caches new pick in app_config after generation", async () => {
    appConfigResult = { data: null, error: null };
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        current_weather: { temperature: 20, weathercode: 0 },
        hourly: { time: [], temperature_2m: [] },
      }),
    });

    await handler({ httpMethod: "GET" });
    expect(upsertCalls.length).toBeGreaterThanOrEqual(1);
    const [upsertArg] = upsertCalls[0];
    expect(upsertArg.key).toBe("daily_pick");
    expect(upsertArg.value.generatedAt).toBeDefined();
  });

  it("handles empty garment list gracefully", async () => {
    appConfigResult = { data: null, error: null };
    garmentsResult = { data: [], error: null };
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        current_weather: { temperature: 20, weathercode: 0 },
        hourly: { time: [], temperature_2m: [] },
      }),
    });

    const result = await handler({ httpMethod: "GET" });
    // Should still succeed — AI handles empty wardrobe
    expect(result.statusCode).toBe(200);
  });

  it("handles null history data gracefully", async () => {
    appConfigResult = { data: null, error: null };
    historyResult = { data: null, error: null };
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        current_weather: { temperature: 20, weathercode: 0 },
        hourly: { time: [], temperature_2m: [] },
      }),
    });

    const result = await handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(200);
  });

  it("CORS headers present on all responses", async () => {
    const options = await handler({ httpMethod: "OPTIONS" });
    expect(options.headers["Access-Control-Allow-Origin"]).toBe("*");

    vi.stubEnv("CLAUDE_API_KEY", "");
    vi.resetModules();
    const mod = await import("../netlify/functions/daily-pick.js");
    const error = await mod.handler({ httpMethod: "GET" });
    expect(error.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("strips markdown code fences from AI response", async () => {
    appConfigResult = { data: null, error: null };
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        current_weather: { temperature: 20, weathercode: 0 },
        hourly: { time: [], temperature_2m: [] },
      }),
    });

    const { callClaude } = await import("../netlify/functions/_claudeClient.js");
    callClaude.mockResolvedValueOnce({
      content: [{ text: "```json\n" + JSON.stringify({ watch: "Pasha 41", score: 7.5 }) + "\n```" }],
    });

    vi.resetModules();
    const mod = await import("../netlify/functions/daily-pick.js");
    const result = await mod.handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.watch).toBe("Pasha 41");
  });
});

// ── Weather parsing ──────────────────────────────────────────────────────────

describe("daily-pick weather aggregation", () => {
  let handler;

  beforeEach(async () => {
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    appConfigResult = { data: null, error: null };
    garmentsResult = { data: [{ id: "g1", name: "Test Shirt", type: "shirt", category: "shirt", color: "white", formality: 5 }], error: null };
    historyResult = { data: [], error: null };
    vi.resetModules();
    const mod = await import("../netlify/functions/daily-pick.js");
    handler = mod.handler;
  });

  it("aggregates morning/midday/evening temps from hourly data", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const hourlyTime = [];
    const hourlyTemp = [];
    for (let h = 0; h < 24; h++) {
      hourlyTime.push(`${today}T${String(h).padStart(2, "0")}:00`);
      hourlyTemp.push(h + 5); // 5°C at midnight, 29°C at midnight next
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        current_weather: { temperature: 20, weathercode: 2 },
        hourly: { time: hourlyTime, temperature_2m: hourlyTemp },
      }),
    });

    const result = await handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    // Morning hours 7,8,9,10 → temps 12,13,14,15 → avg 13.5 → rounded 14
    expect(body.weather.tempMorning).toBe(14);
    // Midday hours 11,12,13,14 → temps 16,17,18,19 → avg 17.5 → rounded 18
    expect(body.weather.tempMidday).toBe(18);
    // Evening hours 17,18,19,20 → temps 22,23,24,25 → avg 23.5 → rounded 24
    expect(body.weather.tempEvening).toBe(24);
  });

  it("describes weathercode > 3 as overcast/rain", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        current_weather: { temperature: 12, weathercode: 61 },
        hourly: { time: [], temperature_2m: [] },
      }),
    });

    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    expect(body.weather.description).toBe("overcast/rain");
  });

  it("describes weathercode <= 3 as clear/partly cloudy", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        current_weather: { temperature: 25, weathercode: 1 },
        hourly: { time: [], temperature_2m: [] },
      }),
    });

    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    expect(body.weather.description).toBe("clear/partly cloudy");
  });
});
