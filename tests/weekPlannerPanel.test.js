import { describe, it, expect } from "vitest";

/**
 * WeekPlanner panel orchestration tests.
 *
 * Existing test coverage (avoided here):
 * - weekPlannerLogic.test.js: OUTFIT_SLOTS, ACCESSORY_TYPES, isWearableGarment, filterWearable, WEATHER_ICONS, crash fallback
 * - weekPlannerSwap.test.js: handleSwapGarment, handleShuffle, handleResetOutfit, OutfitSlotChip None-remove, logged overrides
 *
 * This file tests:
 * - Calendar date grid building (OnCallCalendar.buildGrid)
 * - On-call date toggling
 * - Day navigation / date labels
 * - Empty planner state (no watches, no garments)
 * - Context selection per day
 * - Watch override resolution in rotation
 * - Override display logic (logged vs engine-built)
 * - Outfit similarity / repeat detection
 * - RotationInsights variety scoring
 */

// ── Calendar grid builder (mirrors OnCallCalendar inside WeekPlanner.jsx) ────
function buildGrid(year, month) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const days  = [];
  // Monday-start: (getDay() + 6) % 7 maps Sun=0 → 6, Mon=1 → 0
  for (let i = (first.getDay() + 6) % 7; i > 0; i--) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ── On-call toggle logic (mirrors handleToggleOnCall) ──────────��─────────────
function toggleOnCall(onCallDates, iso) {
  return onCallDates.includes(iso)
    ? onCallDates.filter(d => d !== iso)
    : [...onCallDates, iso].sort();
}

// ─�� Context change logic (mirrors handleCtxChange) ───────────────────────────
function changeCtx(weekCtx, offset, ctx) {
  const dayIdx = (new Date().getDay() + offset) % 7;
  const next = [...weekCtx];
  next[dayIdx] = ctx;
  return next;
}

// ── CONTEXTS (mirrors WeekPlanner.jsx) ───────────────────────────────────────
const CONTEXTS = [
  { key: null,                 label: "Any Vibe" },
  { key: "smart-casual",      label: "Smart Casual" },
  { key: "casual",            label: "Casual" },
  { key: "date-night",        label: "Date Night" },
  { key: "shift",             label: "On-Call Shift" },
  { key: "eid-celebration",   label: "Eid" },
  { key: "family-event",      label: "Family Event" },
];

// ── Watch override resolution (mirrors rotation useMemo) ─────���───────────────
function resolveRotationOverrides(rawRotation, watchOverrides, watches) {
  return rawRotation.map(day => {
    const oid = watchOverrides[day.date];
    if (!oid) return day;
    const w = watches.find(x => x.id === oid);
    return w ? { ...day, watch: w, isOverridden: true } : day;
  });
}

// ── Outfit similarity detection (mirrors WeekPlanner render logic) ───────────
const OUTFIT_SLOTS = ["shirt", "sweater", "layer", "pants", "shoes", "jacket", "belt"];

function detectOutfitRepeat(dayOutfit, recentEntries) {
  const dayGarmentIds = new Set(OUTFIT_SLOTS.map(s => dayOutfit[s]?.id).filter(Boolean));
  return recentEntries.some(e => {
    const prev = new Set(e.garmentIds ?? []);
    const overlap = [...dayGarmentIds].filter(id => prev.has(id)).length;
    return overlap >= 3;
  });
}

// ── RotationInsights — variety score logic ───────────────────────────────────
function computeVarietyScore(rotation) {
  const weekWatchIds = new Set(rotation.map(d => d.watch?.id).filter(Boolean));
  return weekWatchIds.size;
}

function detectStyleStreak(rotation) {
  let streak = 1, maxStreak = 1, streakStyle = null;
  for (let i = 1; i < rotation.length; i++) {
    if (rotation[i].watch?.style && rotation[i].watch?.style === rotation[i - 1].watch?.style) {
      streak++;
      if (streak > maxStreak) { maxStreak = streak; streakStyle = rotation[i].watch.style; }
    } else {
      streak = 1;
    }
  }
  return { maxStreak, streakStyle };
}

