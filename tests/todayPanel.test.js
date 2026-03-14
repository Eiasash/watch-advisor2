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

  it("excludes outfit-shot type from tabs", () => {
    const garments = [
      { id: "1", type: "pants", excludeFromWardrobe: false },
      { id: "2", type: "outfit-shot", excludeFromWardrobe: false },
    ];
    const result = computeGarmentTypes(garments);
    expect(result).toContain("pants");
    expect(result).not.toContain("outfit-shot");
  });

  it("excludes garments with excludeFromWardrobe flag", () => {
    const garments = [
      { id: "1", type: "shirt", excludeFromWardrobe: false },
      { id: "2", type: "jacket", excludeFromWardrobe: true },
    ];
    const result = computeGarmentTypes(garments);
    expect(result).toContain("shirt");
    expect(result).not.toContain("jacket");
  });

  it("handles garments with null/undefined type", () => {
    const garments = [
      { id: "1", type: null, excludeFromWardrobe: false },
      { id: "2", type: undefined, excludeFromWardrobe: false },
      { id: "3", type: "shoes", excludeFromWardrobe: false },
    ];
    const result = computeGarmentTypes(garments);
    expect(result).toEqual(["all", "shoes"]);
  });

  it("deduplicates types from multiple garments", () => {
    const garments = [
      { id: "1", type: "shirt", excludeFromWardrobe: false },
      { id: "2", type: "shirt", excludeFromWardrobe: false },
      { id: "3", type: "pants", excludeFromWardrobe: false },
    ];
    const result = computeGarmentTypes(garments);
    // "shirt" should appear only once
    expect(result.filter(t => t === "shirt")).toHaveLength(1);
    expect(result).toEqual(["all", "pants", "shirt"]);
  });

  it("normalizes types to lowercase", () => {
    const garments = [
      { id: "1", type: "Shirt", excludeFromWardrobe: false },
      { id: "2", type: "PANTS", excludeFromWardrobe: false },
    ];
    const result = computeGarmentTypes(garments);
    expect(result).toContain("shirt");
    expect(result).toContain("pants");
    expect(result).not.toContain("Shirt");
    expect(result).not.toContain("PANTS");
  });
});

// ── getWatchRecommendations (copied from TodayPanel.jsx) ─────────────────────

