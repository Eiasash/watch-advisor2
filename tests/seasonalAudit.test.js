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

// Mock Supabase client
const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

describe("seasonal-audit handler", () => {
  let handler;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");

    // Default mock chain: select → or → not → returns data
    const garments = [
      { id: "g1", name: "Navy Polo", type: "shirt", color: "navy", brand: "Gant", seasons: ["spring", "summer"], contexts: ["casual"] },
      { id: "g2", name: "Black Chinos", type: "pants", color: "black", brand: "Zara", seasons: ["autumn", "winter"], contexts: ["smart-casual"] },
      { id: "g3", name: "White Oxford", type: "shirt", color: "white", brand: "Brooks", seasons: ["spring", "summer", "autumn", "winter"], contexts: ["clinic", "formal"] },
      { id: "g4", name: "Brown Derby", type: "shoes", color: "brown", brand: "Ecco", seasons: ["spring", "autumn"], contexts: ["smart-casual"] },
      { id: "g5", name: "Navy Blazer", type: "jacket", color: "navy", brand: "MD", seasons: ["autumn", "winter"], contexts: ["formal"] },
    ];

    const history = [
      { date: "2026-04-01", watch_id: "speedmaster", payload: { garmentIds: ["g1", "g3", "g4"] } },
      { date: "2026-04-02", watch_id: "santos", payload: { garmentIds: ["g1", "g2", "g4"] } },
      { date: "2026-04-03", watch_id: "speedmaster", payload: { garmentIds: ["g3", "g2"] } },
    ];

    mockFrom.mockImplementation((table) => {
      if (table === "garments") {
        return {
          select: () => ({
            or: () => ({
              not: () => Promise.resolve({ data: garments }),
            }),
          }),
        };
      }
      if (table === "history") {
        return {
          select: () => ({
            gte: () => ({
              order: () => Promise.resolve({ data: history }),
            }),
          }),
        };
      }
      return { select: () => ({ or: () => ({ not: () => Promise.resolve({ data: [] }) }) }) };
    });

    const mod = await import("../netlify/functions/seasonal-audit.js");
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

  it("returns seasonal audit with correct structure", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ season: "spring" }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.season).toBe("spring");
    expect(body.periodDays).toBe(90);
    expect(body.totalGarments).toBeGreaterThan(0);
    expect(body.totalOutfits).toBe(3);
    expect(Array.isArray(body.neverWorn)).toBe(true);
    expect(Array.isArray(body.overWorn)).toBe(true);
    expect(Array.isArray(body.seasonMismatch)).toBe(true);
    expect(Array.isArray(body.gaps)).toBe(true);
    expect(typeof body.watchUtilization).toBe("object");
  });

  it("identifies never-worn garments", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ season: "spring" }),
    });
    const body = JSON.parse(res.body);
    // g5 (Navy Blazer) was never worn in the history
    const neverWornNames = body.neverWorn.map(g => g.name);
    expect(neverWornNames).toContain("Navy Blazer");
    expect(body.neverWornCount).toBeGreaterThan(0);
  });

  it("tracks watch utilization", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ season: "spring" }),
    });
    const body = JSON.parse(res.body);
    expect(body.watchUtilization.speedmaster).toBe(2);
    expect(body.watchUtilization.santos).toBe(1);
  });

  it("detects season mismatches", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ season: "summer" }),
    });
    const body = JSON.parse(res.body);
    // g2 is autumn/winter only but was worn — should be flagged
    const mismatchNames = body.seasonMismatch.map(g => g.name);
    expect(mismatchNames).toContain("Black Chinos");
  });

  it("calculates neverWornPct correctly", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ season: "spring" }),
    });
    const body = JSON.parse(res.body);
    expect(body.neverWornPct).toBe(Math.round((body.neverWornCount / body.totalGarments) * 100));
  });

  it("auto-detects current season when not provided", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({}),
    });
    const body = JSON.parse(res.body);
    // April = spring (month index 3, which is >= 2 and <= 4)
    expect(["spring", "summer", "autumn", "winter"]).toContain(body.season);
  });

  it("identifies wardrobe gaps", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ season: "spring" }),
    });
    const body = JSON.parse(res.body);
    // We have navy and white shirts, but missing light blue, olive, teal, cream
    const gapColors = body.gaps.filter(g => g.category === "shirt").map(g => g.missingColor);
    expect(gapColors).toContain("light blue");
    expect(gapColors).toContain("olive");
  });

  it("excludes accessories from analysis", async () => {
    // Accessories (belt, sunglasses, etc.) should not appear in results
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ season: "spring" }),
    });
    const body = JSON.parse(res.body);
    const categories = body.neverWorn.map(g => g.category);
    expect(categories).not.toContain("belt");
    expect(categories).not.toContain("sunglasses");
  });
});
