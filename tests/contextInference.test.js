import { describe, it, expect } from "vitest";
import { inferContext, dayName, formatDayPattern } from "../src/domain/contextInference.js";

describe("contextInference", () => {
  it("returns null suggestion with insufficient history", () => {
    const result = inferContext([]);
    expect(result.todaySuggestion).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("returns null with less than 5 entries", () => {
    const history = [
      { date: "2026-04-06", context: "clinic" },
      { date: "2026-04-05", context: "casual" },
    ];
    expect(inferContext(history).todaySuggestion).toBeNull();
  });

  it("detects day-of-week patterns", () => {
    // Create history where Sundays (day 0) are always "clinic"
    const history = [];
    // 5 Sundays with clinic context — use UTC methods to avoid DST boundary issues
    for (let i = 0; i < 5; i++) {
      const d = new Date(Date.UTC(2026, 2, 1)); // March 1, 2026 UTC
      d.setUTCDate(d.getUTCDate() + (i * 7));
      while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
      history.push({ date: d.toISOString().slice(0, 10), context: "clinic" });
    }
    // Add some other days to reach minimum
    history.push({ date: "2026-03-03", context: "casual" });
    history.push({ date: "2026-03-04", context: "smart-casual" });

    const result = inferContext(history);
    expect(result.byDay[0]).toBeDefined(); // Sunday = 0
    expect(result.byDay[0].clinic).toBe(5);
  });

  it("only suggests when confidence >= 50%", () => {
    // Create entries all on the same day of week as today
    const today = new Date();
    const history = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - (7 * (i + 1))); // same weekday, previous weeks
      history.push({ date: d.toISOString().slice(0, 10), context: "clinic" });
    }
    for (let i = 0; i < 2; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - (7 * (i + 4)));
      history.push({ date: d.toISOString().slice(0, 10), context: "casual" });
    }
    const result = inferContext(history);
    // topContext should be clinic (3 vs 2) for today's day of week
    expect(result.topContext).toBe("clinic");
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("ignores null/unset contexts", () => {
    const history = [
      { date: "2026-04-06", context: null },
      { date: "2026-04-05", context: "unset" },
      { date: "2026-04-04", context: "null" },
      { date: "2026-04-03", context: "clinic" },
      { date: "2026-04-02", context: "clinic" },
    ];
    const result = inferContext(history);
    // Only "clinic" entries should be counted
    const allContexts = Object.values(result.byDay).flatMap(d => Object.keys(d));
    expect(allContexts).not.toContain("null");
    expect(allContexts).not.toContain("unset");
  });
});

describe("dayName", () => {
  it("maps day numbers correctly", () => {
    expect(dayName(0)).toBe("Sunday");
    expect(dayName(5)).toBe("Friday");
    expect(dayName(6)).toBe("Saturday");
  });
});

describe("formatDayPattern", () => {
  it("formats distribution", () => {
    expect(formatDayPattern({ clinic: 5, casual: 2 })).toContain("clinic(5)");
    expect(formatDayPattern({})).toBe("no pattern yet");
    expect(formatDayPattern(null)).toBe("no pattern yet");
  });
});
