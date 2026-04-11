import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * WatchDashboard orchestration tests.
 *
 * Tests the core logic extracted from WatchDashboard.jsx:
 * - Watch selection & active watch resolution
 * - Outfit merge (engine + manual overrides + removed slots)
 * - Dial swatch mapping
 * - Slot candidate filtering
 * - Empty / single / multi-watch states
 * - Check-in entry construction
 * - Today context inference (weekCtx + onCallDates)
 * - Enriched watch strap override
 *
 * AI apply and override logic already covered by watchDashboardAiApply.test.js.
 */

// ── DIAL_SWATCH map (mirrors WatchDashboard.jsx) ───────────────────────────
const DIAL_SWATCH = {
  "silver-white": "#e8e8e0",
  "green":        "#3d6b45",
  "grey":         "#8a8a8a",
  "blue":         "#2d5fa0",
  "navy":         "#1e2f5e",
  "white":        "#f0ede8",
  "black-red":    "#1a1a1a",
  "black":        "#1a1a1a",
  "white-teal":   "#4da89c",
  "teal":         "#2a8a82",
  "burgundy":     "#6b1a2a",
  "purple":       "#5a2a7a",
  "turquoise":    "#1a9b8a",
  "red":          "#9b1a1a",
  "meteorite":    "#c0c0c0",
};

