import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock _blobCache for functions that import it
vi.mock("../netlify/functions/_blobCache.js", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  hashText: vi.fn(s => "abcd1234"),
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

// ─── claude-stylist ─────────────────────────────────────────────────────────

describe("claude-stylist handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    const mod = await import("../netlify/functions/claude-stylist.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS", async () => {
    const result = await handler({ httpMethod: "OPTIONS" });
    expect(result.statusCode).toBe(204);
  });

  it("returns 405 for GET", async () => {
    const result = await handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(405);
  });

  it("returns 500 when API key missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garments: [], watch: { brand: "JLC" } }),
    });
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain("CLAUDE_API_KEY");
  });

  it("returns parsed JSON on valid response", async () => {
    const outfitJSON = '{"shirt":"Navy polo","pants":"Grey chinos","shoes":"Brown loafers","jacket":null,"strapShoeOk":true,"explanation":"Great match"}';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: outfitJSON }] }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        garments: [{ name: "Navy polo", type: "shirt", color: "navy", formality: 6 }],
        watch: { brand: "JLC", model: "Reverso", dial: "silver-white", formality: 9, strap: "brown leather" },
        engineOutfit: {},
      }),
    });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).strapShoeOk).toBe(true);
  });

  it("returns fallback when no JSON in response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: "I cannot parse this." }] }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garments: [], watch: {} }),
    });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.shirt).toBeNull();
    expect(body.explanation).toContain("cannot parse");
  });

  it("returns 502 on Claude API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 429,
      text: () => Promise.resolve("rate limited"),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garments: [], watch: { brand: "JLC" } }),
    });
    expect(result.statusCode).toBe(502);
  });

  it("returns 500 on fetch error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network"));
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garments: [], watch: {} }),
    });
    expect(result.statusCode).toBe(500);
  });

  it("filters out accessory/belt types from garment list", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: '{"shirt":null,"pants":null,"shoes":null,"jacket":null,"strapShoeOk":true,"explanation":"ok"}' }] }),
    });
    await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        garments: [
          { name: "Belt", type: "belt", color: "black" },
          { name: "Sunglasses", type: "sunglasses", color: "black" },
          { name: "Navy polo", type: "shirt", color: "navy", formality: 6 },
        ],
        watch: { brand: "JLC", model: "R", strap: "bracelet" },
      }),
    });
    // Belt and sunglasses should be filtered out from the prompt
    const callBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    const prompt = callBody.messages[0].content;
    expect(prompt).not.toContain("Belt");
    expect(prompt).toContain("Navy polo");
  });
});

// ─── detect-duplicate ───────────────────────────────────────────────────────

describe("detect-duplicate handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    const mod = await import("../netlify/functions/detect-duplicate.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS", async () => {
    expect((await handler({ httpMethod: "OPTIONS" })).statusCode).toBe(204);
  });

  it("returns 405 for non-POST", async () => {
    expect((await handler({ httpMethod: "GET" })).statusCode).toBe(405);
  });

  it("returns 400 when images missing", async () => {
    const result = await handler({ httpMethod: "POST", body: JSON.stringify({ imageA: "a" }) });
    expect(result.statusCode).toBe(400);
  });

  it("returns 500 when API key missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageA: "a", imageB: "b" }),
    });
    expect(result.statusCode).toBe(500);
  });

  it("returns parsed duplicate result", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: '{"isDuplicate":true,"confidence":"high","reason":"Same shoes"}' }],
      }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageA: "a", imageB: "b" }),
    });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).isDuplicate).toBe(true);
  });

  it("returns fallback when AI response is not JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: "unparseable" }] }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageA: "a", imageB: "b" }),
    });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).isDuplicate).toBe(false);
    expect(JSON.parse(result.body).confidence).toBe("low");
  });
});

// ─── relabel-garment ────────────────────────────────────────────────────────

