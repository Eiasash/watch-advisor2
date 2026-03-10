import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock callClaude and blobCache ──────────────────────────────────────────

const mockCallClaude = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();

vi.mock("../netlify/functions/_claudeClient.js", () => ({
  callClaude: (...args) => mockCallClaude(...args),
}));

vi.mock("../netlify/functions/_blobCache.js", () => ({
  cacheGet: (...args) => mockCacheGet(...args),
  cacheSet: (...args) => mockCacheSet(...args),
}));

const { handler } = await import("../netlify/functions/bulk-tag.js");

const garments = [
  { id: "g1", name: "White Oxford Shirt", type: "shirt", color: "white", material: "cotton" },
  { id: "g2", name: "Navy Chinos", type: "pants", color: "navy", material: "cotton" },
];

const claudeResponse = [
  { id: "g1", seasons: ["spring", "summer", "autumn"], contexts: ["clinic", "smart-casual"], material: "cotton", pattern: "solid" },
  { id: "g2", seasons: ["all-season"], contexts: ["clinic", "smart-casual", "casual"], material: "cotton", pattern: "solid" },
];

describe("bulk-tag handler", () => {
  beforeEach(() => {
    mockCallClaude.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── CORS / method checks ─────────────────────────────────────────────────

  it("returns 204 for OPTIONS preflight", async () => {
    const res = await handler({ httpMethod: "OPTIONS" });
    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("returns 405 for non-POST methods", async () => {
    const res = await handler({ httpMethod: "GET" });
    expect(res.statusCode).toBe(405);
    expect(JSON.parse(res.body).error).toBe("Method not allowed");
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("returns 400 when garments array is empty", async () => {
    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments: [] }) });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("No garments");
  });

  it("returns 400 when body has no garments key", async () => {
    const res = await handler({ httpMethod: "POST", body: JSON.stringify({}) });
    expect(res.statusCode).toBe(400);
  });

  it("returns 500 when CLAUDE_API_KEY missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments }) });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain("CLAUDE_API_KEY");
  });

  // ── Cache hit ─────────────────────────────────────────────────────────────

  it("returns cached result with X-Cache: HIT", async () => {
    const cached = { results: claudeResponse };
    mockCacheGet.mockResolvedValue(cached);

    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments }) });
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-Cache"]).toBe("HIT");
    expect(JSON.parse(res.body)).toEqual(cached);
    expect(mockCallClaude).not.toHaveBeenCalled();
  });

  // ── Successful tagging ────────────────────────────────────────────────────

  it("calls Claude and returns validated results", async () => {
    mockCallClaude.mockResolvedValue({
      content: [{ text: JSON.stringify(claudeResponse) }],
    });

    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments }) });
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-Cache"]).toBe("MISS");
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(2);
    expect(body.results[0].id).toBe("g1");
    expect(body.results[0].seasons).toContain("spring");
  });

  it("caches result when all garments are returned", async () => {
    mockCallClaude.mockResolvedValue({
      content: [{ text: JSON.stringify(claudeResponse) }],
    });

    await handler({ httpMethod: "POST", body: JSON.stringify({ garments }) });
    expect(mockCacheSet).toHaveBeenCalledTimes(1);
  });

  it("does NOT cache partial results", async () => {
    mockCallClaude.mockResolvedValue({
      content: [{ text: JSON.stringify([claudeResponse[0]]) }], // only 1 of 2
    });

    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments }) });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).results).toHaveLength(1);
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  // ── Validation / sanitization ─────────────────────────────────────────────

  it("strips markdown fences from Claude response", async () => {
    mockCallClaude.mockResolvedValue({
      content: [{ text: "```json\n" + JSON.stringify(claudeResponse) + "\n```" }],
    });

    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments }) });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).results).toHaveLength(2);
  });

  it("filters out invalid seasons and contexts", async () => {
    const bad = [{
      id: "g1",
      seasons: ["spring", "rainy"],     // "rainy" is not valid
      contexts: ["clinic", "poolside"], // "poolside" is not valid
      material: "cotton",
      pattern: "solid",
    }];
    mockCallClaude.mockResolvedValue({ content: [{ text: JSON.stringify(bad) }] });

    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments: [garments[0]] }) });
    const result = JSON.parse(res.body).results[0];
    expect(result.seasons).toEqual(["spring"]);
    expect(result.contexts).toEqual(["clinic"]);
  });

  it("drops entries missing id", async () => {
    const noId = [{ seasons: ["spring"], contexts: ["casual"], material: "cotton", pattern: "solid" }];
    mockCallClaude.mockResolvedValue({ content: [{ text: JSON.stringify(noId) }] });

    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments: [garments[0]] }) });
    expect(JSON.parse(res.body).results).toHaveLength(0);
  });

  it("drops entries with empty seasons after filtering", async () => {
    const badSeasons = [{ id: "g1", seasons: ["rainy"], contexts: ["clinic"], material: "cotton", pattern: "solid" }];
    mockCallClaude.mockResolvedValue({ content: [{ text: JSON.stringify(badSeasons) }] });

    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments: [garments[0]] }) });
    expect(JSON.parse(res.body).results).toHaveLength(0);
  });

  it("drops entries with empty contexts after filtering", async () => {
    const badCtx = [{ id: "g1", seasons: ["spring"], contexts: ["poolside"], material: "cotton", pattern: "solid" }];
    mockCallClaude.mockResolvedValue({ content: [{ text: JSON.stringify(badCtx) }] });

    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments: [garments[0]] }) });
    expect(JSON.parse(res.body).results).toHaveLength(0);
  });

  // ── Batch limit ───────────────────────────────────────────────────────────

  it("limits batch to 10 garments", async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: `g${i}`, name: `Item ${i}`, type: "shirt" }));
    mockCallClaude.mockResolvedValue({ content: [{ text: "[]" }] });

    await handler({ httpMethod: "POST", body: JSON.stringify({ garments: many }) });
    // Verify the prompt only contains 10 items
    const prompt = mockCallClaude.mock.calls[0][1].messages[0].content;
    expect(prompt).toContain('10.');
    expect(prompt).not.toContain('11.');
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns 500 on Claude API error", async () => {
    mockCallClaude.mockRejectedValue(new Error("API rate limited"));

    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments }) });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe("API rate limited");
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("handles malformed JSON from Claude gracefully", async () => {
    mockCallClaude.mockResolvedValue({ content: [{ text: "not json at all" }] });

    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments }) });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).results).toEqual([]);
  });

  it("handles null content from Claude gracefully", async () => {
    mockCallClaude.mockResolvedValue({ content: [] });

    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments }) });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).results).toEqual([]);
  });

  it("handles null body gracefully", async () => {
    const res = await handler({ httpMethod: "POST", body: null });
    expect(res.statusCode).toBe(400);
  });

  // ── Model and prompt ──────────────────────────────────────────────────────

  it("uses claude-haiku model", async () => {
    mockCallClaude.mockResolvedValue({ content: [{ text: "[]" }] });
    await handler({ httpMethod: "POST", body: JSON.stringify({ garments }) });
    expect(mockCallClaude.mock.calls[0][1].model).toBe("claude-haiku-4-5-20251001");
  });

  it("includes garment details in prompt", async () => {
    mockCallClaude.mockResolvedValue({ content: [{ text: "[]" }] });
    await handler({ httpMethod: "POST", body: JSON.stringify({ garments: [garments[0]] }) });
    const prompt = mockCallClaude.mock.calls[0][1].messages[0].content;
    expect(prompt).toContain("White Oxford Shirt");
    expect(prompt).toContain('type="shirt"');
    expect(prompt).toContain('color="white"');
  });

  it("handles missing type/color/material with 'unknown' defaults", async () => {
    const sparse = [{ id: "x", name: "Mystery Item" }];
    mockCallClaude.mockResolvedValue({ content: [{ text: "[]" }] });
    await handler({ httpMethod: "POST", body: JSON.stringify({ garments: sparse }) });
    const prompt = mockCallClaude.mock.calls[0][1].messages[0].content;
    expect(prompt).toContain('type="unknown"');
    expect(prompt).toContain('color="unknown"');
    expect(prompt).toContain('material="unknown"');
  });

  // ── Cache key stability ───────────────────────────────────────────────────

  it("generates same cache key regardless of garment order", async () => {
    mockCallClaude.mockResolvedValue({ content: [{ text: "[]" }] });

    await handler({ httpMethod: "POST", body: JSON.stringify({ garments: [garments[0], garments[1]] }) });
    const key1 = mockCacheGet.mock.calls[0][0];

    mockCacheGet.mockClear();
    await handler({ httpMethod: "POST", body: JSON.stringify({ garments: [garments[1], garments[0]] }) });
    const key2 = mockCacheGet.mock.calls[0][0];

    expect(key1).toBe(key2);
  });

  // ── Material/pattern defaults ─────────────────────────────────────────────

  it("preserves null material and pattern when missing", async () => {
    const partial = [{ id: "g1", seasons: ["spring"], contexts: ["casual"] }];
    mockCallClaude.mockResolvedValue({ content: [{ text: JSON.stringify(partial) }] });

    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ garments: [garments[0]] }) });
    const result = JSON.parse(res.body).results[0];
    expect(result.material).toBeNull();
    expect(result.pattern).toBeNull();
  });
});