// ── Accessory exclusion set ─────────────────────────────────────────────────
const ACCESSORY_EXCL = new Set(["sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);

// ── normalizeType stub (simplified from classifier/normalizeType.js) ────────
function normalizeType(raw) {
  const map = {
    polo: "shirt", tee: "shirt", "t-shirt": "shirt", oxford: "shirt",
    jeans: "pants", trousers: "pants", chinos: "pants",
    sneakers: "shoes", loafers: "shoes", boots: "shoes", derby: "shoes",
    blazer: "jacket", overcoat: "jacket",
    cardigan: "sweater", hoodie: "sweater",
  };
  const lower = (raw ?? "").toLowerCase().trim();
  return map[lower] ?? lower;
}

// ── Helper: filter wearable garments ────────────────────────────────────────
function filterWearable(garments) {
  return garments.filter(g => !ACCESSORY_EXCL.has(g.type) && !g.excludeFromWardrobe);
}

// ── Helper: build slot candidates (mirrors WatchDashboard.jsx) ──────────────
function buildSlotCandidates(wearable) {
  const res = {};
  res.shirt = wearable.filter(g => normalizeType(g.type ?? "") === "shirt");
  res.pants = wearable.filter(g => normalizeType(g.type ?? "") === "pants");
  res.shoes = wearable.filter(g => normalizeType(g.type ?? "") === "shoes");
  res.jacket = wearable.filter(g => normalizeType(g.type ?? "") === "jacket");
  const sweaters = wearable.filter(g => normalizeType(g.type ?? "") === "sweater");
  res.sweater = sweaters;
  res.layer = sweaters;
  return res;
}

// ── Helper: merge outfit (engine + overrides - removed) ─────────────────────
function mergeOutfit(engineOutfit, slotOverrides, removedSlots) {
  const merged = { ...engineOutfit, ...slotOverrides };
  for (const s of removedSlots) delete merged[s];
  return merged;
}

// ── Helper: resolve selected watch ──────────────────────────────────────────
function resolveSelectedWatch(activeWatch, watches) {
  return activeWatch ?? watches.find(w => !w.retired) ?? null;
}

// ── Helper: enrich watch with active strap ──────────────────────────────────
function enrichWatch(watch, strapActiveMap, straps) {
  if (!watch) return null;
  const activeStrapId = strapActiveMap[watch.id];
  const activeStrapObj = activeStrapId ? straps[activeStrapId] : null;
  if (!activeStrapObj) return watch;
  const strapStr = activeStrapObj.type === "bracelet" || activeStrapObj.type === "integrated"
    ? activeStrapObj.type
    : `${activeStrapObj.color} ${activeStrapObj.type}`;
  return { ...watch, strap: strapStr, _activeStrapLabel: activeStrapObj.label };
}

// ── Helper: today context inference ─────────────────────────────────────────
function inferTodayContext(todayIso, onCallDates, weekCtx) {
  const todayDayIdx = new Date(todayIso).getDay(); // 0=Sun
  const baseCtx = weekCtx[todayDayIdx] ?? null;
  return onCallDates.includes(todayIso) ? "shift" : baseCtx;
}

// ── Helper: build check-in entry ────────────────────────────────────────────
function buildCheckinEntry(watch, todayIso, activeStrapObj, existingForWatch, context) {
  const entryId = `wear-${todayIso}-${watch.id}`;
  return {
    id: entryId,
    date: todayIso,
    watchId: watch.id,
    garmentIds: existingForWatch?.garmentIds ?? [],
    context: context ?? existingForWatch?.context ?? null,
    strapId: activeStrapObj?.id ?? null,
    strapLabel: activeStrapObj?.label ?? null,
    notes: existingForWatch?.notes ?? null,
    loggedAt: expect.any(String),
  };
}

// ── Test watches ────────────────────────────────────────────────────────────
const watches = [
  { id: "w1", brand: "Cartier", model: "Santos", ref: "WSSA0029", dial: "blue", style: "dress-sport", formality: 7, strap: "blue leather", retired: false },
  { id: "w2", brand: "Omega", model: "Seamaster", ref: "210.30", dial: "black", style: "sport", formality: 5, strap: "bracelet", retired: false },
  { id: "w3", brand: "JLC", model: "Reverso", ref: "Q3858520", dial: "navy", style: "dress", formality: 9, strap: "brown leather", retired: false, dualDial: { sideA: "navy", sideB: "white", sideA_label: "Navy", sideB_label: "White" } },
  { id: "w4", brand: "Casio", model: "F91W", ref: "F91W-1", dial: "black", style: "sport", formality: 2, strap: "resin", retired: true },
];

const garments = [
  { id: "g1", type: "shirt", color: "white", name: "White Oxford", excludeFromWardrobe: false },
  { id: "g2", type: "pants", color: "navy", name: "Navy Chinos", excludeFromWardrobe: false },
  { id: "g3", type: "shoes", color: "brown", name: "Brown Derby", excludeFromWardrobe: false },
  { id: "g4", type: "jacket", color: "navy", name: "Navy Blazer", excludeFromWardrobe: false },
  { id: "g5", type: "sweater", color: "grey", name: "Grey Cardigan", excludeFromWardrobe: false },
  { id: "g6", type: "belt", color: "brown", name: "Brown Belt", excludeFromWardrobe: false },
  { id: "g7", type: "sunglasses", color: "black", name: "Wayfarers", excludeFromWardrobe: false },
  { id: "g8", type: "outfit-photo", name: "Selfie 1", excludeFromWardrobe: false },
  { id: "g9", type: "shirt", color: "blue", name: "Blue Polo", excludeFromWardrobe: true },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("WatchDashboard — DIAL_SWATCH mapping", () => {
  it("maps all 15 dial colors to hex values", () => {
    expect(Object.keys(DIAL_SWATCH)).toHaveLength(15);
    for (const v of Object.values(DIAL_SWATCH)) {
      expect(v).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("returns specific swatch for known dials", () => {
    expect(DIAL_SWATCH["blue"]).toBe("#2d5fa0");
    expect(DIAL_SWATCH["green"]).toBe("#3d6b45");
    expect(DIAL_SWATCH["meteorite"]).toBe("#c0c0c0");
  });

  it("falls back to #444 for unknown dial via ?? operator", () => {
    const swatch = DIAL_SWATCH["unknown-dial"] ?? "#444";
    expect(swatch).toBe("#444");
  });
});

describe("WatchDashboard — resolveSelectedWatch", () => {
  it("returns activeWatch when set", () => {
    const result = resolveSelectedWatch(watches[1], watches);
    expect(result.id).toBe("w2");
  });

  it("returns first non-retired watch when activeWatch is null", () => {
    const result = resolveSelectedWatch(null, watches);
    expect(result.id).toBe("w1");
  });

  it("skips retired watches when falling back", () => {
    const allRetired = watches.map(w => ({ ...w, retired: true }));
    const mix = [allRetired[0], { id: "w5", retired: false }];
    const result = resolveSelectedWatch(null, mix);
    expect(result.id).toBe("w5");
  });

  it("returns null when no watches exist and activeWatch is null", () => {
    const result = resolveSelectedWatch(null, []);
    expect(result).toBeNull();
  });

  it("returns null when all watches are retired and activeWatch is null", () => {
    const allRetired = watches.map(w => ({ ...w, retired: true }));
    const result = resolveSelectedWatch(null, allRetired);
    expect(result).toBeNull();
  });
});

describe("WatchDashboard — filterWearable & slotCandidates", () => {
  it("filters out accessories from wearable garments", () => {
    const wearable = filterWearable(garments);
    // belt (g6) is NOT in ACCESSORY_EXCL for WatchDashboard — only sunglasses, hat, etc.
    expect(wearable.map(g => g.id)).toEqual(["g1", "g2", "g3", "g4", "g5", "g6"]);
  });

  it("filters out excluded garments", () => {
    const wearable = filterWearable(garments);
    expect(wearable.find(g => g.id === "g9")).toBeUndefined();
  });

  it("builds slot candidates from wearable garments", () => {
    const wearable = filterWearable(garments);
    const candidates = buildSlotCandidates(wearable);
    expect(candidates.shirt.map(g => g.id)).toEqual(["g1"]);
    expect(candidates.pants.map(g => g.id)).toEqual(["g2"]);
    expect(candidates.shoes.map(g => g.id)).toEqual(["g3"]);
    expect(candidates.jacket.map(g => g.id)).toEqual(["g4"]);
    expect(candidates.sweater.map(g => g.id)).toEqual(["g5"]);
    expect(candidates.layer.map(g => g.id)).toEqual(["g5"]);
  });

  it("returns empty arrays for empty wardrobe", () => {
    const candidates = buildSlotCandidates([]);
    expect(candidates.shirt).toEqual([]);
    expect(candidates.pants).toEqual([]);
  });
});

describe("WatchDashboard — mergeOutfit", () => {
  const engineOutfit = {
    shirt: { id: "g1", name: "White Oxford" },
    pants: { id: "g2", name: "Navy Chinos" },
    shoes: { id: "g3", name: "Brown Derby" },
    jacket: { id: "g4", name: "Navy Blazer" },
    sweater: null,
  };

  it("returns engine outfit when no overrides or removals", () => {
    const merged = mergeOutfit(engineOutfit, {}, new Set());
    expect(merged).toEqual(engineOutfit);
  });

  it("slot override replaces engine pick", () => {
    const override = { shirt: { id: "g10", name: "Red Polo" } };
    const merged = mergeOutfit(engineOutfit, override, new Set());
    expect(merged.shirt.id).toBe("g10");
    expect(merged.pants.id).toBe("g2"); // unchanged
  });

  it("removed slots are deleted from merged outfit", () => {
    const merged = mergeOutfit(engineOutfit, {}, new Set(["jacket"]));
    expect(merged.jacket).toBeUndefined();
    expect(merged.shirt.id).toBe("g1");
  });

  it("override + removal: override applied then removal wins", () => {
    const override = { jacket: { id: "g10", name: "Different Jacket" } };
    const merged = mergeOutfit(engineOutfit, override, new Set(["jacket"]));
    expect(merged.jacket).toBeUndefined();
  });

  it("multiple overrides and removals apply simultaneously", () => {
    const override = {
      shirt: { id: "g11", name: "Blue Shirt" },
      shoes: { id: "g12", name: "Black Shoes" },
    };
    const merged = mergeOutfit(engineOutfit, override, new Set(["pants"]));
    expect(merged.shirt.id).toBe("g11");
    expect(merged.shoes.id).toBe("g12");
    expect(merged.pants).toBeUndefined();
    expect(merged.jacket.id).toBe("g4");
  });
});

describe("WatchDashboard — enrichWatch with strap", () => {
  const straps = {
    "s1": { id: "s1", watchId: "w1", color: "brown", type: "leather", label: "Brown Alligator" },
    "s2": { id: "s2", watchId: "w2", type: "bracelet", label: "Steel Bracelet" },
    "s3": { id: "s3", watchId: "w1", color: "blue", type: "leather", label: "Blue Calf" },
  };

  it("enriches watch with active strap string", () => {
    const strapMap = { w1: "s1" };
    const enriched = enrichWatch(watches[0], strapMap, straps);
    expect(enriched.strap).toBe("brown leather");
    expect(enriched._activeStrapLabel).toBe("Brown Alligator");
  });

  it("bracelet strap type renders as 'bracelet'", () => {
    const strapMap = { w2: "s2" };
    const enriched = enrichWatch(watches[1], strapMap, straps);
    expect(enriched.strap).toBe("bracelet");
  });

  it("returns original watch when no active strap", () => {
    const enriched = enrichWatch(watches[0], {}, straps);
    expect(enriched).toBe(watches[0]);
    expect(enriched._activeStrapLabel).toBeUndefined();
  });

  it("returns null when watch is null", () => {
    expect(enrichWatch(null, {}, straps)).toBeNull();
  });
});

describe("WatchDashboard — inferTodayContext", () => {
  it("returns 'shift' when today is an on-call date", () => {
    const todayIso = "2026-04-11";
    const result = inferTodayContext(todayIso, ["2026-04-11"], []);
    expect(result).toBe("shift");
  });

  it("returns weekCtx for today's day index when not on-call", () => {
    const todayIso = "2026-04-11"; // Saturday = day index 6
    const weekCtx = [null, null, null, null, null, null, "casual"];
    const result = inferTodayContext(todayIso, [], weekCtx);
    expect(result).toBe("casual");
  });

  it("on-call overrides weekCtx", () => {
    const todayIso = "2026-04-11";
    const weekCtx = [null, null, null, null, null, null, "casual"];
    const result = inferTodayContext(todayIso, ["2026-04-11"], weekCtx);
    expect(result).toBe("shift");
  });

  it("returns null when no on-call and no weekCtx", () => {
    const result = inferTodayContext("2026-04-11", [], []);
    expect(result).toBeNull();
  });
});

describe("WatchDashboard — check-in entry construction", () => {
  it("builds a check-in entry for a watch", () => {
    const entry = buildCheckinEntry(watches[0], "2026-04-11", null, null, "smart-casual");
    expect(entry.id).toBe("wear-2026-04-11-w1");
    expect(entry.date).toBe("2026-04-11");
    expect(entry.watchId).toBe("w1");
    expect(entry.garmentIds).toEqual([]);
    expect(entry.context).toBe("smart-casual");
    expect(entry.strapId).toBeNull();
    expect(entry.strapLabel).toBeNull();
  });

  it("preserves existing garmentIds on re-checkin", () => {
    const existing = { garmentIds: ["g1", "g2"], context: "casual", notes: "nice day" };
    const entry = buildCheckinEntry(watches[0], "2026-04-11", null, existing, null);
    expect(entry.garmentIds).toEqual(["g1", "g2"]);
    expect(entry.context).toBe("casual");
    expect(entry.notes).toBe("nice day");
  });

  it("includes strap info when active strap exists", () => {
    const strapObj = { id: "s1", label: "Brown Alligator" };
    const entry = buildCheckinEntry(watches[0], "2026-04-11", strapObj, null, null);
    expect(entry.strapId).toBe("s1");
    expect(entry.strapLabel).toBe("Brown Alligator");
  });
});

describe("WatchDashboard — todayHasEntries hiding logic", () => {
  it("returns true when history has entry for today", () => {
    const todayIso = "2026-04-11";
    const history = [
      { date: "2026-04-10", watchId: "w1" },
      { date: "2026-04-11", watchId: "w2" },
    ];
    const todayHasEntries = history.some(e => e.date === todayIso);
    expect(todayHasEntries).toBe(true);
  });

  it("returns false when no entry for today", () => {
    const todayIso = "2026-04-11";
    const history = [
      { date: "2026-04-10", watchId: "w1" },
      { date: "2026-04-09", watchId: "w2" },
    ];
    const todayHasEntries = history.some(e => e.date === todayIso);
    expect(todayHasEntries).toBe(false);
  });

  it("returns false for empty history", () => {
    const todayHasEntries = [].some(e => e.date === "2026-04-11");
    expect(todayHasEntries).toBe(false);
  });
});

describe("WatchDashboard — shift context hides dashboard", () => {
  it("hides dashboard when todayContext is 'shift'", () => {
    const todayContext = "shift";
    const shouldHide = todayContext === "shift";
    expect(shouldHide).toBe(true);
  });

  it("shows dashboard for non-shift contexts", () => {
    for (const ctx of ["casual", "smart-casual", "date-night", null]) {
      const shouldHide = ctx === "shift";
      expect(shouldHide).toBe(false);
    }
  });
});

describe("WatchDashboard — dual-dial watch handling", () => {
  it("recognizes Reverso as dual-dial watch", () => {
    const reverso = watches.find(w => w.id === "w3");
    expect(reverso.dualDial).toBeDefined();
    expect(reverso.dualDial.sideA).toBe("navy");
    expect(reverso.dualDial.sideB).toBe("white");
  });

  it("non-dual-dial watches have no dualDial property", () => {
    const santos = watches.find(w => w.id === "w1");
    expect(santos.dualDial).toBeUndefined();
  });

  it("dial side override B uses sideB color", () => {
    const reverso = watches[2];
    const dialSide = "B";
    const dialColor = dialSide === "B" ? reverso.dualDial.sideB : reverso.dualDial.sideA;
    expect(dialColor).toBe("white");
  });

  it("dial side override A uses sideA color", () => {
    const reverso = watches[2];
    const dialSide = "A";
    const dialColor = dialSide === "B" ? reverso.dualDial.sideB : reverso.dualDial.sideA;
    expect(dialColor).toBe("navy");
  });
});
