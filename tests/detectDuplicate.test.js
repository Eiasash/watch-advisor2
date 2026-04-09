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

describe("detect-duplicate handler", () => {
  let handler;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    const mod = await import("../netlify/functions/detect-duplicate.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const res = await handler({ httpMethod: "OPTIONS" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 405 for GET", async () => {
    const res = await handler({ httpMethod: "GET" });
    expect(res.statusCode).toBe(405);
    expect(JSON.parse(res.body).error).toContain("Method not allowed");
  });

  it("returns 400 when images are missing", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageA: "abc" }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("Missing image");
  });

  it("returns 400 when both images are empty", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageA: "", imageB: "" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 500 when CLAUDE_API_KEY is missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageA: "abc", imageB: "def" }),
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain("CLAUDE_API_KEY");
  });

  it("returns duplicate detection result on success", async () => {
    const mockResult = { isDuplicate: true, isAngleShot: false, confidence: "high", reason: "Same navy polo" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: JSON.stringify(mockResult) }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageA: "abc", imageB: "def" }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.isDuplicate).toBe(true);
    expect(body.confidence).toBe("high");
  });

  it("returns angle shot detection", async () => {
    const mockResult = { isDuplicate: false, isAngleShot: true, confidence: "medium", reason: "Same sweater, different angle" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: JSON.stringify(mockResult) }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageA: "abc", imageB: "def" }),
    });
    const body = JSON.parse(res.body);
    expect(body.isAngleShot).toBe(true);
    expect(body.isDuplicate).toBe(false);
  });

  it("returns fallback when JSON parse fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: "I cannot determine this clearly" }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageA: "abc", imageB: "def" }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.isDuplicate).toBe(false);
    expect(body.confidence).toBe("low");
    expect(body.reason).toContain("Could not parse");
  });

  it("extracts JSON from mixed text response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: 'Based on my analysis:\n{"isDuplicate": false, "isAngleShot": false, "confidence": "high", "reason": "Different colors"}\nHope that helps!' }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageA: "abc", imageB: "def" }),
    });
    const body = JSON.parse(res.body);
    expect(body.isDuplicate).toBe(false);
    expect(body.confidence).toBe("high");
  });

  it("uses Haiku model (not Sonnet) for efficiency", async () => {
    let calledBody;
    globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
      calledBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          content: [{ type: "text", text: JSON.stringify({ isDuplicate: false, confidence: "low", reason: "test" }) }],
        }),
      };
    });

    await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageA: "abc", imageB: "def" }),
    });
    expect(calledBody.model).toBe("claude-haiku-4-5-20251001");
  });

  it("includes CORS headers on all response paths", async () => {
    const r405 = await handler({ httpMethod: "GET" });
    expect(r405.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");

    const r400 = await handler({ httpMethod: "POST", body: JSON.stringify({}) });
    expect(r400.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });
});
