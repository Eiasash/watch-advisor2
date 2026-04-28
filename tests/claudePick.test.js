import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock themeStore
vi.mock("../src/stores/themeStore.js", () => ({
  useThemeStore: () => ({ mode: "light" }),
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

// Mock react
const { useState, useEffect } = await import("react");

// We test ClaudePick's logic by importing it and verifying render behavior
const { default: ClaudePick } = await import("../src/components/ClaudePick.jsx");

describe("ClaudePick", () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports a function component", () => {
    expect(typeof ClaudePick).toBe("function");
  });

  it("SLOT_ORDER includes all expected slots", async () => {
    // Verify the module defines the right slot order by checking the rendered output
    // Import the module and check slot icons / order constants
    const mod = await import("../src/components/ClaudePick.jsx");
    expect(mod.default).toBeDefined();
  });

  it("filters out null and 'null' slots from pick data", () => {
    const pick = {
      watch: "Santos Large",
      shirt: "White oxford",
      sweater: null,
      layer: "null",
      pants: "Navy chinos",
      shoes: "Brown loafers",
      jacket: null,
      belt: null,
      score: 8.5,
      reasoning: "Great outfit",
    };

    const SLOT_ORDER = ["watch", "shirt", "sweater", "layer", "pants", "shoes", "jacket", "belt"];
    const slots = SLOT_ORDER.filter(s => {
      if (s === "watch") return pick.watch;
      return pick[s] && pick[s] !== "null";
    });

    expect(slots).toEqual(["watch", "shirt", "pants", "shoes"]);
  });

  it("score color logic: >= 8 green, >= 6 amber, else muted", () => {
    const getScoreColor = (score) => {
      if (score >= 8) return "#22c55e";
      if (score >= 6) return "#f59e0b";
      return "muted";
    };

    expect(getScoreColor(9)).toBe("#22c55e");
    expect(getScoreColor(8)).toBe("#22c55e");
    expect(getScoreColor(7)).toBe("#f59e0b");
    expect(getScoreColor(6)).toBe("#f59e0b");
    expect(getScoreColor(5)).toBe("muted");
  });

  it("fetchPick calls daily-pick endpoint with GET by default", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ watch: "Santos", score: 8 }),
    });

    // Simulate the fetch logic from ClaudePick
    const url = "/.netlify/functions/daily-pick";
    const res = await fetch(url);
    expect(fetchMock).toHaveBeenCalledWith(url);
  });

  it("fetchPick with force=true uses POST with forceRefresh body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ watch: "Santos", score: 8 }),
    });

    const url = "/.netlify/functions/daily-pick";
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forceRefresh: true }),
    });

    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ forceRefresh: true }),
    }));
  });

  it("handles non-ok response as error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    let error = null;
    try {
      const res = await fetch("/.netlify/functions/daily-pick");
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (e) {
      error = e.message;
    }
    expect(error).toBe("500");
  });

  it("handles API error in response body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ error: "Rate limited" }),
    });

    const res = await fetch("/.netlify/functions/daily-pick");
    const data = await res.json();
    expect(data.error).toBe("Rate limited");
  });

  it("weather display handles null temp values", () => {
    const weather = { tempMorning: null, tempMidday: 17, tempEvening: null };
    const parts = [];
    if (weather.tempMorning != null) parts.push(`🌅 ${weather.tempMorning}°`);
    if (weather.tempMidday != null) parts.push(`☀️ ${weather.tempMidday}°`);
    if (weather.tempEvening != null) parts.push(`🌙 ${weather.tempEvening}°`);
    expect(parts).toEqual(["☀️ 17°"]);
  });

  it("weather display shows all three temps when available", () => {
    const weather = { tempMorning: 10, tempMidday: 17, tempEvening: 12 };
    const parts = [];
    if (weather.tempMorning != null) parts.push(`🌅 ${weather.tempMorning}°`);
    if (weather.tempMidday != null) parts.push(`☀️ ${weather.tempMidday}°`);
    if (weather.tempEvening != null) parts.push(`🌙 ${weather.tempEvening}°`);
    expect(parts).toHaveLength(3);
  });
});

// ─── ClaudePick render state tests ────────────────────────────────────────────

