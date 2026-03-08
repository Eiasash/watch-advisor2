import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../netlify/functions/_blobCache.js", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  hashText: vi.fn(s => "abcd1234"),
}));

describe("extract-outfit handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    const mod = await import("../netlify/functions/extract-outfit.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS", async () => {
    const r = await handler({ httpMethod: "OPTIONS" });
    expect(r.statusCode).toBe(204);
  });

  it("returns 405 for GET", async () => {
    const r = await handler({ httpMethod: "GET" });
    expect(r.statusCode).toBe(405);
  });

  it("returns 500 when API key missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "base64data", garments: [] }),
    });
    expect(r.statusCode).toBe(500);
    expect(JSON.parse(r.body).error).toContain("CLAUDE_API_KEY");
  });

  it("returns 400 when image missing", async () => {
    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garments: [] }),
    });
    expect(r.statusCode).toBe(400);
  });

  it("returns matches when Claude responds with detected garments", async () => {
    const detected = [
      { type: "shirt", color: "navy", confidence: 9 },
      { type: "pants", color: "khaki", confidence: 8 },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: JSON.stringify(detected) }] }),
    });
    const garments = [
      { id: "g1", type: "shirt", color: "navy", name: "Navy shirt" },
      { id: "g2", type: "pants", color: "khaki", name: "Khaki chinos" },
      { id: "g3", type: "shoes", color: "brown", name: "Brown Eccos" },
    ];
    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc123", garments }),
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.matches).toHaveLength(2);
    expect(body.matches[0].garmentId).toBe("g1");
    expect(body.matches[1].garmentId).toBe("g2");
  });

  it("returns empty matches when Claude returns malformed JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: "I cannot identify garments." }] }),
    });
    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "abc", garments: [] }),
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.matches).toHaveLength(0);
  });

  it("skips low-confidence detections (< 4)", async () => {
    const detected = [{ type: "shirt", color: "navy", confidence: 3 }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: JSON.stringify(detected) }] }),
    });
    const garments = [{ id: "g1", type: "shirt", color: "navy", name: "Navy shirt" }];
    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "abc", garments }),
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).matches).toHaveLength(0);
  });

  it("returns 502 on Claude API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 500,
      text: () => Promise.resolve("server error"),
    });
    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "abc", garments: [] }),
    });
    expect(r.statusCode).toBe(502);
  });
});
