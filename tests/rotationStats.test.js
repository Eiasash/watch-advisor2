import { describe, it, expect } from "vitest";
import {
  daysIdle,
  wearCount,
  neglectedGenuine,
  wearStreak,
  watchCPW,
  buildRotationTable,
} from "../src/domain/rotationStats.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const TODAY   = daysAgo(0);
const W_SPEEDY = { id: "speedmaster", brand: "Omega", model: "Speedmaster", priceILS: 24000, replica: false };
const W_GMT    = { id: "gmt",          brand: "Rolex",  model: "GMT",          priceILS: 55000, replica: false };
const W_REP    = { id: "rep_ap",       brand: "AP",     model: "Royal Oak",    priceILS: null,  replica: true  };

// ── daysIdle ─────────────────────────────────────────────────────────────────

describe("daysIdle", () => {
  it("returns Infinity when watch has never been worn", () => {
    expect(daysIdle("speedmaster", [])).toBe(Infinity);
  });

  it("returns 0 when watch was worn today", () => {
    const history = [{ watchId: "speedmaster", date: TODAY }];
    expect(daysIdle("speedmaster", history)).toBe(0);
  });

  it("returns correct days for past wear", () => {
    const history = [{ watchId: "speedmaster", date: daysAgo(5) }];
    expect(daysIdle("speedmaster", history)).toBe(5);
  });

  it("uses the most recent wear date when multiple entries exist", () => {
    const history = [
      { watchId: "speedmaster", date: daysAgo(10) },
      { watchId: "speedmaster", date: daysAgo(3) },
      { watchId: "speedmaster", date: daysAgo(7) },
    ];
    expect(daysIdle("speedmaster", history)).toBe(3);
  });

  it("ignores other watches", () => {
    const history = [{ watchId: "gmt", date: TODAY }];
    expect(daysIdle("speedmaster", history)).toBe(Infinity);
  });

  it("ignores entries with no date", () => {
    const history = [{ watchId: "speedmaster", date: null }];
    expect(daysIdle("speedmaster", history)).toBe(Infinity);
  });
});

// ── wearCount ────────────────────────────────────────────────────────────────

describe("wearCount", () => {
  it("returns 0 for unworn watch", () => {
    expect(wearCount("speedmaster", [])).toBe(0);
  });

  it("counts only matching watchId", () => {
    const history = [
      { watchId: "speedmaster", date: daysAgo(1) },
      { watchId: "speedmaster", date: daysAgo(5) },
      { watchId: "gmt",         date: daysAgo(2) },
    ];
    expect(wearCount("speedmaster", history)).toBe(2);
    expect(wearCount("gmt", history)).toBe(1);
  });
});

// ── neglectedGenuine ─────────────────────────────────────────────────────────

describe("neglectedGenuine", () => {
  const watches = [W_SPEEDY, W_GMT, W_REP];

  it("returns null for empty watches", () => {
    expect(neglectedGenuine([], [])).toBeNull();
  });

  it("returns the genuine watch with most idle days", () => {
    const history = [
      { watchId: "speedmaster", date: daysAgo(3) },
      { watchId: "gmt",         date: daysAgo(10) },
      { watchId: "rep_ap",      date: daysAgo(1) }, // replica — should be ignored
    ];
    const result = neglectedGenuine(watches, history);
    expect(result.watch.id).toBe("gmt");
    expect(result.idle).toBe(10);
  });

  it("excludes replicas from neglected calculation", () => {
    // Only replica worn recently — genuine both idle for 20d
    const history = [
      { watchId: "rep_ap",      date: daysAgo(1) },
      { watchId: "speedmaster", date: daysAgo(20) },
      { watchId: "gmt",         date: daysAgo(20) },
    ];
    const result = neglectedGenuine(watches, history);
    // Both genuine equally idle — either is valid
    expect(["speedmaster", "gmt"]).toContain(result.watch.id);
    expect(result.idle).toBe(20);
  });

  it("returns never-worn watch when no history", () => {
    const result = neglectedGenuine([W_SPEEDY, W_GMT], []);
    expect(result.idle).toBe(Infinity);
  });
});

// ── wearStreak ───────────────────────────────────────────────────────────────

describe("wearStreak", () => {
  it("returns 0 for empty history", () => {
    expect(wearStreak([])).toBe(0);
  });

  it("returns 1 for single entry today", () => {
    const history = [{ watchId: "speedmaster", date: TODAY }];
    expect(wearStreak(history)).toBe(1);
  });

  it("counts consecutive days ending today", () => {
    const history = [
      { watchId: "speedmaster", date: daysAgo(0) },
      { watchId: "gmt",         date: daysAgo(1) },
      { watchId: "speedmaster", date: daysAgo(2) },
    ];
    expect(wearStreak(history)).toBe(3);
  });

  it("breaks streak on missing day", () => {
    const history = [
      { watchId: "speedmaster", date: daysAgo(0) },
      // daysAgo(1) is missing
      { watchId: "gmt",         date: daysAgo(2) },
    ];
    expect(wearStreak(history)).toBe(1);
  });

  it("counts streak from yesterday when today not yet logged", () => {
    const history = [
      { watchId: "speedmaster", date: daysAgo(1) },
      { watchId: "gmt",         date: daysAgo(2) },
      { watchId: "speedmaster", date: daysAgo(3) },
    ];
    const s = wearStreak(history);
    expect(s).toBeGreaterThanOrEqual(3);
  });

  it("deduplicates multiple entries on same day", () => {
    const history = [
      { watchId: "speedmaster", date: daysAgo(0) },
      { watchId: "gmt",         date: daysAgo(0) }, // same day — only counts once
      { watchId: "speedmaster", date: daysAgo(1) },
    ];
    expect(wearStreak(history)).toBe(2);
  });
});

// ── watchCPW ─────────────────────────────────────────────────────────────────

describe("watchCPW", () => {
  it("returns null for watch with no priceILS", () => {
    expect(watchCPW(W_REP, [{ watchId: "rep_ap", date: TODAY }])).toBeNull();
  });

  it("returns null for watch never worn", () => {
    expect(watchCPW(W_SPEEDY, [])).toBeNull();
  });

  it("computes correct CPW", () => {
    // ₪24000 / 4 wears = ₪6000
    const history = Array.from({ length: 4 }, (_, i) => ({ watchId: "speedmaster", date: daysAgo(i + 1) }));
    expect(watchCPW(W_SPEEDY, history)).toBe(6000);
  });
});

// ── buildRotationTable ───────────────────────────────────────────────────────

describe("buildRotationTable", () => {
  it("sorts by most idle first", () => {
    const history = [
      { watchId: "speedmaster", date: daysAgo(2) },
      { watchId: "gmt",         date: daysAgo(10) },
    ];
    const rows = buildRotationTable([W_SPEEDY, W_GMT], history);
    expect(rows[0].watch.id).toBe("gmt");
    expect(rows[1].watch.id).toBe("speedmaster");
  });

  it("places never-worn watches first", () => {
    const history = [{ watchId: "speedmaster", date: daysAgo(5) }];
    const rows = buildRotationTable([W_SPEEDY, W_GMT], history);
    expect(rows[0].watch.id).toBe("gmt"); // never worn → Infinity
  });

  it("includes idle, count, and cpw fields", () => {
    const history = [{ watchId: "speedmaster", date: daysAgo(3) }];
    const rows = buildRotationTable([W_SPEEDY], history);
    expect(rows[0].idle).toBe(3);
    expect(rows[0].count).toBe(1);
    expect(rows[0].cpw).toBe(24000); // 24000 / 1
  });
});