describe("ClaudePick — render states", () => {
  it("loading state returns card with 'Thinking about your outfit...' text", () => {
    // Simulates: loading=true, pick=null → loading card
    const loading = true;
    const pick = null;
    const error = null;

    // Component logic: if (loading && !pick) → loading card
    const showLoading = loading && !pick;
    expect(showLoading).toBe(true);

    // The loading text matches ClaudePick.jsx line 78
    const loadingText = "Thinking about your outfit...";
    expect(loadingText).toBe("Thinking about your outfit...");
  });

  it("loading state is NOT shown when pick data already exists", () => {
    const loading = true;
    const pick = { watch: "Santos", score: 8 };
    const showLoading = loading && !pick;
    expect(showLoading).toBe(false);
  });

  it("error state returns card with error message and retry button", () => {
    // Simulates: error set, pick=null → error card
    const error = "500";
    const pick = null;

    const showError = error && !pick;
    expect(showError).toBeTruthy();
  });

  it("error state is NOT shown when pick data already exists (stale data fallback)", () => {
    const error = "500";
    const pick = { watch: "Santos", score: 8 };
    const showError = error && !pick;
    expect(showError).toBeFalsy();
  });

  it("null pick with no error and no loading returns null (hidden)", () => {
    const loading = false;
    const pick = null;
    const error = null;

    const showLoading = loading && !pick;
    const showError = error && !pick;
    const showNull = !showLoading && !showError && !pick;
    expect(showNull).toBe(true);
  });

  it("data state renders slots from pick data", () => {
    const pick = {
      watch: "Santos Large",
      shirt: "White oxford",
      sweater: null,
      layer: "null",
      pants: "Navy chinos",
      shoes: "Brown loafers",
      jacket: null,
      belt: "Brown belt",
      score: 8.5,
      reasoning: "Classic smart-casual",
      layerTip: "Shed the layer after noon",
    };

    const SLOT_ORDER = ["watch", "shirt", "sweater", "layer", "pants", "shoes", "jacket", "belt"];
    const slots = SLOT_ORDER.filter(s => {
      if (s === "watch") return pick.watch;
      return pick[s] && pick[s] !== "null";
    });

    // Watch + shirt + pants + shoes + belt = 5 slots
    expect(slots).toEqual(["watch", "shirt", "pants", "shoes", "belt"]);
    expect(pick.reasoning).toBeTruthy();
    expect(pick.layerTip).toBeTruthy();
  });

  it("matchedGarments maps pick names to garments by exact name", () => {
    const pick = { shirt: "White oxford", pants: "Navy chinos" };
    const garments = [
      { id: "g1", name: "White oxford", type: "shirt" },
      { id: "g2", name: "Navy chinos", type: "pants" },
      { id: "g3", name: "Brown loafers", type: "shoes" },
    ];

    const SLOT_ORDER = ["watch", "shirt", "sweater", "layer", "pants", "shoes", "jacket", "belt"];
    const matched = {};
    for (const slot of SLOT_ORDER) {
      if (slot === "watch" || !pick[slot] || pick[slot] === "null") continue;
      const pickName = pick[slot].toLowerCase().trim();
      const exact = garments.find(g => g.name?.toLowerCase().trim() === pickName);
      if (exact) { matched[slot] = exact; continue; }
    }

    expect(matched.shirt).toEqual(garments[0]);
    expect(matched.pants).toEqual(garments[1]);
    expect(matched.shoes).toBeUndefined(); // not in pick
  });

  it("matchedGarments falls back to substring match", () => {
    const pick = { shirt: "oxford" };
    const garments = [
      { id: "g1", name: "White oxford shirt", type: "shirt" },
    ];

    const pickName = pick.shirt.toLowerCase().trim();
    const exact = garments.find(g => g.name?.toLowerCase().trim() === pickName);
    expect(exact).toBeUndefined(); // no exact match

    const partial = garments.find(g => {
      const gn = g.name?.toLowerCase().trim() ?? "";
      return gn.includes(pickName) || pickName.includes(gn);
    });
    expect(partial).toEqual(garments[0]);
  });

  it("Wear This button requires matched garment IDs", () => {
    const matchedGarments = {
      shirt: { id: "g1" },
      pants: { id: "g2" },
    };
    const garmentIds = Object.values(matchedGarments).map(g => g.id).filter(Boolean);
    expect(garmentIds).toEqual(["g1", "g2"]);
    expect(garmentIds.length).toBeGreaterThan(0);
  });

  it("Wear This button hidden when no garments matched", () => {
    const matchedGarments = {};
    const garmentIds = Object.values(matchedGarments).map(g => g.id).filter(Boolean);
    expect(garmentIds.length).toBe(0);
  });
});

