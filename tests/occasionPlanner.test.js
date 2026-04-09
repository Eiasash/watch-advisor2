import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../netlify/functions/_cors.js", () => ({
  cors: () => ({
    "Access-Control-Allow-Origin": "https://watch-advisor2.netlify.app",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  }),
}));

vi.mock("../netlify/functions/_blobCache.js", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  hashText: vi.fn((t) => "hash_" + t.length),
}));

describe("occasion-planner handler", () => {
  let handler;
  let blobCache;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    blobCache = await import("../netlify/functions/_blobCache.js");
    blobCache.cacheGet.mockResolvedValue(null);
    blobCache.cacheSet.mockResolvedValue(undefined);
    const mod = await import("../netlify/functions/occasion-planner.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const res = await handler({ httpMethod: "OPTIONS" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 400 when occasion is missing", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garments: [], watches: [] }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("occasion");
  });

  it("returns 500 when CLAUDE_API_KEY is missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ occasion: "wedding", garments: [], watches: [] }),
    });
    expect(res.statusCode).toBe(500);
  });

  it("returns outfit suggestions for an occasion", async () => {
    const mockResult = {
      occasion_tips: "Dress formally",
      outfits: [{
        name: "Classic Wedding", top: "White Dress Shirt",
        bottom: "Navy Trousers", shoes: "Brown Derby",
        watch: "Cartier Santos", why: "Elegant pairing", confidence: 0.9,
      }],
      avoid: "Casual sneakers",
      power_move: "Add a silk pocket square",
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: JSON.stringify(mockResult) }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        occasion: "wedding",
        garments: [{ name: "White Shirt", type: "shirt", color: "white" }],
        watches: [{ brand: "Cartier", model: "Santos" }],
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.outfits).toHaveLength(1);
    expect(body.occasion_tips).toContain("formal");
    expect(body.power_move).toBeDefined();
  });

  it("returns cache HIT for repeated occasions", async () => {
    blobCache.cacheGet.mockResolvedValue({
      occasion_tips: "cached", outfits: [], avoid: "", power_move: "",
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        occasion: "wedding",
        garments: [{ name: "Test", type: "shirt" }],
        watches: [],
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-Cache"]).toBe("HIT");
    const body = JSON.parse(res.body);
    expect(body.occasion_tips).toBe("cached");
  });

  it("includes CORS headers on all paths", async () => {
    const r400 = await handler({
      httpMethod: "POST",
      body: JSON.stringify({}),
    });
    expect(r400.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });
});
