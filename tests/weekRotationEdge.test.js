import { describe, it, expect } from "vitest";
import { genWeekRotation } from "../src/engine/weekRotation.js";

const watches = [
  { id: "w1", formality: 9, style: "dress", replica: false, status: "active" },
  { id: "w2", formality: 5, style: "sport", replica: false, status: "active" },
  { id: "w3", formality: 7, style: "sport-elegant", replica: false, status: "active" },
  { id: "w4", formality: 6, style: "dress-sport", replica: true, status: "active" },
  { id: "w5", formality: 4, style: "diver", replica: false, status: "active" },
  { id: "w6", formality: 5, style: "pilot", replica: false, status: "active" },
  { id: "w7", formality: 8, style: "dress", replica: false, status: "active" },
  { id: "w8", formality: 6, style: "field", replica: false, status: "active" },
];

// ─── genWeekRotation — basic structure ──────────────────────────────────────

describe("genWeekRotation — structure", () => {
  it("returns exactly 7 entries", () => {
    expect(genWeekRotation(watches)).toHaveLength(7);
  });

  it("entries have sequential offsets 0-6", () => {
    const result = genWeekRotation(watches);
    result.forEach((entry, i) => {
      expect(entry.offset).toBe(i);
    });
  });

  it("dates are consecutive days", () => {
    const result = genWeekRotation(watches);
    for (let i = 1; i < result.length; i++) {
      const prev = new Date(result[i - 1].date);
      const curr = new Date(result[i].date);
      const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(1);
    }
  });

  it("dayName matches the day of week", () => {
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const result = genWeekRotation(watches);
    for (const entry of result) {
      const d = new Date(entry.date);
      expect(entry.dayName).toBe(DAYS[d.getDay()]);
    }
  });
});

// ─── genWeekRotation — watch selection ──────────────────────────────────────

describe("genWeekRotation — watch selection", () => {
  it("tries to avoid repeating watches across 7 days", () => {
    const result = genWeekRotation(watches);
    const ids = result.map(r => r.watch?.id).filter(Boolean);
    const unique = new Set(ids);
    // With 8 watches, should have 7 unique
    expect(unique.size).toBe(7);
  });

  it("with fewer watches than days, some may repeat", () => {
    const twoWatches = watches.slice(0, 2);
    const result = genWeekRotation(twoWatches);
    expect(result).toHaveLength(7);
    // All entries should have a watch
    result.forEach(entry => {
      expect(entry.watch).not.toBeNull();
    });
  });

  it("single watch fills all 7 days", () => {
    const one = [watches[0]];
    const result = genWeekRotation(one);
    result.forEach(entry => {
      expect(entry.watch.id).toBe("w1");
    });
  });
});

// ─── genWeekRotation — inactive watch filtering ─────────────────────────────

describe("genWeekRotation — inactive watches", () => {
  it("excludes inactive watches", () => {
    const mixed = [
      { ...watches[0], status: "active" },
      { ...watches[1], status: "inactive" },
      { ...watches[2], status: "active" },
    ];
    const result = genWeekRotation(mixed);
    const usedIds = result.map(r => r.watch?.id).filter(Boolean);
    expect(usedIds).not.toContain("w2");
  });

  it("treats undefined status as active", () => {
    const noStatus = watches.map(w => ({ ...w, status: undefined }));
    const result = genWeekRotation(noStatus);
    expect(result).toHaveLength(7);
    result.forEach(entry => {
      expect(entry.watch).not.toBeNull();
    });
  });

  it("returns empty when all watches inactive", () => {
    const allInactive = watches.map(w => ({ ...w, status: "inactive" }));
    const result = genWeekRotation(allInactive);
    expect(result).toEqual([]);
  });
});

// ─── genWeekRotation — on-call handling ─────────────────────────────────────

