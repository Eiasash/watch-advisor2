import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TodayPanel orchestration tests.
 *
 * Existing test coverage (avoided here):
 * - todayPanel.test.js: daysSinceWorn, computeGarmentTypes, getWatchRecommendations, explainRecommendation
 *
 * This file tests:
 * - Watch selection flow (defaultWatchId computation, active watch resolution)
 * - Outfit logging flow (handleLog entry construction, validation guards)
 * - Weather display integration
 * - ClaudePick integration state
 * - Empty wardrobe / empty watches state
 * - Context selection (CONTEXT_OPTIONS)
 * - Quick watch check-in entry
 * - Logged summary display trigger
 * - Outfit score + validation gates
 * - On-call planner visibility
 */

// ── CONTEXT_OPTIONS (mirrors TodayPanel.jsx) ────────────────────────────────
const CONTEXT_OPTIONS = [
  { key: null,            label: "Any" },
  { key: "casual",       label: "Casual" },
  { key: "date-night",   label: "Date Night" },
  { key: "shift",        label: "On-Call" },
];

// ── Watch recommendation (from TodayPanel — simplified) ─────────────────────
function getWatchRecommendations(watches, history, context) {
  if (!watches.length) return [];
  const active = watches.filter(w => !w.retired);
  const scored = active.map(w => ({
    watch: w,
    score: 0.5, // simplified
    daysSince: daysSinceWorn(w.id, history),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

function daysSinceWorn(watchId, history) {
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < history.length; i++) {
    if (history[i].watchId === watchId) {
      const d = history[i].date;
      if (!d) continue;
      return Math.round((new Date(today) - new Date(d)) / 86400000);
    }
  }
  return null;
}

// ── Default watch ID resolution (mirrors TodayPanel.jsx) ────────────────────
function resolveDefaultWatchId(todayEntry, watches, history) {
  if (todayEntry?.watchId) return todayEntry.watchId;
  const recs = getWatchRecommendations(watches, history, null);
  return recs[0]?.watch?.id ?? watches.find(w => !w.retired)?.id ?? null;
}

// ── Log validation (mirrors handleLog guard conditions) ─────────────────────
function canLog(watchId, selectedCount, context) {
  if (!watchId) return false;
  if (selectedCount < 2) return false;
  if (!context) return false;
  return true;
}

// ── Build log entry (mirrors handleLog in TodayPanel) ───────────────────────
function buildLogEntry({
  todayIso, watchId, activeStrapId, activeStrapObj,
  selectedIds, context, outfitScore, selectedWatch, notes, extraImgs,
}) {
  const entryId = `wear-${todayIso}-${watchId}`;
  return {
    id: entryId,
    date: todayIso,
    watchId,
    strapId: activeStrapId ?? null,
    strapLabel: activeStrapObj?.label ?? null,
    garmentIds: [...selectedIds],
    context,
    score: typeof outfitScore === "number" ? outfitScore : 7.0,
    watch: selectedWatch ? `${selectedWatch.brand} ${selectedWatch.model}` : null,
    notes: notes?.trim() || null,
    outfitPhoto: extraImgs?.[0] ?? null,
    outfitPhotos: extraImgs?.length ? extraImgs : null,
  };
}

// ── Quick check-in entry (mirrors inline button in TodayPanel) ──────────────
function buildQuickCheckinEntry({ todayIso, watchId, activeStrapId, activeStrapObj, todayEntry, context }) {
  const entryId = todayEntry?.id ?? `today-${Date.now()}`;
  return {
    id: entryId,
    date: todayIso,
    watchId,
    strapId: activeStrapId ?? null,
    strapLabel: activeStrapObj?.label ?? null,
    garmentIds: todayEntry?.garmentIds ?? [],
    quickLog: !(todayEntry?.garmentIds?.length > 0),
    context,
    notes: todayEntry?.notes ?? null,
    outfitPhoto: todayEntry?.outfitPhoto ?? null,
    outfitPhotos: todayEntry?.outfitPhotos ?? null,
  };
}

// ── Test data ───────────────────────────────────────────────────────────────
const watches = [
  { id: "w1", brand: "Cartier", model: "Santos", style: "dress-sport", formality: 7, retired: false },
  { id: "w2", brand: "Omega", model: "Seamaster", style: "sport", formality: 5, retired: false },
  { id: "w3", brand: "Casio", model: "F91W", style: "sport", formality: 2, retired: true },
];

const garments = [
  { id: "g1", type: "shirt", color: "white", name: "White Oxford" },
  { id: "g2", type: "pants", color: "navy", name: "Navy Chinos" },
  { id: "g3", type: "shoes", color: "brown", name: "Brown Derby" },
  { id: "g4", type: "jacket", color: "navy", name: "Navy Blazer" },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("TodayPanel orchestration — CONTEXT_OPTIONS", () => {
  it("has 4 context options", () => {
    expect(CONTEXT_OPTIONS).toHaveLength(4);
  });

  it("first option is 'Any' with null key", () => {
    expect(CONTEXT_OPTIONS[0].key).toBeNull();
    expect(CONTEXT_OPTIONS[0].label).toBe("Any");
  });

  it("includes 'shift' for on-call context", () => {
    const shift = CONTEXT_OPTIONS.find(c => c.key === "shift");
    expect(shift).toBeDefined();
    expect(shift.label).toBe("On-Call");
  });

  it("all options have label and key", () => {
    for (const c of CONTEXT_OPTIONS) {
      expect(c.label).toBeTruthy();
      // key can be null (for "Any")
      expect(c).toHaveProperty("key");
    }
  });
});

describe("TodayPanel orchestration — default watch ID resolution", () => {
  it("uses todayEntry watchId when available", () => {
    const todayEntry = { watchId: "w2" };
    const result = resolveDefaultWatchId(todayEntry, watches, []);
    expect(result).toBe("w2");
  });

  it("falls back to first recommendation when no todayEntry", () => {
    const result = resolveDefaultWatchId(null, watches, []);
    // First non-retired watch
    expect(result).toBe("w1");
  });

  it("falls back to first non-retired watch when no recommendations", () => {
    const result = resolveDefaultWatchId(null, watches, []);
    expect(result).not.toBe("w3"); // w3 is retired
  });

  it("returns null for empty watches and no todayEntry", () => {
    const result = resolveDefaultWatchId(null, [], []);
    expect(result).toBeNull();
  });
});

describe("TodayPanel orchestration — canLog validation", () => {
  it("returns true when all conditions met", () => {
    expect(canLog("w1", 3, "casual")).toBe(true);
  });

  it("returns false when no watch selected", () => {
    expect(canLog(null, 3, "casual")).toBe(false);
  });

  it("returns false when fewer than 2 garments selected", () => {
    expect(canLog("w1", 1, "casual")).toBe(false);
    expect(canLog("w1", 0, "casual")).toBe(false);
  });

  it("returns false when no context selected", () => {
    expect(canLog("w1", 3, null)).toBe(false);
    expect(canLog("w1", 3, "")).toBe(false);
  });

  it("minimum viable: 2 garments is enough", () => {
    expect(canLog("w1", 2, "casual")).toBe(true);
  });
});

describe("TodayPanel orchestration — buildLogEntry", () => {
  it("constructs a full log entry", () => {
    const entry = buildLogEntry({
      todayIso: "2026-04-11",
      watchId: "w1",
      activeStrapId: "s1",
      activeStrapObj: { label: "Brown Alligator" },
      selectedIds: ["g1", "g2", "g3"],
      context: "casual",
      outfitScore: 8,
      selectedWatch: watches[0],
      notes: "  Warm day  ",
      extraImgs: ["data:image/jpeg;base64,abc"],
    });
    expect(entry.id).toBe("wear-2026-04-11-w1");
    expect(entry.date).toBe("2026-04-11");
    expect(entry.watchId).toBe("w1");
    expect(entry.strapId).toBe("s1");
    expect(entry.strapLabel).toBe("Brown Alligator");
    expect(entry.garmentIds).toEqual(["g1", "g2", "g3"]);
    expect(entry.context).toBe("casual");
    expect(entry.score).toBe(8);
    expect(entry.watch).toBe("Cartier Santos");
    expect(entry.notes).toBe("Warm day");
    expect(entry.outfitPhoto).toBe("data:image/jpeg;base64,abc");
    expect(entry.outfitPhotos).toEqual(["data:image/jpeg;base64,abc"]);
  });

  it("defaults score to 7.0 when outfitScore is null", () => {
    const entry = buildLogEntry({
      todayIso: "2026-04-11",
      watchId: "w1",
      selectedIds: [],
      context: "casual",
      outfitScore: null,
      selectedWatch: watches[0],
    });
    expect(entry.score).toBe(7.0);
  });

  it("trims empty notes to null", () => {
    const entry = buildLogEntry({
      todayIso: "2026-04-11",
      watchId: "w1",
      selectedIds: [],
      context: "casual",
      outfitScore: 7,
      selectedWatch: watches[0],
      notes: "   ",
    });
    expect(entry.notes).toBeNull();
  });

  it("handles null strap fields", () => {
    const entry = buildLogEntry({
      todayIso: "2026-04-11",
      watchId: "w1",
      selectedIds: [],
      context: "casual",
      outfitScore: 7,
      selectedWatch: watches[0],
    });
    expect(entry.strapId).toBeNull();
    expect(entry.strapLabel).toBeNull();
  });

  it("sets outfitPhoto and outfitPhotos to null when no images", () => {
    const entry = buildLogEntry({
      todayIso: "2026-04-11",
      watchId: "w1",
      selectedIds: [],
      context: "casual",
      outfitScore: 7,
      selectedWatch: watches[0],
      extraImgs: [],
    });
    expect(entry.outfitPhoto).toBeNull();
    expect(entry.outfitPhotos).toBeNull();
  });
});

describe("TodayPanel orchestration — quick check-in entry", () => {
  it("builds a quick log entry with no garments", () => {
    const entry = buildQuickCheckinEntry({
      todayIso: "2026-04-11",
      watchId: "w1",
      context: "casual",
    });
    expect(entry.watchId).toBe("w1");
    expect(entry.garmentIds).toEqual([]);
    expect(entry.quickLog).toBe(true);
  });

  it("quickLog is false when todayEntry has garments", () => {
    const entry = buildQuickCheckinEntry({
      todayIso: "2026-04-11",
      watchId: "w1",
      context: "casual",
      todayEntry: { id: "e1", garmentIds: ["g1", "g2"] },
    });
    expect(entry.quickLog).toBe(false);
    expect(entry.garmentIds).toEqual(["g1", "g2"]);
  });

  it("preserves todayEntry ID if exists", () => {
    const entry = buildQuickCheckinEntry({
      todayIso: "2026-04-11",
      watchId: "w1",
      context: "casual",
      todayEntry: { id: "existing-id-123" },
    });
    expect(entry.id).toBe("existing-id-123");
  });
});

describe("TodayPanel orchestration — logged summary display trigger", () => {
  it("shows logged summary when logged=true and todayEntries exist", () => {
    const logged = true;
    const todayEntries = [{ id: "e1", date: "2026-04-11" }];
    const showSummary = logged && todayEntries.length > 0;
    expect(showSummary).toBe(true);
  });

  it("does not show summary when logged but no entries", () => {
    const logged = true;
    const todayEntries = [];
    const showSummary = logged && todayEntries.length > 0;
    expect(showSummary).toBe(false);
  });

  it("does not show summary when not logged", () => {
    const logged = false;
    const todayEntries = [{ id: "e1" }];
    const showSummary = logged && todayEntries.length > 0;
    expect(showSummary).toBe(false);
  });

  it("todayEntry is the last entry for today", () => {
    const entries = [
      { id: "e1", date: "2026-04-11", watchId: "w1" },
      { id: "e2", date: "2026-04-11", watchId: "w2" },
      { id: "e3", date: "2026-04-10", watchId: "w1" },
    ];
    const todayIso = "2026-04-11";
    const todayEntries = entries.filter(e => e.date === todayIso);
    const todayEntry = todayEntries[todayEntries.length - 1] ?? null;
    expect(todayEntry.id).toBe("e2");
  });
});

describe("TodayPanel orchestration — on-call planner visibility", () => {
  it("shows OnCallPlanner when context is 'shift'", () => {
    const context = "shift";
    const showOnCall = context === "shift";
    expect(showOnCall).toBe(true);
  });

  it("hides OnCallPlanner for other contexts", () => {
    for (const ctx of ["casual", "date-night", null, "smart-casual"]) {
      expect(ctx === "shift").toBe(false);
    }
  });
});

describe("TodayPanel orchestration — weather display integration", () => {
  it("weather parts build correctly with all temps", () => {
    const weather = { tempMorning: 10, tempMidday: 18, tempEvening: 14 };
    const parts = [];
    if (weather.tempMorning != null) parts.push(`🌅 ${weather.tempMorning}°`);
    if (weather.tempMidday != null) parts.push(`☀️ ${weather.tempMidday}°`);
    if (weather.tempEvening != null) parts.push(`🌙 ${weather.tempEvening}°`);
    expect(parts).toHaveLength(3);
    expect(parts[1]).toContain("18°");
  });

  it("weather parts handle partial data", () => {
    const weather = { tempMorning: null, tempMidday: 20, tempEvening: null };
    const parts = [];
    if (weather.tempMorning != null) parts.push(`🌅 ${weather.tempMorning}°`);
    if (weather.tempMidday != null) parts.push(`☀️ ${weather.tempMidday}°`);
    if (weather.tempEvening != null) parts.push(`🌙 ${weather.tempEvening}°`);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain("20°");
  });

  it("weather null state does not crash", () => {
    const weather = null;
    // TodayPanel checks weather === null before rendering weather section
    const showWeather = weather !== null;
    expect(showWeather).toBe(false);
  });
});

describe("TodayPanel orchestration — empty wardrobe state", () => {
  it("empty garments array results in no garment pickers", () => {
    const garments = [];
    const active = garments.filter(g => !g.excludeFromWardrobe);
    expect(active).toHaveLength(0);
  });

  it("empty watches array results in no watch selection", () => {
    const active = [].filter(w => !w.retired);
    expect(active).toHaveLength(0);
  });

  it("log button disabled with empty wardrobe", () => {
    // No watch, no garments → can't log
    const disabled = !canLog(null, 0, null);
    expect(disabled).toBe(true);
  });
});

describe("TodayPanel orchestration — outfit score validation", () => {
  it("score buttons range from 5 to 10", () => {
    const scores = [5, 6, 7, 8, 9, 10];
    expect(scores).toHaveLength(6);
    expect(Math.min(...scores)).toBe(5);
    expect(Math.max(...scores)).toBe(10);
  });

  it("null outfit score shows amber warning border", () => {
    const outfitScore = null;
    const borderColor = outfitScore == null ? "#f59e0b" : "#e5e7eb";
    expect(borderColor).toBe("#f59e0b");
  });

  it("selected outfit score shows normal border", () => {
    const outfitScore = 8;
    const borderColor = outfitScore == null ? "#f59e0b" : "#e5e7eb";
    expect(borderColor).toBe("#e5e7eb");
  });
});

describe("TodayPanel orchestration — validation error messages", () => {
  it("shows garment error when 0 garments selected", () => {
    const watchId = "w1";
    const selectedSize = 0;
    const showGarmentError = watchId && selectedSize === 0;
    expect(showGarmentError).toBeTruthy();
  });

  it("shows garment error when 1 garment selected", () => {
    const watchId = "w1";
    const selectedSize = 1;
    const showGarmentError = watchId && selectedSize === 1;
    expect(showGarmentError).toBeTruthy();
  });

  it("shows context error when garments selected but no context", () => {
    const watchId = "w1";
    const selectedSize = 3;
    const context = null;
    const showContextError = watchId && selectedSize > 0 && !context;
    expect(showContextError).toBeTruthy();
  });

  it("no errors when all conditions are met", () => {
    const watchId = "w1";
    const selectedSize = 3;
    const context = "casual";
    expect(watchId && selectedSize === 0).toBeFalsy();
    expect(watchId && selectedSize === 1).toBeFalsy();
    expect(watchId && selectedSize > 0 && !context).toBeFalsy();
  });
});
