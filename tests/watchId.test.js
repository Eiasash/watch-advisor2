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

describe("watch-id handler", () => {
  let handler;
  let blobCache;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    // Re-acquire mock references after resetModules
    blobCache = await import("../netlify/functions/_blobCache.js");
    blobCache.cacheGet.mockResolvedValue(null);
    blobCache.cacheSet.mockResolvedValue(undefined);
    const mod = await import("../netlify/functions/watch-id.js");
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
      body: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("image required");
  });

  it("returns 500 when CLAUDE_API_KEY is missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc" }),
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain("CLAUDE_API_KEY");
  });

  it("identifies a watch from base64 image", async () => {
    const mockResult = {
      brand: "Omega", model: "Speedmaster", reference: "3861",
      dial_color: "Black", confidence: 9, emoji: "🌙",
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
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123def456" }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.brand).toBe("Omega");
    expect(body.model).toBe("Speedmaster");
    expect(res.headers["X-Cache"]).toBe("MISS");
  });

  it("returns cache HIT on repeated image", async () => {
    blobCache.cacheGet.mockResolvedValue({ brand: "Cartier", model: "Santos" });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123def456" }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-Cache"]).toBe("HIT");
    expect(JSON.parse(res.body).brand).toBe("Cartier");
  });

  it("includes collection context in prompt when provided", async () => {
    let calledBody;
    globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
      calledBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          content: [{ type: "text", text: JSON.stringify({ brand: "Tudor", model: "Black Bay" }) }],
        }),
      };
    });

    await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        image: "data:image/jpeg;base64,abc123def456",
        collection: [
          { brand: "Tudor", model: "Black Bay", dial: "Black" },
          { brand: "Omega", model: "Speedmaster", ref: "3861", dial: "Black" },
        ],
      }),
    });

    const promptText = calledBody.messages[0].content[1].text;
    expect(promptText).toContain("Tudor Black Bay");
    expect(promptText).toContain("Omega Speedmaster");
    expect(promptText).toContain("Ref: 3861");
  });

  it("repairs truncated JSON response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: '{"brand":"Rolex","model":"Submariner","complications":["date"' }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123def456" }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.brand).toBe("Rolex");
    expect(body._repaired).toBe(true);
  });

  it("returns fallback on complete JSON failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: "I cannot identify this watch clearly" }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123def456" }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.brand).toBeNull();
    expect(body.confidence).toBe(0);
    expect(body._repaired).toBe(true);
  });

  it("validates https URL for remote images", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "http://example.com/watch.jpg" }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("https");
  });

  it("rejects localhost URLs", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "https://localhost/watch.jpg" }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("Disallowed");
  });

  it("rejects 169.254.x.x link-local URLs", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "https://169.254.1.1/watch.jpg" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid URL strings", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "not-a-url-and-not-data-uri" }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("Invalid image URL");
  });

  it("strips markdown fences from response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: '```json\n{"brand":"IWC","model":"Portugieser","confidence":8}\n```' }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123def456" }),
    });
    const body = JSON.parse(res.body);
    expect(body.brand).toBe("IWC");
  });
});