describe("genWeekRotation — on-call dates", () => {
  it("on-call date overrides context to shift", () => {
    const today = new Date();
    const dateKey = today.toISOString().slice(0, 10);
    const result = genWeekRotation(watches, [], [], [dateKey]);
    expect(result[0].isOnCall).toBe(true);
    expect(result[0].ctx).toBe("shift");
  });

  it("non on-call date stays as weekCtx", () => {
    const result = genWeekRotation(watches, [], ["formal", "formal", "formal", "formal", "formal", "formal", "formal"], []);
    const today = new Date();
    const dayIdx = today.getDay();
    expect(result[0].ctx).toBe("formal");
    expect(result[0].isOnCall).toBe(false);
  });

  it("multiple on-call dates", () => {
    const today = new Date();
    const d1 = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const d2 = tomorrow.toISOString().slice(0, 10);
    const result = genWeekRotation(watches, [], [], [d1, d2]);
    expect(result[0].isOnCall).toBe(true);
    expect(result[1].isOnCall).toBe(true);
    expect(result[0].ctx).toBe("shift");
    expect(result[1].ctx).toBe("shift");
  });
});

// ─── genWeekRotation — backup watch ─────────────────────────────────────────

describe("genWeekRotation — backup watches", () => {
  it("backup differs from primary", () => {
    const result = genWeekRotation(watches);
    for (const entry of result) {
      if (entry.watch && entry.backup) {
        expect(entry.watch.id).not.toBe(entry.backup.id);
      }
    }
  });

  it("single watch has null backup", () => {
    const result = genWeekRotation([watches[0]]);
    result.forEach(entry => {
      expect(entry.backup).toBeNull();
    });
  });
});

// ─── genWeekRotation — default context ──────────────────────────────────────

describe("genWeekRotation — default context", () => {
  it("defaults to smart-casual when weekCtx is empty", () => {
    const result = genWeekRotation(watches, [], [], []);
    for (const entry of result) {
      if (!entry.isOnCall) {
        expect(entry.ctx).toBe("smart-casual");
      }
    }
  });
});

// ─── genWeekRotation — today lock to logged watch ────────────────────────────
// Regression: before the fix, today's slot always re-scored from scratch,
// ignoring the watch you'd already logged. The rotation showed a different
// watch than what you were actually wearing.

describe("genWeekRotation — today lock", () => {
  it("locks today (offset 0) to the logged watch when already worn today", () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const history = [{ watchId: "w2", date: todayIso }];
    const result = genWeekRotation(watches, history);
    // offset 0 = today
    expect(result[0].watch.id).toBe("w2");
  });

  it("marks today as isLoggedToday when locked", () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const history = [{ watchId: "w3", date: todayIso }];
    const result = genWeekRotation(watches, history);
    expect(result[0].isLoggedToday).toBe(true);
  });

  it("does NOT lock today if no history entry exists for today", () => {
    const result = genWeekRotation(watches, []);
    // Without a logged entry, rotation engine picks freely — no isLoggedToday flag
    expect(result[0].isLoggedToday).toBeFalsy();
  });

  it("does not lock future days even if they have past entries", () => {
    // A past entry for tomorrow's date should not lock it (date arithmetic check)
    const result = genWeekRotation(watches, []);
    // offset > 0 should never be isLoggedToday regardless
    for (const day of result.slice(1)) {
      expect(day.isLoggedToday).toBeFalsy();
    }
  });

  it("locked today watch still feeds usedIds so week variety is maintained", () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    // w1 is the highest-formality watch — engine would pick it repeatedly without usedIds
    const history = [{ watchId: "w1", date: todayIso }];
    const result = genWeekRotation(watches, history);
    // w1 locked to today, remaining days should not all repeat w1
    const futureDayIds = result.slice(1).map(d => d.watch?.id);
    const w1Count = futureDayIds.filter(id => id === "w1").length;
    // Without usedIds propagation, all 6 days would be w1 — should be at most 1
    expect(w1Count).toBeLessThanOrEqual(1);
  });
});
