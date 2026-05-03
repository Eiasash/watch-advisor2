import { describe, it, expect } from "vitest";
import { genWeekRotation } from "../src/engine/weekRotation.js";
import { pickWatchForCalendar } from "../src/engine/calendarWatchRotation.js";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

// ─── genWeekRotation ────────────────────────────────────────────────────────

describe("genWeekRotation", () => {
  it("returns 7 entries for a valid collection", () => {
    const result = genWeekRotation(WATCH_COLLECTION, [], []);
    expect(result).toHaveLength(7);
  });

  it("returns empty array for empty collection", () => {
    expect(genWeekRotation([], [], [])).toEqual([]);
  });

  it("each entry has required fields", () => {
    const result = genWeekRotation(WATCH_COLLECTION, [], []);
    for (const entry of result) {
      expect(entry).toHaveProperty("dayName");
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("ctx");
      expect(entry).toHaveProperty("watch");
      expect(entry).toHaveProperty("backup");
      expect(entry).toHaveProperty("isOnCall");
    }
  });

  it("avoids repeating the same watch across 7 days when possible", () => {
    // With 23 watches, no watch should need to repeat across 7 days
    const result = genWeekRotation(WATCH_COLLECTION, [], []);
    const watchIds = result.map(r => r.watch?.id).filter(Boolean);
    const uniqueIds = new Set(watchIds);
    expect(uniqueIds.size).toBe(7);
  });

  it("applies on-call date override", () => {
    const today = new Date();
    const dateKey = today.toISOString().slice(0, 10);
    const result = genWeekRotation(WATCH_COLLECTION, [], [], [dateKey]);
    expect(result[0].isOnCall).toBe(true);
    expect(result[0].ctx).toBe("shift");
  });

  it("uses weekCtx context when provided", () => {
    const weekCtx = ["casual", "formal", "hospital-smart-casual", "smart-casual", "travel", "casual", "casual"];
    const result = genWeekRotation(WATCH_COLLECTION, [], weekCtx, []);
    // genWeekRotation uses getUTCDay() for dayIdx (see weekRotation.js line 41 —
    // explicitly UTC for consistency with the UTC dateKey). Test must use the
    // same to avoid TZ-edge flakes when local day differs from UTC day.
    const today = new Date();
    const dayIdx = today.getUTCDay();
    expect(result[0].ctx).toBe(weekCtx[dayIdx]);
  });

  it("penalises recently worn watches", () => {
    // Wear a subset of watches recently — the week rotation should avoid them
    const recentWatches = WATCH_COLLECTION.slice(0, 7);
    const history = recentWatches.map(w => ({ watchId: w.id }));
    const result = genWeekRotation(WATCH_COLLECTION, history, []);

    // Verify no recently-worn watch appears as primary (they should be deprioritised)
    const recentIds = new Set(recentWatches.map(w => w.id));
    const primaryIds = result.map(r => r.watch?.id).filter(Boolean);
    // At least some primaries should be from the non-recent set
    const freshPicks = primaryIds.filter(id => !recentIds.has(id));
    expect(freshPicks.length).toBeGreaterThan(0);
  });

  it("provides a backup watch different from primary", () => {
    const result = genWeekRotation(WATCH_COLLECTION, [], []);
    for (const entry of result) {
      if (entry.watch && entry.backup) {
        expect(entry.watch.id).not.toBe(entry.backup.id);
      }
    }
  });

  it("filters out inactive watches", () => {
    const watches = [
      { ...WATCH_COLLECTION[0], status: "active" },
      { ...WATCH_COLLECTION[1], status: "inactive" },
      { ...WATCH_COLLECTION[2], status: "active" },
    ];
    const result = genWeekRotation(watches, [], []);
    const usedIds = result.map(r => r.watch?.id).filter(Boolean);
    expect(usedIds).not.toContain(watches[1].id);
  });
});

// ─── pickWatchForCalendar ───────────────────────────────────────────────────

describe("pickWatchForCalendar", () => {
  it("returns primary and backup", () => {
    const { primary, backup, dayProfile } = pickWatchForCalendar(WATCH_COLLECTION, [], {}, []);
    expect(primary).toBeTruthy();
    expect(backup).toBeTruthy();
    expect(primary.id).not.toBe(backup.id);
    expect(dayProfile).toBe("smart-casual");
  });

  it("returns null for empty collection", () => {
    const result = pickWatchForCalendar([], [], {}, []);
    expect(result.primary).toBeNull();
    expect(result.backup).toBeNull();
  });

  it("infers hospital day profile from events", () => {
    const { dayProfile } = pickWatchForCalendar(WATCH_COLLECTION, ["ward rounds"], {}, []);
    expect(dayProfile).toBe("hospital-smart-casual");
  });

  it("infers formal day profile from events", () => {
    const { dayProfile } = pickWatchForCalendar(WATCH_COLLECTION, ["wedding ceremony"], {}, []);
    expect(dayProfile).toBe("formal");
  });

  it("applies recency penalty from history", () => {
    const topWatch = pickWatchForCalendar(WATCH_COLLECTION, [], {}, []).primary;
    // Wear the top watch 5 times
    const history = Array(5).fill({ watchId: topWatch.id });
    const { primary } = pickWatchForCalendar(WATCH_COLLECTION, [], {}, history);
    // With heavy recency, should pick a different watch
    expect(primary.id).not.toBe(topWatch.id);
  });
});
