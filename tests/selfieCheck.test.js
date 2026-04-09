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

describe("selfie-check handler", () => {
  let handler;
  let blobCache;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    blobCache = await import("../netlify/functions/_blobCache.js");
    blobCache.cacheGet.mockResolvedValue(null);
    blobCache.cacheSet.mockResolvedValue(undefined);
    const mod = await import("../netlify/functions/selfie-check.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const res = await handler({ httpMethod: "OPTIONS" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 405 for GET", async () => {
    const res = await handler({ httpMethod: "GET" });
    expect(res.statusCode).toBe(405);
  });

  it("returns 400 when image is missing", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ watches: [], garments: [] }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("image");
  });

  it("returns 500 when CLAUDE_API_KEY is missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc" }),
    });
    expect(res.statusCode).toBe(500);
  });

  it("returns selfie analysis on success", async () => {
    const mockResult = {
      impact: 8, impact_why: "Sharp combination",
      vision: "Navy suit with brown derby shoes creates a classic look.",
      color_story: "Cool navy balanced by warm brown",
      works: "Color coordination", risk: null,
      upgrade: "Add a pocket square",
      watch_confidence: 7, items_detected: [{ type: "shirt", color: "white" }],
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
        image: "data:image/jpeg;base64,abc123",
        watches: [], garments: [], context: "clinic",
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.impact).toBe(8);
    expect(body.vision).toContain("Navy");
    expect(body.items_detected).toHaveLength(1);
  });

  it("accepts images array (multiple selfie angles)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: JSON.stringify({ impact: 7, vision: "test", items_detected: [] }) }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        images: ["data:image/jpeg;base64,abc", "data:image/jpeg;base64,def"],
        watches: [], garments: [],
      }),
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns cache HIT on repeated image", async () => {
    blobCache.cacheGet.mockResolvedValue({ impact: 6, vision: "cached result" });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        image: "data:image/jpeg;base64,abc123",
        watches: [], garments: [], context: "casual",
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body._cached).toBe(true);
  });

  it("uses maxAttempts: 1 for Vision — no retry on 529", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 529,
      text: () => Promise.resolve("overloaded"),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        image: "data:image/jpeg;base64,abc123",
        watches: [], garments: [],
      }),
    });
    // 502 for Claude API errors, not 500
    expect(res.statusCode).toBe(502);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("includes CORS headers on all paths", async () => {
    const r405 = await handler({ httpMethod: "GET" });
    expect(r405.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");

    const r400 = await handler({ httpMethod: "POST", body: JSON.stringify({}) });
    expect(r400.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });
});
