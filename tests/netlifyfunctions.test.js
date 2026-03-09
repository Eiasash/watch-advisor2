import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── ai-audit handler ──────────────────────────────────────────────────────

describe("ai-audit handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    // Re-import to pick up env stubs
    const mod = await import("../netlify/functions/ai-audit.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS (CORS preflight)", async () => {
    const result = await handler({ httpMethod: "OPTIONS" });
    expect(result.statusCode).toBe(204);
  });

  it("returns 405 for GET", async () => {
    const result = await handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(405);
  });

  it("returns 500 with CORS when CLAUDE_API_KEY is missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ prompt: "audit" }),
    });
    expect(result.statusCode).toBe(500);
    expect(result.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(JSON.parse(result.body).error).toContain("CLAUDE_API_KEY");
  });

  it("includes CORS headers on all response paths", async () => {
    // 405 path
    const r405 = await handler({ httpMethod: "GET" });
    expect(r405.headers["Access-Control-Allow-Origin"]).toBe("*");

    // 502 path (Claude API error)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("rate limited"),
    });
    const r502 = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ prompt: "audit" }),
    });
    expect(r502.headers["Access-Control-Allow-Origin"]).toBe("*");

    // 500 path (network error)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const r500 = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ prompt: "audit" }),
    });
    expect(r500.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("returns parsed JSON on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: '{"score": 85, "gaps": []}' }],
      }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ prompt: "audit my wardrobe" }),
    });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.score).toBe(85);
  });

  it("strips markdown fences from AI response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: '```json\n{"score": 90}\n```' }],
      }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ prompt: "audit" }),
    });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).score).toBe(90);
  });

  it("returns error for invalid JSON from AI", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: "not valid json at all" }],
      }),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ prompt: "audit" }),
    });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("Invalid JSON");
  });

  it("returns 502 when API returns error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("rate limited"),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ prompt: "audit" }),
    });
    expect(result.statusCode).toBe(502);
  });

  it("returns 500 on unexpected error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ prompt: "audit" }),
    });
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain("network down");
  });
});

// ─── classify-image handler ─────────────────────────────────────────────────

describe("classify-image handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    const mod = await import("../netlify/functions/classify-image.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS", async () => {
    const result = await handler({ httpMethod: "OPTIONS" });
    expect(result.statusCode).toBe(204);
  });

  it("returns 400 for missing image", async () => {
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({}),
    });
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain("Missing image");
  });

  it("returns 500 when API key missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "base64data" }),
    });
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain("CLAUDE_API_KEY");
  });

  it("returns classification result on success", async () => {
    // classify-image returns parsed JSON directly (not wrapped in content[])
    const apiResponse = {
      content: [{ text: '{"type": "shirt", "color": "navy", "formality": 7}' }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    });
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "base64data" }),
    });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    // Function calls callClaude which returns {content:[{text:'...'}]}, then parses the text
    // So the response body is the parsed garment data: { type, color, formality, ... }
    expect(body.type).toBe("shirt");
    expect(body.color).toBe("navy");
    expect(body.formality).toBe(7);
  });

  it("returns 500 on fetch error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("timeout"));
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "base64data" }),
    });
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain("timeout");
  });
});