describe("relabel-garment handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    const mod = await import("../netlify/functions/relabel-garment.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS", async () => {
    expect((await handler({ httpMethod: "OPTIONS" })).statusCode).toBe(204);
  });

  it("returns 400 when image or current missing", async () => {
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc" }),
    });
    expect(result.statusCode).toBe(400);
  });

  it("returns 500 when API key missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc", current: { type: "shirt" } }),
    });
    expect(result.statusCode).toBe(500);
  });

  it("returns 400 for non-data non-http image", async () => {
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "blob:invalid", current: { type: "shirt" } }),
    });
    expect(result.statusCode).toBe(400);
  });

  it("returns parsed relabel result on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: '{"confirmed":true,"confidence":0.95,"reason":"Looks correct","corrections":{"type":null,"color":null,"name":null,"formality":null}}' }],
      }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        image: "data:image/jpeg;base64,abc123",
        current: { type: "shirt", color: "navy", name: "Navy polo" },
      }),
    });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).confirmed).toBe(true);
  });

  it("returns 502 on Claude API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("rate limited"),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        image: "data:image/jpeg;base64,abc123",
        current: { type: "shirt", color: "navy", name: "Navy polo" },
      }),
    });
    expect(result.statusCode).toBe(502);
  });

  it("handles multiple angles", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: '{"confirmed":true,"confidence":0.92,"reason":"Consistent across angles","corrections":{"type":null,"color":null,"name":null,"formality":null}}' }],
      }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        image: "data:image/jpeg;base64,mainPhoto",
        current: { type: "shirt", color: "navy", name: "Navy polo" },
        allAngles: [
          "data:image/jpeg;base64,angle1",
          "data:image/jpeg;base64,angle2",
        ],
      }),
    });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).confirmed).toBe(true);
  });
});

// ─── occasion-planner ───────────────────────────────────────────────────────

describe("occasion-planner handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    const { cacheGet } = await import("../netlify/functions/_blobCache.js");
    cacheGet.mockResolvedValue(null);
    const mod = await import("../netlify/functions/occasion-planner.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS", async () => {
    expect((await handler({ httpMethod: "OPTIONS" })).statusCode).toBe(204);
  });

  it("returns 405 for GET", async () => {
    expect((await handler({ httpMethod: "GET" })).statusCode).toBe(405);
  });

  it("returns 400 for empty occasion", async () => {
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ occasion: "" }),
    });
    expect(result.statusCode).toBe(400);
  });

  it("returns 500 when API key missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ occasion: "wedding" }),
    });
    expect(result.statusCode).toBe(500);
  });

  it("returns outfit recommendations on success", async () => {
    const response = { occasion_tips: "Dress smart", outfits: [], avoid: "Jeans", power_move: "Pocket square" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: JSON.stringify(response) }] }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ occasion: "wedding", garments: [], watches: [] }),
    });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).occasion_tips).toBe("Dress smart");
  });

  it("returns 500 on API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("server error"),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ occasion: "wedding", garments: [], watches: [] }),
    });
    expect(result.statusCode).toBe(500);
  });

  it("returns cache hit when available", async () => {
    const { cacheGet } = await import("../netlify/functions/_blobCache.js");
    cacheGet.mockResolvedValue({ occasion_tips: "Cached tips", outfits: [], avoid: "Jeans", power_move: "Pocket square" });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ occasion: "wedding", garments: [], watches: [] }),
    });
    expect(result.statusCode).toBe(200);
    const headers = result.headers;
    expect(headers["X-Cache"]).toBe("HIT");
    const body = JSON.parse(result.body);
    expect(body.occasion_tips).toBe("Cached tips");
  });
});


// ─── watch-id ───────────────────────────────────────────────────────────────

describe("watch-id handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    const { cacheGet } = await import("../netlify/functions/_blobCache.js");
    cacheGet.mockResolvedValue(null);
    const mod = await import("../netlify/functions/watch-id.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS", async () => {
    expect((await handler({ httpMethod: "OPTIONS" })).statusCode).toBe(204);
  });

  it("returns 400 when image missing", async () => {
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({}),
    });
    expect(result.statusCode).toBe(400);
  });

  it("returns 500 when API key missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc" }),
    });
    expect(result.statusCode).toBe(500);
  });

  it("returns watch identification on success", async () => {
    const response = { brand: "Rolex", model: "Submariner", confidence: 9 };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: JSON.stringify(response) }] }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc" }),
    });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).brand).toBe("Rolex");
  });

  it("returns 500 on API error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network failure"));
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc" }),
    });
    expect(result.statusCode).toBe(500);
  });

  it("returns cache hit when available", async () => {
    const { cacheGet } = await import("../netlify/functions/_blobCache.js");
    cacheGet.mockResolvedValue({ brand: "Omega", model: "Speedmaster", confidence: 9 });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc" }),
    });
    expect(result.statusCode).toBe(200);
    const headers = result.headers;
    expect(headers["X-Cache"]).toBe("HIT");
    const body = JSON.parse(result.body);
    expect(body.brand).toBe("Omega");
  });
});