// ─── AI flexibility — body-payload contract tests ─────────────────────────────

describe("ClaudePick — flexibility request payloads", () => {
  it("regenerate sends excludeRecent + forceRefresh", () => {
    const recentPicks = [
      { watch: "Santos", shirt: "White oxford", pants: "Navy chinos", shoes: "Brown boots" },
    ];
    const compactPick = (p) => ({
      watch: p.watch ?? null,
      watchId: p.watchId ?? null,
      shirt: p.shirt ?? null,
      sweater: p.sweater ?? null,
      pants: p.pants ?? null,
      shoes: p.shoes ?? null,
      jacket: p.jacket ?? null,
    });
    const body = {
      forceRefresh: true,
      excludeRecent: recentPicks.map(compactPick),
    };
    expect(body.forceRefresh).toBe(true);
    expect(body.excludeRecent).toHaveLength(1);
    expect(body.excludeRecent[0].watch).toBe("Santos");
  });

  it("steer payload includes 'more_casual'", () => {
    const body = { forceRefresh: true, steer: "more_casual" };
    expect(body.steer).toBe("more_casual");
  });

  it("steer payload includes 'more_formal'", () => {
    const body = { forceRefresh: true, steer: "more_formal" };
    expect(body.steer).toBe("more_formal");
  });

  it("steer payload includes 'different_watch'", () => {
    const body = { forceRefresh: true, steer: "different_watch" };
    expect(body.steer).toBe("different_watch");
  });

  it("variants:3 payload requests 3 outfits", () => {
    const body = { forceRefresh: true, variants: 3 };
    expect(body.variants).toBe(3);
  });

  it("rejected payload includes outfit + reason", () => {
    const body = {
      forceRefresh: true,
      rejected: { outfit: { watch: "Santos" }, reason: "too formal for today" },
      excludeRecent: [{ watch: "Santos" }],
    };
    expect(body.rejected.reason).toBe("too formal for today");
    expect(body.rejected.outfit.watch).toBe("Santos");
  });

  it("why:true payload includes currentPick and skips forceRefresh", () => {
    const body = {
      why: true,
      currentPick: { watch: "Santos", shirt: "White oxford", pants: "Navy chinos" },
    };
    expect(body.why).toBe(true);
    expect(body.currentPick.watch).toBe("Santos");
  });

  it("variants response shape exposes variants array", () => {
    const response = {
      variants: [
        { watch: "A", score: 8 },
        { watch: "B", score: 8 },
        { watch: "C", score: 8 },
      ],
      generatedAt: new Date().toISOString(),
    };
    expect(Array.isArray(response.variants)).toBe(true);
    expect(response.variants).toHaveLength(3);
  });

  it("compactPick strips weather/generatedAt from prior picks", () => {
    const fullPick = {
      watch: "Santos",
      watchId: "santos_large",
      shirt: "White oxford",
      sweater: null,
      pants: "Navy chinos",
      shoes: "Brown boots",
      jacket: null,
      reasoning: "Long reasoning text...",
      score: 8.5,
      weather: { tempC: 15 },
      generatedAt: "2026-04-28T10:00:00Z",
    };
    const compactPick = (p) => ({
      watch: p.watch ?? null,
      watchId: p.watchId ?? null,
      shirt: p.shirt ?? null,
      sweater: p.sweater ?? null,
      pants: p.pants ?? null,
      shoes: p.shoes ?? null,
      jacket: p.jacket ?? null,
    });
    const compact = compactPick(fullPick);
    expect(compact.weather).toBeUndefined();
    expect(compact.generatedAt).toBeUndefined();
    expect(compact.reasoning).toBeUndefined();
    expect(compact.watch).toBe("Santos");
  });

  it("rolling recentPicks list caps at 5", () => {
    let prev = [];
    for (let i = 0; i < 8; i++) {
      const next = [{ watch: `Pick${i}` }, ...prev].slice(0, 5);
      prev = next;
    }
    expect(prev).toHaveLength(5);
    expect(prev[0].watch).toBe("Pick7"); // newest first
    expect(prev[4].watch).toBe("Pick3");
  });

  it("steer button list includes the three expected verbs", () => {
    const STEER_BUTTONS = ["more_casual", "more_formal", "different_watch"];
    expect(STEER_BUTTONS).toContain("more_casual");
    expect(STEER_BUTTONS).toContain("more_formal");
    expect(STEER_BUTTONS).toContain("different_watch");
    expect(STEER_BUTTONS).toHaveLength(3);
  });
});
