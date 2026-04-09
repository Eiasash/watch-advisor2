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

describe("relabel-garment handler", () => {
  let handler;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    const mod = await import("../netlify/functions/relabel-garment.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const res = await handler({ httpMethod: "OPTIONS" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 400 when image is missing", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ current: { type: "shirt" } }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when current label is missing", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "data:image/jpeg;base64,abc" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 500 when CLAUDE_API_KEY is missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        image: "data:image/jpeg;base64,abc",
        current: { type: "shirt", color: "blue" },
      }),
    });
    expect(res.statusCode).toBe(500);
  });

  it("returns confirmation when label is correct", async () => {
    const mockResult = {
      confirmed: true, confidence: 0.95, reason: "Label is accurate",
      corrections: {},
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
        current: { type: "shirt", color: "navy" },
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.confirmed).toBe(true);
    expect(body.confidence).toBe(0.95);
  });

  it("returns corrections when label is wrong", async () => {
    const mockResult = {
      confirmed: false, confidence: 0.88, reason: "This is a sweater not a shirt",
      corrections: { type: "sweater", color: "cream", color_alternatives: ["ivory", "white", "beige"] },
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
        current: { type: "shirt", color: "white" },
      }),
    });
    const body = JSON.parse(res.body);
    expect(body.confirmed).toBe(false);
    expect(body.corrections.type).toBe("sweater");
    expect(body.corrections.color_alternatives).toHaveLength(3);
  });

  it("repairs truncated JSON from Claude", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: '{"confirmed":true,"confidence":0.9,"reason":"correct","corrections":{}' }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        image: "data:image/jpeg;base64,abc123",
        current: { type: "pants", color: "khaki" },
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.confirmed).toBe(true);
    expect(body._repaired).toBe(true);
  });

  it("includes CORS headers on error paths", async () => {
    const r400 = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ current: { type: "shirt" } }),
    });
    expect(r400.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });
});