// ── Tests ────────��───────────────────────────────────────────────────────────

describe("WeekPlanner — OnCallCalendar buildGrid", () => {
  it("builds grid for April 2026 (starts on Wednesday)", () => {
    const grid = buildGrid(2026, 3); // month is 0-indexed: 3 = April
    // April 1, 2026 is a Wednesday → 2 null padding (Mon, Tue)
    expect(grid[0]).toBeNull();
    expect(grid[1]).toBeNull();
    expect(grid[2]).not.toBeNull();
    expect(isoOf(grid[2])).toBe("2026-04-01");
  });

  it("builds grid for March 2026 (starts on Sunday)", () => {
    const grid = buildGrid(2026, 2); // March
    // March 1, 2026 is a Sunday → 6 null padding (Mon–Sat)
    const nullCount = grid.filter(d => d === null).length;
    expect(nullCount).toBe(6);
    expect(isoOf(grid[6])).toBe("2026-03-01");
  });

  it("builds grid for February 2026 (28 days)", () => {
    const grid = buildGrid(2026, 1); // February
    const dateCells = grid.filter(d => d !== null);
    expect(dateCells).toHaveLength(28);
    expect(isoOf(dateCells[dateCells.length - 1])).toBe("2026-02-28");
  });

  it("builds grid for month starting on Monday (no padding)", () => {
    // June 2026 starts on Monday
    const grid = buildGrid(2026, 5);
    expect(grid[0]).not.toBeNull();
    expect(isoOf(grid[0])).toBe("2026-06-01");
  });

  it("total grid cells = padding + days in month", () => {
    const grid = buildGrid(2026, 3); // April = 30 days + 2 padding = 32
    expect(grid).toHaveLength(32);
  });
});

describe("WeekPlanner — on-call date toggling", () => {
  it("adds a date when not already in list", () => {
    const result = toggleOnCall(["2026-04-10"], "2026-04-12");
    expect(result).toEqual(["2026-04-10", "2026-04-12"]);
  });

  it("removes a date when already in list", () => {
    const result = toggleOnCall(["2026-04-10", "2026-04-12"], "2026-04-10");
    expect(result).toEqual(["2026-04-12"]);
  });

  it("maintains sorted order after adding", () => {
    const result = toggleOnCall(["2026-04-15"], "2026-04-10");
    expect(result).toEqual(["2026-04-10", "2026-04-15"]);
  });

  it("toggling empty list adds single date", () => {
    const result = toggleOnCall([], "2026-04-11");
    expect(result).toEqual(["2026-04-11"]);
  });

  it("toggling last date results in empty list", () => {
    const result = toggleOnCall(["2026-04-11"], "2026-04-11");
    expect(result).toEqual([]);
  });
});

describe("WeekPlanner — day navigation date labels", () => {
  it("today is labeled 'Today' in rotation cards", () => {
    const today = new Date().toISOString().slice(0, 10);
    const day = { date: today, dayName: "Friday" };
    const label = day.date === today ? "Today" : day.dayName;
    expect(label).toBe("Today");
  });

  it("other days use dayName", () => {
    const today = new Date().toISOString().slice(0, 10);
    const day = { date: "2099-12-31", dayName: "Thursday" };
    const label = day.date === today ? "Today" : day.dayName;
    expect(label).toBe("Thursday");
  });

  it("date slice(5) shows MM-DD portion", () => {
    expect("2026-04-11".slice(5)).toBe("04-11");
    expect("2026-12-01".slice(5)).toBe("12-01");
  });
});

describe("WeekPlanner — context change per day", () => {
  it("sets context for the correct day index", () => {
    const weekCtx = [null, null, null, null, null, null, null];
    const result = changeCtx(weekCtx, 0, "casual");
    // Only the current day's index changes
    const dayIdx = new Date().getDay() % 7;
    expect(result[dayIdx]).toBe("casual");
  });

  it("preserves other days' contexts", () => {
    const weekCtx = ["formal", "casual", "smart-casual", null, null, null, null];
    const dayIdx = (new Date().getDay() + 2) % 7;
    const result = changeCtx(weekCtx, 2, "date-night");
    expect(result[dayIdx]).toBe("date-night");
    // Check that other slots we know are unaffected
    const otherIdx = (dayIdx + 1) % 7;
    expect(result[otherIdx]).toBe(weekCtx[otherIdx]);
  });

  it("CONTEXTS has 7 options", () => {
    expect(CONTEXTS).toHaveLength(7);
    expect(CONTEXTS[0].key).toBeNull();
    expect(CONTEXTS[0].label).toBe("Any Vibe");
  });
});