function getWatchRecommendations(watches, history, context) {
  if (!watches.length) return [];
  const scored = watches.map(w => ({
    watch: w,
    score: scoreWatchForDayStub(w, context, history),
    daysSince: daysSinceWorn(w.id, history),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

// Deterministic stub so tests don't depend on external scoring engine
function scoreWatchForDayStub(watch, context, _history) {
  // Simple scoring: higher formality = higher score for formal context
  let score = 0.5;
  if (context === "formal" && watch.formality >= 7) score = 0.9;
  if (context === "casual" && watch.formality <= 4) score = 0.85;
  if (watch.style === "dress" && context === "formal") score += 0.05;
  return score;
}

describe("TodayPanel — getWatchRecommendations", () => {
  it("returns empty array for empty watches", () => {
    expect(getWatchRecommendations([], [], "smart-casual")).toEqual([]);
  });

  it("returns at most 3 recommendations", () => {
    const watches = [
      { id: "w1", formality: 5, style: "sport" },
      { id: "w2", formality: 7, style: "dress" },
      { id: "w3", formality: 3, style: "pilot" },
      { id: "w4", formality: 8, style: "dress" },
      { id: "w5", formality: 6, style: "sport-elegant" },
    ];
    const result = getWatchRecommendations(watches, [], "smart-casual");
    expect(result).toHaveLength(3);
  });

  it("returns all watches when fewer than 3", () => {
    const watches = [
      { id: "w1", formality: 5, style: "sport" },
      { id: "w2", formality: 7, style: "dress" },
    ];
    const result = getWatchRecommendations(watches, [], "smart-casual");
    expect(result).toHaveLength(2);
  });

  it("sorts by score descending", () => {
    const watches = [
      { id: "w1", formality: 3, style: "sport" },
      { id: "w2", formality: 9, style: "dress" },
    ];
    const result = getWatchRecommendations(watches, [], "formal");
    // w2 should score higher for formal context
    expect(result[0].watch.id).toBe("w2");
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
  });

  it("includes daysSince in each recommendation", () => {
    const today = new Date().toISOString().slice(0, 10);
    const watches = [{ id: "w1", formality: 5, style: "sport" }];
    const history = [{ watchId: "w1", date: today }];
    const result = getWatchRecommendations(watches, history, "casual");
    expect(result[0].daysSince).toBe(0);
  });

  it("daysSince is null for never-worn watch", () => {
    const watches = [{ id: "w1", formality: 5, style: "sport" }];
    const result = getWatchRecommendations(watches, [], "casual");
    expect(result[0].daysSince).toBe(null);
  });
});

// ── explainRecommendation (copied from TodayPanel.jsx) ───────────────────────

function explainRecommendation(rec, context) {
  const parts = [];
  const w = rec.watch;
  if (w.style) parts.push(`${w.style} style`);
  if (w.formality) parts.push(`formality ${w.formality}/10`);
  if (rec.daysSince === null) parts.push("never worn");
  else if (rec.daysSince >= 7) parts.push(`rested ${rec.daysSince}d`);
  else if (rec.daysSince <= 2) parts.push(`worn ${rec.daysSince}d ago`);
  const STYLE_FIT = {
    "shift":                ["sport-elegant","dress-sport","sport"],
    "hospital-smart-casual":["sport-elegant","dress-sport","sport"],
    "smart-casual":         ["sport-elegant","sport","dress-sport"],
    "formal":               ["dress","dress-sport"],
    "casual":               ["sport","pilot"],
  };
  const fits = STYLE_FIT[context];
  if (fits && w.style && !fits.includes(w.style)) parts.push("⚠ style mismatch");
  if (w.replica && ["hospital-smart-casual", "formal", "shift"].includes(context)) {
    parts.push("replica — consider genuine");
  }
  return parts.join(" · ");
}

describe("TodayPanel — explainRecommendation", () => {
  it("includes style and formality for a watch", () => {
    const rec = { watch: { style: "dress", formality: 8 }, daysSince: null };
    const result = explainRecommendation(rec, "formal");
    expect(result).toContain("dress style");
    expect(result).toContain("formality 8/10");
  });

  it("shows 'never worn' when daysSince is null", () => {
    const rec = { watch: { style: "sport", formality: 5 }, daysSince: null };
    const result = explainRecommendation(rec, "casual");
    expect(result).toContain("never worn");
  });

  it("shows 'rested Xd' for daysSince >= 7", () => {
    const rec = { watch: { style: "sport", formality: 5 }, daysSince: 10 };
    const result = explainRecommendation(rec, "casual");
    expect(result).toContain("rested 10d");
  });

  it("shows 'worn Xd ago' for daysSince <= 2", () => {
    const rec = { watch: { style: "sport", formality: 5 }, daysSince: 1 };
    const result = explainRecommendation(rec, "casual");
    expect(result).toContain("worn 1d ago");
  });

  it("does not show wear info for daysSince between 3 and 6", () => {
    const rec = { watch: { style: "sport", formality: 5 }, daysSince: 4 };
    const result = explainRecommendation(rec, "casual");
    expect(result).not.toContain("rested");
    expect(result).not.toContain("worn");
    expect(result).not.toContain("never worn");
  });

  it("flags style mismatch when watch style doesn't fit context", () => {
    const rec = { watch: { style: "pilot", formality: 5 }, daysSince: null };
    const result = explainRecommendation(rec, "formal");
    expect(result).toContain("⚠ style mismatch");
  });

  it("no mismatch flag when style fits context", () => {
    const rec = { watch: { style: "dress", formality: 8 }, daysSince: null };
    const result = explainRecommendation(rec, "formal");
    expect(result).not.toContain("⚠ style mismatch");
  });

  it("warns about replica in formal/hospital/shift contexts", () => {
    const rec = { watch: { style: "dress", formality: 8, replica: true }, daysSince: null };
    expect(explainRecommendation(rec, "formal")).toContain("replica — consider genuine");
    expect(explainRecommendation(rec, "hospital-smart-casual")).toContain("replica — consider genuine");
    expect(explainRecommendation(rec, "shift")).toContain("replica — consider genuine");
  });

  it("does not warn about replica in casual/smart-casual contexts", () => {
    const rec = { watch: { style: "sport", formality: 3, replica: true }, daysSince: null };
    expect(explainRecommendation(rec, "casual")).not.toContain("replica");
    expect(explainRecommendation(rec, "smart-casual")).not.toContain("replica");
  });

  it("returns empty string for watch with no style or formality and mid-range daysSince", () => {
    const rec = { watch: {}, daysSince: 5 };
    const result = explainRecommendation(rec, "casual");
    expect(result).toBe("");
  });
});

// ── daysSinceWorn edge cases ─────────────────────────────────────────────────

describe("TodayPanel — daysSinceWorn edge cases", () => {
  it("returns null for empty history", () => {
    expect(daysSinceWorn("w1", [])).toBe(null);
  });

  it("returns first matching entry (most recent in history order)", () => {
    const today = new Date();
    const fiveDaysAgo = new Date(today);
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const tenDaysAgo = new Date(today);
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const history = [
      { watchId: "w1", date: fiveDaysAgo.toISOString().slice(0, 10) },
      { watchId: "w1", date: tenDaysAgo.toISOString().slice(0, 10) },
    ];
    // Should return first match (5 days ago)
    expect(daysSinceWorn("w1", history)).toBe(5);
  });
});
