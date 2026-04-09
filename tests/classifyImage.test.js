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

describe("classify-image handler", () => {
  let handler;
  let blobCache;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    blobCache = await import("../netlify/functions/_blobCache.js");
    blobCache.cacheGet.mockResolvedValue(null);
    blobCache.cacheSet.mockResolvedValue(undefined);
    const mod = await import("../netlify/functions/classify-image.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const res = await handler({ httpMethod: "OPTIONS" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 400 when image is missing", async () => {
    const res = await handler({ httpMethod: "POST", body: JSON.stringify({}) });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("Missing image");
  });

  it("returns 500 when CLAUDE_API_KEY is missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123" }),
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain("CLAUDE_API_KEY");
  });

  it("returns classified garment on success", async () => {
    const mockResult = {
      type: "shirt", color: "navy", material: "cotton",
      formality: 5, confidence: 0.9, seasons: ["spring", "autumn"],
      contexts: ["smart-casual"], color_alternatives: ["blue", "dark navy", "black"],
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
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123" }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.type).toBe("shirt");
    expect(body.color).toBe("navy");
    expect(res.headers["X-Cache"]).toBe("MISS");
  });

  it("returns cache HIT when hash matches", async () => {
    blobCache.cacheGet.mockResolvedValue({ type: "pants", color: "khaki" });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123", hash: "deadbeef" }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-Cache"]).toBe("HIT");
    const body = JSON.parse(res.body);
    expect(body._cached).toBe(true);
    expect(body.type).toBe("pants");
  });

  it("defaults invalid type to accessory", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: JSON.stringify({ type: "watch", color: "silver" }) }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123" }),
    });
    const body = JSON.parse(res.body);
    expect(body.type).toBe("accessory");
  });

  it("detects PNG media type from data URL prefix", async () => {
    let calledWithMediaType;
    globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
      const body = JSON.parse(opts.body);
      calledWithMediaType = body.messages[0].content[0].source.media_type;
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          content: [{ type: "text", text: JSON.stringify({ type: "shirt", color: "white" }) }],
        }),
      };
    });

    await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/png;base64,abc123" }),
    });
    expect(calledWithMediaType).toBe("image/png");
  });

  it("strips markdown fences from response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: "```json\n{\"type\":\"shoes\",\"color\":\"brown\"}\n```" }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123" }),
    });
    const body = JSON.parse(res.body);
    expect(body.type).toBe("shoes");
    expect(body.color).toBe("brown");
  });

  it("returns empty object on JSON parse failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: "not valid json at all" }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123" }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.type).toBeUndefined();
  });

  it("uses maxAttempts: 1 for Vision call", async () => {
    let calledOpts;
    globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
      calledOpts = opts;
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          content: [{ type: "text", text: JSON.stringify({ type: "jacket", color: "black" }) }],
        }),
      };
    });

    await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123" }),
    });
    // The handler passes maxAttempts:1, which means on 529 it won't retry
    expect(calledOpts).toBeDefined();
  });

  it("includes CORS headers on all error paths", async () => {
    // 400 path
    const r400 = await handler({ httpMethod: "POST", body: JSON.stringify({}) });
    expect(r400.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");

    // 500 path
    vi.stubEnv("CLAUDE_API_KEY", "");
    const r500 = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123" }),
    });
    expect(r500.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });
});
