import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const GARMENT_PRIORITY = ["shoes", "pants", "shirt", "sweater", "jacket", "coat"];

function daysSinceWorn(watchId, history) {
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < history.length; i++) {
    if (history[i].watchId === watchId) {
      const d = history[i].date;
      if (!d) continue;
      const diff = Math.round((new Date(today) - new Date(d)) / 86400000);
      return diff;
    }
  }
  return null;
}

function computeGarmentTypes(garments) {
  const activeGarments = garments.filter(g => !g.excludeFromWardrobe && g.type !== "outfit-photo" && g.type !== "outfit-shot");
  const types = new Set(activeGarments.map(g => (g.type ?? "").toLowerCase()).filter(Boolean));
  return ["all", ...GARMENT_PRIORITY.filter(t => types.has(t)), ...[...types].filter(t => !GARMENT_PRIORITY.includes(t))];
}

describe("TodayPanel — daysSinceWorn", () => {
  it("returns null for never-worn watch", () => {
    const history = [
      { watchId: "w2", date: "2026-03-01" },
      { watchId: "w3", date: "2026-03-05" },
    ];
    expect(daysSinceWorn("w1", history)).toBe(null);
  });

  it("returns 0 for watch worn today", () => {
    const today = new Date().toISOString().slice(0, 10);
    const history = [{ watchId: "w1", date: today }];
    expect(daysSinceWorn("w1", history)).toBe(0);
  });

  it("returns correct days since last wear", () => {
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const dateStr = threeDaysAgo.toISOString().slice(0, 10);
    const history = [{ watchId: "w1", date: dateStr }];
    expect(daysSinceWorn("w1", history)).toBe(3);
  });

  it("skips entries without date", () => {
    const today = new Date();
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const history = [
      { watchId: "w1", date: null },
      { watchId: "w1", date: twoDaysAgo.toISOString().slice(0, 10) },
    ];
    expect(daysSinceWorn("w1", history)).toBe(2);
  });
});

describe("TodayPanel — computeGarmentTypes", () => {
  it("always starts with 'all'", () => {
    const result = computeGarmentTypes([]);
    expect(result[0]).toBe("all");
  });

  it("priority ordering: shoes, pants, shirt before sweater, jacket", () => {
    const garments = [
      { id: "1", type: "jacket", excludeFromWardrobe: false },
      { id: "2", type: "shirt", excludeFromWardrobe: false },
      { id: "3", type: "shoes", excludeFromWardrobe: false },
      { id: "4", type: "pants", excludeFromWardrobe: false },
      { id: "5", type: "sweater", excludeFromWardrobe: false },
    ];
    const result = computeGarmentTypes(garments);
    expect(result).toEqual(["all", "shoes", "pants", "shirt", "sweater", "jacket"]);
  });

  it("excludes outfit-photo type from tabs", () => {
    const garments = [
      { id: "1", type: "shirt", excludeFromWardrobe: false },
      { id: "2", type: "outfit-photo", excludeFromWardrobe: false },
    ];
    const result = computeGarmentTypes(garments);
    expect(result).toContain("shirt");
    expect(result).not.toContain("outfit-photo");
  });

  it("non-priority types appear at end after priority types", () => {
    const garments = [
      { id: "1", type: "shirt", excludeFromWardrobe: false },
      { id: "2", type: "belt", excludeFromWardrobe: false },
      { id: "3", type: "shoes", excludeFromWardrobe: false },
      { id: "4", type: "hat", excludeFromWardrobe: false },
    ];
    const result = computeGarmentTypes(garments);
    // Priority types first (in priority order), then non-priority
    const shirtIdx = result.indexOf("shirt");
    const shoesIdx = result.indexOf("shoes");
    const beltIdx = result.indexOf("belt");
    const hatIdx = result.indexOf("hat");
    expect(shoesIdx).toBeLessThan(shirtIdx); // shoes before shirt in priority
    expect(shirtIdx).toBeLessThan(beltIdx);  // priority before non-priority
    expect(shirtIdx).toBeLessThan(hatIdx);
  });
});
