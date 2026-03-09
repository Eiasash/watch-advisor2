import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../netlify/functions/_claudeClient.js", () => ({
  callClaude: vi.fn(),
}));

describe("extract-outfit handler", () => {
  let handler, callClaude;

  beforeEach(async () => {
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    const client = await import("../netlify/functions/_claudeClient.js");
    callClaude = client.callClaude;
    callClaude.mockReset();
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

  it("returns 400 for invalid JSON body", async () => {
    const r = await handler({
      httpMethod: "POST",
      body: "not json at all{{{",
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toContain("Invalid JSON");
  });

  it("returns 400 when image missing", async () => {
    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ garments: [] }),
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toContain("Missing image");
  });

  it("returns matches when Claude responds with detected garments", async () => {
    const detected = [
      { type: "shirt", color: "navy", confidence: 9 },
      { type: "pants", color: "khaki", confidence: 8 },
    ];
    callClaude.mockResolvedValue({ content: [{ text: JSON.stringify(detected) }] });

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
    expect(body.matches[0].score).toBe(9); // type 5 + color 4
    expect(body.matches[1].garmentId).toBe("g2");
    expect(body.detected).toEqual(detected);
  });

  it("returns empty detected array when AI returns unparseable JSON", async () => {
    callClaude.mockResolvedValue({ content: [{ text: "I cannot identify garments in this photo." }] });

    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "abc", garments: [{ id: "g1", type: "shirt", color: "navy" }] }),
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.detected).toEqual([]);
    expect(body.matches).toHaveLength(0);
  });

  it("returns no matches when garments array is empty", async () => {
    const detected = [{ type: "shirt", color: "navy", confidence: 9 }];
    callClaude.mockResolvedValue({ content: [{ text: JSON.stringify(detected) }] });

    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "abc", garments: [] }),
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.matches).toHaveLength(0);
    expect(body.detected).toHaveLength(1);
  });

  it("skips low-confidence detections (confidence < 4)", async () => {
    const detected = [
      { type: "shirt", color: "navy", confidence: 3 },
      { type: "pants", color: "grey", confidence: 2 },
    ];
    callClaude.mockResolvedValue({ content: [{ text: JSON.stringify(detected) }] });

    const garments = [
      { id: "g1", type: "shirt", color: "navy", name: "Navy shirt" },
      { id: "g2", type: "pants", color: "grey", name: "Grey chinos" },
    ];
    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "abc", garments }),
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).matches).toHaveLength(0);
  });

  it("prevents duplicate garment matches (same garment never matched twice)", async () => {
    const detected = [
      { type: "shirt", color: "navy", confidence: 9 },
      { type: "shirt", color: "navy", confidence: 8 },
    ];
    callClaude.mockResolvedValue({ content: [{ text: JSON.stringify(detected) }] });

    const garments = [
      { id: "g1", type: "shirt", color: "navy", name: "Navy polo" },
      { id: "g2", type: "shirt", color: "blue", name: "Blue shirt" },
    ];
    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "abc", garments }),
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.matches).toHaveLength(2);
    // First detection gets the best match (g1: exact type+color = 9)
    expect(body.matches[0].garmentId).toBe("g1");
    // Second detection cannot reuse g1, so it gets g2 (type match only = 5)
    expect(body.matches[1].garmentId).toBe("g2");
    // Ensure no duplicates
    const ids = body.matches.map(m => m.garmentId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("scores partial color matches with 2 points", async () => {
    const detected = [{ type: "pants", color: "grey", confidence: 7 }];
    callClaude.mockResolvedValue({ content: [{ text: JSON.stringify(detected) }] });

    // "light grey" includes "grey" → partial color match (2pts) + exact type (5pts) = 7
    // "navy" pants → exact type (5pts) only = 5
    const garments = [
      { id: "g1", type: "pants", color: "light grey", name: "Light grey chinos" },
      { id: "g2", type: "pants", color: "navy", name: "Navy pants" },
    ];
    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "abc", garments }),
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.matches).toHaveLength(1);
    // g1 should win because partial color match gives it higher score
    expect(body.matches[0].garmentId).toBe("g1");
    expect(body.matches[0].score).toBe(7); // type 5 + partial color 2
  });

  it("returns 502 on Claude API error", async () => {
    callClaude.mockRejectedValue(new Error("Claude API error: 500"));

    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ image: "abc", garments: [] }),
    });
    expect(r.statusCode).toBe(502);
    expect(JSON.parse(r.body).error).toContain("Claude API error");
  });
});