// ─── selfie-check ───────────────────────────────────────────────────────────

describe("selfie-check handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    const { cacheGet } = await import("../netlify/functions/_blobCache.js");
    cacheGet.mockResolvedValue(null);
    const mod = await import("../netlify/functions/selfie-check.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS", async () => {
    expect((await handler({ httpMethod: "OPTIONS" })).statusCode).toBe(204);
  });

  it("returns 400 when image missing", async () => {
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({}),
    });
    expect(result.statusCode).toBe(400);
  });

  it("returns 500 when API key missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc" }),
    });
    expect(result.statusCode).toBe(500);
  });

  it("returns outfit analysis on success", async () => {
    const response = { impact: 8, vision: "Sharp look", works: "Color coordination" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: JSON.stringify(response) }] }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc", watches: [] }),
    });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).impact).toBe(8);
  });

  it("returns 502 on API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("rate limited"),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc", watches: [] }),
    });
    expect(result.statusCode).toBe(502);
  });

  it("returns cache hit when available", async () => {
    const { cacheGet } = await import("../netlify/functions/_blobCache.js");
    cacheGet.mockResolvedValue({ impact: 9, vision: "Cached vision", works: "Great" });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc", watches: [] }),
    });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body._cached).toBe(true);
    expect(body.impact).toBe(9);
  });
});

// ─── verify-garment-photo ───────────────────────────────────────────────────

describe("verify-garment-photo handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    const { cacheGet } = await import("../netlify/functions/_blobCache.js");
    cacheGet.mockResolvedValue(null);
    const mod = await import("../netlify/functions/verify-garment-photo.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS", async () => {
    expect((await handler({ httpMethod: "OPTIONS" })).statusCode).toBe(204);
  });

  it("returns 405 for non-POST", async () => {
    expect((await handler({ httpMethod: "GET" })).statusCode).toBe(405);
  });

  it("returns 400 when no image provided", async () => {
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ currentType: "shirt" }),
    });
    expect(result.statusCode).toBe(400);
  });

  it("returns 500 when API key missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageBase64: "data:image/jpeg;base64,abc" }),
    });
    expect(result.statusCode).toBe(500);
  });

  it("returns verification result on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: '{"ok":true,"correctedType":"shirt","correctedColor":"navy","correctedName":"Navy polo","confidence":0.9,"reason":"Correct"}' }],
      }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        imageBase64: "data:image/jpeg;base64,abc",
        currentType: "shirt",
        currentColor: "navy",
        garmentId: "g1",
      }),
    });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.ok).toBe(true);
    expect(body.garmentId).toBe("g1");
  });

  it("returns 502 on API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("rate limited"),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageBase64: "data:image/jpeg;base64,abc" }),
    });
    expect(result.statusCode).toBe(502);
  });

  it("returns cache hit when hash matches", async () => {
    const { cacheGet } = await import("../netlify/functions/_blobCache.js");
    cacheGet.mockResolvedValue({ ok: true, correctedType: "shirt", confidence: 0.99 });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageBase64: "data:image/jpeg;base64,abc", hash: "deadbeef", garmentId: "g2" }),
    });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body._cached).toBe(true);
    expect(body.garmentId).toBe("g2");
  });
});

// ─── generate-embedding ────────────────────────────────────────────────────

describe("generate-embedding handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const { cacheGet } = await import("../netlify/functions/_blobCache.js");
    cacheGet.mockResolvedValue(null);
    const mod = await import("../netlify/functions/generate-embedding.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS", async () => {
    expect((await handler({ httpMethod: "OPTIONS" })).statusCode).toBe(204);
  });

  it("returns 405 for non-POST", async () => {
    expect((await handler({ httpMethod: "GET" })).statusCode).toBe(405);
  });

  it("returns 400 for empty text", async () => {
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ text: "" }),
    });
    expect(result.statusCode).toBe(400);
  });

  it("returns 503 when API key missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ text: "navy polo shirt" }),
    });
    expect(result.statusCode).toBe(503);
  });

  it("returns embedding on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garmentId: "g1", text: "navy polo shirt" }),
    });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.garmentId).toBe("g1");
    expect(body.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it("returns 502 on OpenAI error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("quota exceeded"),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ text: "test" }),
    });
    expect(result.statusCode).toBe(502);
  });
});
