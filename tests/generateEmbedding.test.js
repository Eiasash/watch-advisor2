import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock _blobCache
vi.mock("../netlify/functions/_blobCache.js", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  hashText: vi.fn(s => "hash_" + s.slice(0, 8)),
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

import { cacheGet, cacheSet } from "../netlify/functions/_blobCache.js";

describe("generate-embedding handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    cacheGet.mockResolvedValue(null);
    cacheSet.mockResolvedValue(undefined);
    const mod = await import("../netlify/functions/generate-embedding.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS (CORS preflight)", async () => {
    const result = await handler({ httpMethod: "OPTIONS" });
    expect(result.statusCode).toBe(204);
  });

  it("returns 405 for GET", async () => {
    const result = await handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(405);
    expect(JSON.parse(result.body).error).toContain("Method not allowed");
  });

  it("returns 503 when OPENAI_API_KEY missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garmentId: "g1", text: "navy polo shirt" }),
    });
    expect(result.statusCode).toBe(503);
    expect(JSON.parse(result.body).error).toContain("OPENAI_API_KEY");
  });

  it("returns 400 when text is missing", async () => {
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garmentId: "g1" }),
    });
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain("text required");
  });

  it("returns 400 when text is empty string", async () => {
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garmentId: "g1", text: "   " }),
    });
    expect(result.statusCode).toBe(400);
  });

  it("returns cached embedding on cache hit", async () => {
    const fakeEmb = [0.1, 0.2, 0.3];
    cacheGet.mockResolvedValue({ embedding: fakeEmb });

    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garmentId: "g1", text: "navy polo shirt" }),
    });

    expect(result.statusCode).toBe(200);
    expect(result.headers["X-Cache"]).toBe("HIT");
    const body = JSON.parse(result.body);
    expect(body.garmentId).toBe("g1");
    expect(body.embedding).toEqual(fakeEmb);
  });

  it("calls OpenAI and returns embedding on cache miss", async () => {
    const fakeEmb = Array(1536).fill(0.01);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding: fakeEmb }] }),
    });

    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garmentId: "g2", text: "brown leather belt" }),
    });

    expect(result.statusCode).toBe(200);
    expect(result.headers["X-Cache"]).toBe("MISS");
    const body = JSON.parse(result.body);
    expect(body.garmentId).toBe("g2");
    expect(body.embedding).toEqual(fakeEmb);
    expect(cacheSet).toHaveBeenCalled();
  });

  it("returns 502 when OpenAI returns error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("rate limit exceeded"),
    });

    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garmentId: "g3", text: "grey sweater" }),
    });

    expect(result.statusCode).toBe(502);
    expect(JSON.parse(result.body).error).toContain("OpenAI error");
  });

  it("returns 502 when OpenAI returns no embedding data", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garmentId: "g4", text: "black shoes" }),
    });

    expect(result.statusCode).toBe(502);
    expect(JSON.parse(result.body).error).toContain("No embedding returned");
  });

  it("returns 500 on unexpected parse error", async () => {
    const result = await handler({
      httpMethod: "POST",
      body: "not json!!!",
    });

    expect(result.statusCode).toBe(500);
  });

  it("truncates text to 512 characters", async () => {
    const longText = "a".repeat(1000);
    const fakeEmb = [0.5];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding: fakeEmb }] }),
    });

    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garmentId: "g5", text: longText }),
    });

    expect(result.statusCode).toBe(200);
    // Verify the fetch was called with truncated input
    const fetchCall = globalThis.fetch.mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);
    expect(requestBody.input.length).toBeLessThanOrEqual(512);
  });

  it("includes CORS headers in all responses", async () => {
    const result = await handler({ httpMethod: "OPTIONS" });
    expect(result.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });
});
