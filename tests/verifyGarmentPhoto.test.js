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

describe("verify-garment-photo handler", () => {
  let handler;
  let blobCache;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    blobCache = await import("../netlify/functions/_blobCache.js");
    blobCache.cacheGet.mockResolvedValue(null);
    blobCache.cacheSet.mockResolvedValue(undefined);
    const mod = await import("../netlify/functions/verify-garment-photo.js");
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
      body: JSON.stringify({ currentType: "shirt", currentColor: "navy" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 500 when CLAUDE_API_KEY is missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageBase64: "abc123", currentType: "shirt" }),
    });
    expect(res.statusCode).toBe(500);
  });

  it("returns verification result with ok:true when correct", async () => {
    const mockResult = {
      ok: true, correctedType: "shirt", correctedColor: "navy",
      color_alternatives: ["dark blue", "indigo", "blue"],
      material: "cotton", pattern: "solid", formality: 5,
      correctedName: "Navy Cotton Oxford", confidence: 0.92, reason: "Matches",
      isOutfitPhoto: false, isAngleShot: false, isDuplicate: false,
      seasons: ["spring", "autumn"], contexts: ["smart-casual", "clinic"],
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
        imageBase64: "abc123",
        currentType: "shirt",
        currentColor: "navy",
        garmentId: "g1",
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.garmentId).toBe("g1");
    expect(body.correctedType).toBe("shirt");
  });

  it("returns ok:false when type is wrong", async () => {
    const mockResult = {
      ok: false, correctedType: "sweater", correctedColor: "navy",
      confidence: 0.88, reason: "This is a knit sweater not a shirt",
      isOutfitPhoto: false,
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
        imageBase64: "abc123",
        currentType: "shirt",
        currentColor: "navy",
        garmentId: "g2",
      }),
    });
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.correctedType).toBe("sweater");
    expect(body.garmentId).toBe("g2");
  });

  it("detects outfit photos", async () => {
    const mockResult = {
      ok: false, isOutfitPhoto: true,
      detectedGarments: [
        { type: "shirt", color: "white" },
        { type: "pants", color: "navy" },
      ],
      confidence: 0.85, reason: "Multiple garments visible",
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
        imageBase64: "abc123",
        currentType: "shirt",
        garmentId: "g3",
      }),
    });
    const body = JSON.parse(res.body);
    expect(body.isOutfitPhoto).toBe(true);
    expect(body.detectedGarments).toHaveLength(2);
  });

  it("returns cache HIT when hash matches", async () => {
    blobCache.cacheGet.mockResolvedValue({ ok: true, correctedType: "pants" });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        imageBase64: "abc123",
        currentType: "pants",
        garmentId: "g4",
        hash: "deadbeef",
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-Cache"]).toBe("HIT");
    // garmentId should come from request, not cache
    const body = JSON.parse(res.body);
    expect(body.garmentId).toBe("g4");
  });

  it("rejects localhost image URLs", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        imageUrl: "https://localhost/img.jpg",
        currentType: "shirt",
        garmentId: "g5",
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects 169.254.x.x link-local URLs", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        imageUrl: "https://169.254.1.1/img.jpg",
        currentType: "shirt",
        garmentId: "g5",
      }),
    });
    expect(res.statusCode).toBe(400);
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
        imageBase64: "abc123",
        currentType: "shirt",
        garmentId: "g6",
      }),
    });
    // 502 for Claude API errors
    expect(res.statusCode).toBe(502);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("includes CORS headers on all error paths", async () => {
    const r405 = await handler({ httpMethod: "GET" });
    expect(r405.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");

    const r400 = await handler({
      httpMethod: "POST",
      body: JSON.stringify({}),
    });
    expect(r400.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });
});
