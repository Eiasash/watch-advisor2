import { describe, it, expect } from "vitest";
import { garmentDaysIdle } from "../src/domain/rotationStats.js";

describe("garmentDaysIdle", () => {
  // Fixed past dates so tests are date-independent
  const history = [
    {
      date: "2024-01-10",
      garmentIds: ["shirt1", "pants1"],
    },
    {
      date: "2024-01-15",
      payload: { garmentIds: ["shirt2"] },
    },
  ];

  it("detects garment in top-level garmentIds", () => {
    const idle = garmentDaysIdle("shirt1", history);
    expect(idle).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(idle)).toBe(true);
  });

  it("detects garment in payload.garmentIds", () => {
    const idle = garmentDaysIdle("shirt2", history);
    expect(idle).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(idle)).toBe(true);
  });

  it("returns Infinity if garment was never worn", () => {
    const idle = garmentDaysIdle("unknown-garment", history);
    expect(idle).toBe(Infinity);
  });

  it("uses the most recent wear date when garment appears in multiple entries", () => {
    const h = [
      { date: "2024-01-01", garmentIds: ["g1"] },
      { date: "2024-01-20", garmentIds: ["g1"] },
      { date: "2024-01-10", garmentIds: ["g1"] },
    ];
    const idle1 = garmentDaysIdle("g1", h);
    // Should be based on 2024-01-20, not 2024-01-01
    const idleFromOldDate = Math.floor(
      (Date.now() - new Date("2024-01-01").getTime()) / 86_400_000
    );
    expect(idle1).toBeLessThan(idleFromOldDate);
  });

  it("returns Infinity for null/undefined history", () => {
    expect(garmentDaysIdle("shirt1", null)).toBe(Infinity);
    expect(garmentDaysIdle("shirt1", undefined)).toBe(Infinity);
  });

  it("returns Infinity for null/undefined garmentId", () => {
    expect(garmentDaysIdle(null, history)).toBe(Infinity);
    expect(garmentDaysIdle(undefined, history)).toBe(Infinity);
  });

  it("returns Infinity for empty history", () => {
    expect(garmentDaysIdle("shirt1", [])).toBe(Infinity);
  });
});
