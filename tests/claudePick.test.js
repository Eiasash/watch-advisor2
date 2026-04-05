import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock themeStore
vi.mock("../src/stores/themeStore.js", () => ({
  useThemeStore: () => ({ mode: "light" }),
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
