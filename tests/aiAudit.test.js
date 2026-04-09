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

describe("ai-audit handler (expanded)", () => {
  let handler;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    vi.stubEnv("OPEN_API_KEY", "test-secret");
    const mod = await import("../netlify/functions/ai-audit.js");
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

  it("returns 401 when x-api-secret header is missing", async () => {
    const res = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ prompt: "audit" }),
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when x-api-secret header is wrong", async () => {
    const res = await handler({
      httpMethod: "POST",
      headers: { "x-api-secret": "wrong-key" },
      body: JSON.stringify({ prompt: "audit" }),
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 500 when CLAUDE_API_KEY is missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const res = await handler({
      httpMethod: "POST",
      headers: { "x-api-secret": "test-secret" },
      body: JSON.stringify({ prompt: "audit my wardrobe" }),
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain("CLAUDE_API_KEY");
  });

  it("returns parsed JSON audit result on success", async () => {
    const auditResult = {
      summary: "Wardrobe is well-balanced",
      gaps: ["Missing light summer jacket"],
      recommendations: ["Add a linen shirt"],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: JSON.stringify(auditResult) }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      headers: { "x-api-secret": "test-secret" },
      body: JSON.stringify({ prompt: "audit my wardrobe" }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.summary).toBe("Wardrobe is well-balanced");
    expect(body.gaps).toHaveLength(1);
  });

  it("strips markdown fences from response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: '```json\n{"summary":"clean"}\n```' }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      headers: { "x-api-secret": "test-secret" },
      body: JSON.stringify({ prompt: "audit" }),
    });
    const body = JSON.parse(res.body);
    expect(body.summary).toBe("clean");
  });

  it("returns error with raw text when JSON parse fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: "Here is my analysis of your wardrobe..." }],
      }),
    });

    const res = await handler({
      httpMethod: "POST",
      headers: { "x-api-secret": "test-secret" },
      body: JSON.stringify({ prompt: "audit" }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it("returns 502 for Claude billing errors", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("BILLING: insufficient credits"),
    });

    const res = await handler({
      httpMethod: "POST",
      headers: { "x-api-secret": "test-secret" },
      body: JSON.stringify({ prompt: "audit" }),
    });
    expect(res.statusCode).toBe(502);
  });

  it("includes CORS headers on all paths", async () => {
    const r401 = await handler({
      httpMethod: "POST",
      headers: { "x-api-secret": "wrong" },
      body: JSON.stringify({ prompt: "audit" }),
    });
    expect(r401.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");

    const r405 = await handler({ httpMethod: "GET" });
    expect(r405.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });

  it("uses Sonnet model (not Haiku) for audit quality", async () => {
    let calledBody;
    globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
      calledBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          content: [{ type: "text", text: '{"summary":"test"}' }],
        }),
      };
    });

    await handler({
      httpMethod: "POST",
      headers: { "x-api-secret": "test-secret" },
      body: JSON.stringify({ prompt: "audit" }),
    });
    expect(calledBody.model).toContain("sonnet");
  });
});
