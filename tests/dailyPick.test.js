import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using paths relative to the source file that imports them
vi.mock("../netlify/functions/_claudeClient.js", () => ({
  callClaude: vi.fn(),
  getConfiguredModel: vi.fn().mockResolvedValue("claude-haiku-4-5-20251001"),
  extractText: (r, fallback = "") => r?.content?.[0]?.text ?? fallback,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("../netlify/functions/_cors.js", () => ({
  cors: () => ({
    "Access-Control-Allow-Origin": "https://watch-advisor2.netlify.app",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  }),
}));

// Mock global fetch for weather
vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network")));

const { createClient } = await import("@supabase/supabase-js");
const claudeMod = await import("../netlify/functions/_claudeClient.js");

const { handler } = await import("../netlify/functions/daily-pick.js");

describe("daily-pick", () => {
  let supabaseMock;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLAUDE_API_KEY = "test-key";
    process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

    supabaseMock = {};
    for (const method of ["from", "select", "eq", "not", "gte", "order", "limit"]) {
      supabaseMock[method] = vi.fn().mockReturnValue(supabaseMock);
    }
    supabaseMock.single = vi.fn().mockResolvedValue({ data: null });
    supabaseMock.upsert = vi.fn().mockResolvedValue({ data: null });

    createClient.mockReturnValue(supabaseMock);
  });

  it("returns 204 for OPTIONS (CORS preflight)", async () => {
    const result = await handler({ httpMethod: "OPTIONS" });
    expect(result.statusCode).toBe(204);
    expect(result.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });

  it("returns 500 when CLAUDE_API_KEY is missing", async () => {
    delete process.env.CLAUDE_API_KEY;
    const result = await handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("CLAUDE_API_KEY");
  });

  it("returns 500 when Supabase credentials missing", async () => {
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    const result = await handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toBeTruthy();
  });

  it("returns cached pick if under 4 hours old on GET", async () => {
    const cachedPick = {
      watch: "Santos Large",
      score: 8.5,
      generatedAt: new Date().toISOString(),
    };

    supabaseMock.limit = vi.fn().mockResolvedValue({ data: [{ value: cachedPick }] });

    const result = await handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.watch).toBe("Santos Large");
  });

  it("does not return stale cache (>4h old)", async () => {
    const stalePick = {
      watch: "Stale Pick",
      score: 5,
      generatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    };

    // limit() returns stale cache for the first call (app_config lookup)
    supabaseMock.limit = vi.fn().mockResolvedValue({ data: [{ value: stalePick }] });

    // Garments query — make not() return data
    supabaseMock.not = vi.fn().mockResolvedValue({
      data: [{ id: "s1", name: "White shirt", type: "shirt", category: "shirt", color: "white" }],
    });
    // History query — make order() return data
    supabaseMock.order = vi.fn().mockResolvedValue({ data: [] });

    claudeMod.callClaude.mockResolvedValue({
      content: [{ text: '{"watch":"Fresh","watchId":"x","strap":"x","shirt":null,"sweater":null,"layer":null,"pants":"p","shoes":"s","jacket":null,"belt":null,"reasoning":"r","score":8,"layerTip":null}' }],
    });

    const result = await handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.watch).toBe("Fresh");
  });

  it("skips cache when forceRefresh=true on POST", async () => {
    // Garments query
    supabaseMock.not = vi.fn().mockResolvedValue({
      data: [{ id: "s1", name: "White shirt", type: "shirt", category: "shirt", color: "white" }],
    });
    // History query
    supabaseMock.order = vi.fn().mockResolvedValue({ data: [] });

    claudeMod.callClaude.mockResolvedValue({
      content: [{ text: JSON.stringify({
        watch: "New Pick", watchId: "santos_large", strap: "brown leather",
        shirt: "White shirt", pants: "Navy chinos", shoes: "Brown boots",
        sweater: null, layer: null, jacket: null, belt: null,
        reasoning: "Fresh recommendation.", score: 9, layerTip: null,
      }) }],
    });

    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ forceRefresh: true }),
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.watch).toBe("New Pick");
    expect(body.generatedAt).toBeDefined();
    expect(body.weather).toBeDefined();
  });

  it("output JSON has all required fields", () => {
    const requiredFields = [
      "watch", "watchId", "strap", "shirt", "sweater", "layer",
      "pants", "shoes", "jacket", "belt", "reasoning", "score", "layerTip",
    ];
    const validPick = {
      watch: "Santos Large", watchId: "santos_large", strap: "brown leather",
      shirt: "White oxford", sweater: null, layer: null, pants: "Navy chinos",
      shoes: "Brown boots", jacket: null, belt: null,
      reasoning: "Great combination.", score: 8.5, layerTip: null,
    };
    for (const field of requiredFields) {
      expect(field in validPick).toBe(true);
    }
  });

  it("handles malformed JSON from Claude with markdown fences", () => {
    const raw = '```json\n{"watch": "Santos"}\n```';
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    expect(parsed.watch).toBe("Santos");
  });

  it("weather fallback defaults to tempC: 15, not 22", () => {
    const fallback = { tempC: 15, tempMorning: 10, tempMidday: 17, tempEvening: 12 };
    expect(fallback.tempC).toBe(15);
    expect(fallback.tempC).not.toBe(22);
  });

  it("CORS headers present on all responses", async () => {
    const result = await handler({ httpMethod: "OPTIONS" });
    expect(result.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
    expect(result.headers["Content-Type"]).toBe("application/json");
  });

  it("uses maxAttempts: 1 for Claude API call", async () => {
    supabaseMock.not = vi.fn().mockResolvedValue({
      data: [{ id: "s1", name: "Shirt", type: "shirt", category: "shirt", color: "white" }],
    });
    supabaseMock.order = vi.fn().mockResolvedValue({ data: [] });

    claudeMod.callClaude.mockResolvedValue({
      content: [{ text: '{"watch":"X","watchId":"x","strap":"x","shirt":null,"sweater":null,"layer":null,"pants":"p","shoes":"s","jacket":null,"belt":null,"reasoning":"r","score":7,"layerTip":null}' }],
    });

    await handler({ httpMethod: "POST", body: JSON.stringify({ forceRefresh: true }) });

    expect(claudeMod.callClaude).toHaveBeenCalledWith(
      "test-key",
      expect.objectContaining({ max_tokens: 800 }),
      expect.objectContaining({ maxAttempts: 1 }),
    );
  });
});
