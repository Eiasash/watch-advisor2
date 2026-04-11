import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Extract and test the pure logic from useRecommendationEngine.
// The hook uses useState/useEffect + dynamic import, so we replicate its
// internal logic (ACCESSORY_TYPES filter, watch scoring + sorting, outfit
// building) in testable form and mock the imported modules.
// ---------------------------------------------------------------------------

// ── Mock the engine imports ───────────────────────────────────────────────
let scoreWatchForDayMock = vi.fn(() => 5);
let buildTomorrowContextMock = vi.fn((params) => ({
  date: "2026-04-12",
  history: params.history,
  garments: params.garments,
  watches: params.watches,
  tempC: params.forecastTempC ?? null,
}));
let forecastRecommendationMock = vi.fn((engine, ctx) => {
  if (!engine || !ctx) return null;
  return engine(ctx);
});
let buildOutfitMock = vi.fn(() => ({ shirt: "s1", pants: "p1", shoes: "sh1" }));

vi.mock("../src/engine/dayProfile.js", () => ({
  scoreWatchForDay: (...args) => scoreWatchForDayMock(...args),
}));

vi.mock("../src/domain/scenarioForecast.js", () => ({
  buildTomorrowContext: (...args) => buildTomorrowContextMock(...args),
  forecastRecommendation: (...args) => forecastRecommendationMock(...args),
}));

// ── Replicate the hook's pure logic for direct testing ────────────────────

const ACCESSORY_TYPES = new Set([
  "outfit-photo", "outfit-shot", "belt", "sunglasses", "hat", "scarf", "bag", "accessory",
]);

function filterWearable(garments) {
  return garments.filter(g => !ACCESSORY_TYPES.has(g.type) && !g.excludeFromWardrobe);
}

function scoreSortWatches(watches, entries) {
  return watches
    .map(w => ({ watch: w, score: scoreWatchForDayMock(w, "smart-casual", entries) }))
    .sort((a, b) => b.score - a.score);
}

function pickBestWatch(watches, entries) {
  const sorted = scoreSortWatches(watches, entries);
  return sorted[0]?.watch ?? watches[0];
}

function buildTomorrowPreview({ watches, garments, entries, weather }) {
  const wearable = filterWearable(garments);
  if (!watches.length || !wearable.length) return null;

  const ctx = buildTomorrowContextMock({
    history: entries,
    garments: wearable,
    watches,
    forecastTempC: weather?.tempC ?? null,
  });

  const bestWatch = pickBestWatch(watches, entries);

  const outfit = forecastRecommendationMock(
    (c) => buildOutfitMock(bestWatch, c.garments, { tempC: c.tempC ?? 18 }, c.history, [], {}, {}, "smart-casual"),
    ctx,
  );

  return outfit ? { watch: bestWatch, outfit } : null;
}

// ── Test data ─────────────────────────────────────────────────────────────

const makeWatch = (id, extra = {}) => ({ id, name: `Watch ${id}`, formality: 7, style: "sport-elegant", ...extra });
const makeGarment = (id, type, extra = {}) => ({ id, name: `${type} ${id}`, type, color: "navy", excludeFromWardrobe: false, ...extra });

describe("useRecommendationEngine — ACCESSORY_TYPES filter", () => {
  it("contains all 8 accessory types", () => {
    expect(ACCESSORY_TYPES.size).toBe(8);
    expect(ACCESSORY_TYPES.has("outfit-photo")).toBe(true);
    expect(ACCESSORY_TYPES.has("outfit-shot")).toBe(true);
    expect(ACCESSORY_TYPES.has("belt")).toBe(true);
    expect(ACCESSORY_TYPES.has("sunglasses")).toBe(true);
    expect(ACCESSORY_TYPES.has("hat")).toBe(true);
    expect(ACCESSORY_TYPES.has("scarf")).toBe(true);
    expect(ACCESSORY_TYPES.has("bag")).toBe(true);
    expect(ACCESSORY_TYPES.has("accessory")).toBe(true);
  });

  it("does not include wearable types (shirt, pants, shoes, etc.)", () => {
    expect(ACCESSORY_TYPES.has("shirt")).toBe(false);
    expect(ACCESSORY_TYPES.has("pants")).toBe(false);
    expect(ACCESSORY_TYPES.has("shoes")).toBe(false);
    expect(ACCESSORY_TYPES.has("jacket")).toBe(false);
    expect(ACCESSORY_TYPES.has("sweater")).toBe(false);
  });

  it("filters accessories out of garments list", () => {
    const garments = [
      makeGarment("g1", "shirt"),
      makeGarment("g2", "belt"),
      makeGarment("g3", "pants"),
      makeGarment("g4", "sunglasses"),
      makeGarment("g5", "shoes"),
      makeGarment("g6", "hat"),
      makeGarment("g7", "jacket"),
      makeGarment("g8", "accessory"),
    ];
    const wearable = filterWearable(garments);
    expect(wearable).toHaveLength(4);
    expect(wearable.map(g => g.type)).toEqual(["shirt", "pants", "shoes", "jacket"]);
  });

  it("filters garments with excludeFromWardrobe=true", () => {
    const garments = [
      makeGarment("g1", "shirt", { excludeFromWardrobe: true }),
      makeGarment("g2", "pants"),
    ];
    const wearable = filterWearable(garments);
    expect(wearable).toHaveLength(1);
    expect(wearable[0].id).toBe("g2");
  });

  it("returns empty for all-accessory garments", () => {
    const garments = [
      makeGarment("g1", "belt"),
      makeGarment("g2", "sunglasses"),
      makeGarment("g3", "bag"),
    ];
    expect(filterWearable(garments)).toHaveLength(0);
  });
});