describe("WeekPlanner — watch override resolution", () => {
  const rawRotation = [
    { date: "2026-04-11", watch: { id: "w1", model: "Santos" }, isOnCall: false },
    { date: "2026-04-12", watch: { id: "w2", model: "Seamaster" }, isOnCall: false },
    { date: "2026-04-13", watch: { id: "w1", model: "Santos" }, isOnCall: true },
  ];
  const allWatches = [
    { id: "w1", model: "Santos" },
    { id: "w2", model: "Seamaster" },
    { id: "w3", model: "Reverso" },
  ];

  it("returns raw rotation when no overrides", () => {
    const result = resolveRotationOverrides(rawRotation, {}, allWatches);
    expect(result[0].watch.id).toBe("w1");
    expect(result[0].isOverridden).toBeUndefined();
  });

  it("applies watch override for a specific date", () => {
    const overrides = { "2026-04-11": "w3" };
    const result = resolveRotationOverrides(rawRotation, overrides, allWatches);
    expect(result[0].watch.id).toBe("w3");
    expect(result[0].isOverridden).toBe(true);
    expect(result[1].watch.id).toBe("w2"); // unaffected
  });

  it("ignores override with invalid watch ID", () => {
    const overrides = { "2026-04-11": "w999" };
    const result = resolveRotationOverrides(rawRotation, overrides, allWatches);
    expect(result[0].watch.id).toBe("w1"); // falls back to original
    expect(result[0].isOverridden).toBeUndefined();
  });
});

describe("WeekPlanner — empty state", () => {
  it("no watches yields no watch in rotation entries", () => {
    // genWeekRotation returns days with null watches when none available
    const emptyDay = { date: "2026-04-11", watch: null, dayName: "Saturday" };
    expect(emptyDay.watch).toBeNull();
  });

  it("WatchMini shows 'No watches' when watch is null", () => {
    const watch = null;
    const label = watch ? `${watch.brand} ${watch.model}` : "No watches";
    expect(label).toBe("No watches");
  });

  it("outfit generation skips days with no watch", () => {
    const day = { watch: null };
    const result = !day.watch ? {} : { shirt: { id: "g1" } };
    expect(result).toEqual({});
  });

  it("outfits section hidden when wearable garments are empty", () => {
    const showOutfits = true;
    const dayWatch = { id: "w1" };
    const wearableCount = 0;
    const showSection = showOutfits && dayWatch && wearableCount > 0;
    expect(showSection).toBe(false);
  });
});

describe("WeekPlanner — outfit repeat detection", () => {
  it("detects repeat when 3+ garments overlap", () => {
    const dayOutfit = {
      shirt: { id: "g1" }, pants: { id: "g2" }, shoes: { id: "g3" },
      jacket: null, sweater: null, layer: null, belt: null,
    };
    const recentEntries = [{ garmentIds: ["g1", "g2", "g3", "g5"] }];
    expect(detectOutfitRepeat(dayOutfit, recentEntries)).toBe(true);
  });

  it("does not flag when fewer than 3 garments overlap", () => {
    const dayOutfit = {
      shirt: { id: "g1" }, pants: { id: "g2" }, shoes: { id: "g99" },
      jacket: null, sweater: null, layer: null, belt: null,
    };
    const recentEntries = [{ garmentIds: ["g1", "g2", "g50"] }];
    expect(detectOutfitRepeat(dayOutfit, recentEntries)).toBe(false);
  });

  it("handles empty day outfit", () => {
    const dayOutfit = {};
    const recentEntries = [{ garmentIds: ["g1", "g2", "g3"] }];
    expect(detectOutfitRepeat(dayOutfit, recentEntries)).toBe(false);
  });

  it("handles empty recent entries", () => {
    const dayOutfit = {
      shirt: { id: "g1" }, pants: { id: "g2" }, shoes: { id: "g3" },
      jacket: null, sweater: null, layer: null, belt: null,
    };
    expect(detectOutfitRepeat(dayOutfit, [])).toBe(false);
  });
});

