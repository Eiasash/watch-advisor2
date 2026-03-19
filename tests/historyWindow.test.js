import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { recentHistory, recentWatchIds } from "../src/domain/historyWindow.js";

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("recentHistory — calendar-day window", () => {
  it("returns empty array for empty/null/undefined history", () => {
    expect(recentHistory([])).toEqual([]);
    expect(recentHistory(null)).toEqual([]);
    expect(recentHistory(undefined)).toEqual([]);
  });

  it("includes entries from today", () => {
    const h = [{ watchId: "w1", date: daysAgoStr(0) }];
    expect(recentHistory(h, 7)).toHaveLength(1);
  });

  it("includes entries from 6 days ago", () => {
    const h = [{ watchId: "w1", date: daysAgoStr(6) }];
    expect(recentHistory(h, 7)).toHaveLength(1);
  });

  it("excludes entries older than 7 days", () => {
    const h = [{ watchId: "w1", date: daysAgoStr(8) }];
    expect(recentHistory(h, 7)).toHaveLength(0);
  });

  it("filters correctly with mixed old and recent entries", () => {
    const h = [
      { watchId: "w1", date: daysAgoStr(10) },
      { watchId: "w2", date: daysAgoStr(3) },
      { watchId: "w3", date: daysAgoStr(0) },
      { watchId: "w4", date: daysAgoStr(15) },
    ];
    const recent = recentHistory(h, 7);
    expect(recent).toHaveLength(2);
    expect(recent.map(e => e.watchId)).toContain("w2");
    expect(recent.map(e => e.watchId)).toContain("w3");
  });

  it("watch worn 2 days ago is included even with 10 entries between", () => {
    const h = [
      { watchId: "target", date: daysAgoStr(2) },
      ...Array.from({ length: 10 }, (_, i) => ({
        watchId: `filler-${i}`,
        date: daysAgoStr(1),
      })),
    ];
    const recent = recentHistory(h, 7);
    expect(recent.some(e => e.watchId === "target")).toBe(true);
  });

  it("falls back to slice(-N) when no entries have dates", () => {
    const h = [
      { watchId: "old" },
      ...Array.from({ length: 7 }, () => ({ watchId: "recent" })),
    ];
    const recent = recentHistory(h, 7);
    expect(recent).toHaveLength(7);
    expect(recent.every(e => e.watchId === "recent")).toBe(true);
  });
});

describe("recentWatchIds", () => {
  it("returns Set of watch IDs from recent entries", () => {
    const h = [
      { watchId: "w1", date: daysAgoStr(1) },
      { watchId: "w2", date: daysAgoStr(3) },
      { watchId: "w1", date: daysAgoStr(0) },
    ];
    const ids = recentWatchIds(h, 7);
    expect(ids.has("w1")).toBe(true);
    expect(ids.has("w2")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("excludes old watch IDs", () => {
    const h = [
      { watchId: "old", date: daysAgoStr(10) },
      { watchId: "recent", date: daysAgoStr(1) },
    ];
    const ids = recentWatchIds(h, 7);
    expect(ids.has("old")).toBe(false);
    expect(ids.has("recent")).toBe(true);
  });

  it("returns empty set for empty history", () => {
    expect(recentWatchIds([], 7).size).toBe(0);
  });
});

describe("calendar-day rotation — watch penalised by date, not entry count", () => {
  it("watch worn 2 days ago is penalised even with 10 other entries between", () => {
    // This is the critical bug fix: old code used .slice(-7) which would miss
    // a watch worn 2 days ago if there were 7+ other entries after it.
    const h = [
      { watchId: "target", date: daysAgoStr(2) },
      ...Array.from({ length: 10 }, (_, i) => ({
        watchId: `filler-${i}`,
        date: daysAgoStr(1),
      })),
    ];
    const ids = recentWatchIds(h, 7);
    expect(ids.has("target")).toBe(true);
  });

  it("watch worn 8 days ago is NOT penalised even if only 3 entries ago", () => {
    const h = [
      { watchId: "old1", date: daysAgoStr(10) },
      { watchId: "old2", date: daysAgoStr(9) },
      { watchId: "target", date: daysAgoStr(8) },
    ];
    const ids = recentWatchIds(h, 7);
    expect(ids.has("target")).toBe(false);
  });
});