describe("useRecommendationEngine — watch scoring + sorting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scoreWatchForDayMock = vi.fn(() => 5);
  });

  it("scores all watches and sorts by score descending", () => {
    scoreWatchForDayMock = vi.fn()
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(8)
      .mockReturnValueOnce(5);

    const watches = [makeWatch("w1"), makeWatch("w2"), makeWatch("w3")];
    const sorted = scoreSortWatches(watches, []);
    expect(sorted[0].watch.id).toBe("w2");
    expect(sorted[0].score).toBe(8);
    expect(sorted[1].watch.id).toBe("w3");
    expect(sorted[2].watch.id).toBe("w1");
  });

  it("picks best watch (highest score)", () => {
    scoreWatchForDayMock = vi.fn()
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(9);

    const watches = [makeWatch("w1"), makeWatch("w2")];
    const best = pickBestWatch(watches, []);
    expect(best.id).toBe("w2");
  });

  it("falls back to first watch when scores are equal", () => {
    scoreWatchForDayMock = vi.fn(() => 5);
    const watches = [makeWatch("alpha"), makeWatch("beta")];
    const best = pickBestWatch(watches, []);
    expect(best.id).toBe("alpha");
  });

  it("passes history entries to scoreWatchForDay", () => {
    const entries = [{ id: "h1", watchId: "w1", date: "2026-04-10" }];
    const watches = [makeWatch("w1")];
    scoreSortWatches(watches, entries);
    expect(scoreWatchForDayMock).toHaveBeenCalledWith(watches[0], "smart-casual", entries);
  });
});

describe("useRecommendationEngine — buildTomorrowPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scoreWatchForDayMock = vi.fn(() => 7);
    buildTomorrowContextMock = vi.fn((params) => ({
      date: "2026-04-12",
      history: params.history,
      garments: params.garments,
      watches: params.watches,
      tempC: params.forecastTempC ?? null,
    }));
    forecastRecommendationMock = vi.fn((engine, ctx) => {
      if (!engine || !ctx) return null;
      return engine(ctx);
    });
    buildOutfitMock = vi.fn(() => ({ shirt: "s1", pants: "p1", shoes: "sh1" }));
  });

  it("returns null when watches array is empty", () => {
    const result = buildTomorrowPreview({
      watches: [],
      garments: [makeGarment("g1", "shirt")],
      entries: [],
      weather: { tempC: 20 },
    });
    expect(result).toBeNull();
  });

  it("returns null when no wearable garments (all accessories)", () => {
    const result = buildTomorrowPreview({
      watches: [makeWatch("w1")],
      garments: [makeGarment("g1", "belt"), makeGarment("g2", "hat")],
      entries: [],
      weather: { tempC: 20 },
    });
    expect(result).toBeNull();
  });

  it("returns null when garments array is empty", () => {
    const result = buildTomorrowPreview({
      watches: [makeWatch("w1")],
      garments: [],
      entries: [],
      weather: null,
    });
    expect(result).toBeNull();
  });

  it("returns { watch, outfit } with valid data", () => {
    const result = buildTomorrowPreview({
      watches: [makeWatch("w1")],
      garments: [makeGarment("g1", "shirt"), makeGarment("g2", "pants"), makeGarment("g3", "shoes")],
      entries: [],
      weather: { tempC: 22 },
    });
    expect(result).not.toBeNull();
    expect(result.watch.id).toBe("w1");
    expect(result.outfit).toEqual({ shirt: "s1", pants: "p1", shoes: "sh1" });
  });

  it("calls buildTomorrowContext with filtered wearable garments", () => {
    buildTomorrowPreview({
      watches: [makeWatch("w1")],
      garments: [
        makeGarment("g1", "shirt"),
        makeGarment("g2", "belt"),       // accessory — should be filtered
        makeGarment("g3", "pants"),
      ],
      entries: [],
      weather: { tempC: 18 },
    });

    expect(buildTomorrowContextMock).toHaveBeenCalledTimes(1);
    const ctxArg = buildTomorrowContextMock.mock.calls[0][0];
    expect(ctxArg.garments).toHaveLength(2);
    expect(ctxArg.garments.map(g => g.type)).toEqual(["shirt", "pants"]);
  });

  it("uses weather tempC (null when weather is undefined)", () => {
    buildTomorrowPreview({
      watches: [makeWatch("w1")],
      garments: [makeGarment("g1", "shirt")],
      entries: [],
      weather: undefined,
    });

    const ctxArg = buildTomorrowContextMock.mock.calls[0][0];
    expect(ctxArg.forecastTempC).toBeNull();
  });

  it("returns null when forecastRecommendation returns null", () => {
    forecastRecommendationMock = vi.fn(() => null);

    const result = buildTomorrowPreview({
      watches: [makeWatch("w1")],
      garments: [makeGarment("g1", "shirt")],
      entries: [],
      weather: { tempC: 20 },
    });
    expect(result).toBeNull();
  });

  it("selects highest-scoring watch from multiple", () => {
    scoreWatchForDayMock = vi.fn()
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(6);

    const result = buildTomorrowPreview({
      watches: [makeWatch("w1"), makeWatch("w2"), makeWatch("w3")],
      garments: [makeGarment("g1", "shirt"), makeGarment("g2", "pants")],
      entries: [],
      weather: { tempC: 20 },
    });

    expect(result.watch.id).toBe("w2");
  });
});