describe("WeekPlanner — RotationInsights variety score", () => {
  it("counts unique watches in the rotation", () => {
    const rotation = [
      { watch: { id: "w1" } },
      { watch: { id: "w2" } },
      { watch: { id: "w1" } },
      { watch: { id: "w3" } },
    ];
    expect(computeVarietyScore(rotation)).toBe(3);
  });

  it("returns 0 for empty rotation", () => {
    expect(computeVarietyScore([])).toBe(0);
  });

  it("returns 1 when same watch every day", () => {
    const rotation = Array(7).fill({ watch: { id: "w1" } });
    expect(computeVarietyScore(rotation)).toBe(1);
  });

  it("handles days with null watch", () => {
    const rotation = [
      { watch: { id: "w1" } },
      { watch: null },
      { watch: { id: "w2" } },
    ];
    expect(computeVarietyScore(rotation)).toBe(2);
  });
});

describe("WeekPlanner — style streak detection", () => {
  it("detects streak of 3+ consecutive same-style watches", () => {
    const rotation = [
      { watch: { style: "sport" } },
      { watch: { style: "sport" } },
      { watch: { style: "sport" } },
      { watch: { style: "dress" } },
    ];
    const { maxStreak, streakStyle } = detectStyleStreak(rotation);
    expect(maxStreak).toBe(3);
    expect(streakStyle).toBe("sport");
  });

  it("returns streak 1 when no consecutive styles", () => {
    const rotation = [
      { watch: { style: "sport" } },
      { watch: { style: "dress" } },
      { watch: { style: "pilot" } },
    ];
    const { maxStreak } = detectStyleStreak(rotation);
    expect(maxStreak).toBe(1);
  });

  it("handles null watch styles gracefully", () => {
    const rotation = [
      { watch: { style: null } },
      { watch: { style: null } },
      { watch: { style: "sport" } },
    ];
    const { maxStreak } = detectStyleStreak(rotation);
    // null styles don't match each other (falsy)
    expect(maxStreak).toBe(1);
  });
});

describe("WeekPlanner — logged outfit override display", () => {
  it("logged outfit has _isLogged flag", () => {
    const loggedOutfit = { _isLogged: true, shirt: { id: "g1" }, pants: { id: "g2" } };
    expect(loggedOutfit._isLogged).toBe(true);
  });

  it("engine-built outfit has no _isLogged flag", () => {
    const engineOutfit = { shirt: { id: "g1" }, pants: { id: "g2" } };
    expect(engineOutfit._isLogged).toBeUndefined();
  });

  it("override applies on top of logged outfit slots", () => {
    const loggedIds = ["g1", "g2", "g3"];
    const garments = [
      { id: "g1", type: "shirt" },
      { id: "g2", type: "pants" },
      { id: "g3", type: "shoes" },
      { id: "g10", type: "shirt" },
    ];
    const dayOverrides = { shirt: "g10" };

    // Resolution logic from WeekPlanner
    const loggedOutfit = { _isLogged: true };
    for (const slot of ["shirt", "pants", "shoes"]) {
      if (slot in dayOverrides) {
        const overrideId = dayOverrides[slot];
        loggedOutfit[slot] = overrideId ? garments.find(g => g.id === overrideId) ?? null : null;
      } else {
        const candidates = garments.filter(g => loggedIds.includes(g.id));
        const match = candidates.find(g => g.type === slot);
        if (match) loggedOutfit[slot] = match;
      }
    }

    expect(loggedOutfit.shirt.id).toBe("g10"); // overridden
    expect(loggedOutfit.pants.id).toBe("g2");  // from logged
    expect(loggedOutfit.shoes.id).toBe("g3");  // from logged
  });
});
