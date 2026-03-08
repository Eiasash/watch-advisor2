import { describe, it, expect } from "vitest";

/**
 * Test the filter + sort logic from OutfitHistory component.
 * Extracted as pure functions to avoid React rendering dependency.
 */

function filterAndSort(entries, filter) {
  const now = Date.now();
  const cutoff = filter === "week" ? 7 : filter === "month" ? 30 : Infinity;
  return [...entries]
    .filter(e => {
      if (cutoff === Infinity) return true;
      const d = new Date(e.date || e.loggedAt);
      return (now - d.getTime()) / 86400000 <= cutoff;
    })
    .sort((a, b) => {
      const da = new Date(b.date || b.loggedAt);
      const db = new Date(a.date || a.loggedAt);
      return da - db;
    });
}

const today = new Date().toISOString().slice(0, 10);
const daysAgo = n => {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
};

const entries = [
  { id: "1", date: today, watchId: "w1" },
  { id: "2", date: daysAgo(3), watchId: "w2" },
  { id: "3", date: daysAgo(10), watchId: "w3" },
  { id: "4", date: daysAgo(20), watchId: "w1" },
  { id: "5", date: daysAgo(45), watchId: "w2" },
];

describe("OutfitHistory filter/sort logic", () => {
  it("returns all entries with 'all' filter", () => {
    const result = filterAndSort(entries, "all");
    expect(result).toHaveLength(5);
  });

  it("returns only last 7 days with 'week' filter", () => {
    const result = filterAndSort(entries, "week");
    expect(result).toHaveLength(2);
    expect(result.map(e => e.id)).toEqual(expect.arrayContaining(["1", "2"]));
  });

  it("returns only last 30 days with 'month' filter", () => {
    const result = filterAndSort(entries, "month");
    expect(result).toHaveLength(4);
    expect(result.map(e => e.id)).not.toContain("5");
  });

  it("sorts entries by date descending (most recent first)", () => {
    const result = filterAndSort(entries, "all");
    expect(result[0].id).toBe("1");
    expect(result[result.length - 1].id).toBe("5");
  });

  it("handles empty entries array", () => {
    const result = filterAndSort([], "all");
    expect(result).toEqual([]);
  });

  it("uses loggedAt when date is missing", () => {
    const withLoggedAt = [
      { id: "a", loggedAt: new Date().toISOString(), watchId: "w1" },
      { id: "b", loggedAt: new Date(Date.now() - 2 * 86400000).toISOString(), watchId: "w2" },
    ];
    const result = filterAndSort(withLoggedAt, "week");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a"); // most recent first
  });

  it("does not modify original array", () => {
    const original = [...entries];
    filterAndSort(entries, "all");
    expect(entries).toEqual(original);
  });

  it("handles single entry", () => {
    const result = filterAndSort([entries[0]], "all");
    expect(result).toHaveLength(1);
  });

  it("handles entries all older than cutoff", () => {
    const oldEntries = [
      { id: "old1", date: daysAgo(50), watchId: "w1" },
      { id: "old2", date: daysAgo(60), watchId: "w2" },
    ];
    const result = filterAndSort(oldEntries, "week");
    expect(result).toHaveLength(0);
  });
});
