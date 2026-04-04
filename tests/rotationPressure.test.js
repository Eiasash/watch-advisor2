import { describe, it, expect } from "vitest";
import { rotationPressure, garmentDaysIdle } from "../src/domain/rotationStats.js";

// ── rotationPressure ──────────────────────────────────────────────────────────

describe("rotationPressure", () => {
  it("returns near 0 when daysIdle = 0 (just worn)", () => {
    const p = rotationPressure(0);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.1); // well below 10%
  });

  it("returns ~0.5 at the midpoint (daysIdle = 14)", () => {
    const p = rotationPressure(14);
    expect(p).toBeCloseTo(0.5, 2);
  });

  it("approaches 1 for large daysIdle", () => {
    const p = rotationPressure(60);
    expect(p).toBeGreaterThan(0.95);
    expect(p).toBeLessThan(1);
  });

  it("returns 0.50 for Infinity (never worn — encourages first wear)", () => {
    expect(rotationPressure(Infinity)).toBe(0.50);
  });

  it("returns 0.50 for negative input", () => {
    expect(rotationPressure(-5)).toBe(0.50);
  });

  it("returns 0.50 for NaN", () => {
    expect(rotationPressure(NaN)).toBe(0.50);
  });

  it("is monotonically increasing with daysIdle", () => {
    const days = [1, 7, 14, 21, 30, 60];
    const pressures = days.map(rotationPressure);
    for (let i = 1; i < pressures.length; i++) {
      expect(pressures[i]).toBeGreaterThan(pressures[i - 1]);
    }
  });

  it("pressure at 28d (one month) is clearly above 0.8", () => {
    expect(rotationPressure(28)).toBeGreaterThan(0.8);
  });

  it("produces symmetric logistic curve around midpoint", () => {
    // pressure(14 - d) = 1 - pressure(14 + d) by logistic symmetry
    const d = 7;
    const below = rotationPressure(14 - d);
    const above = rotationPressure(14 + d);
    expect(below + above).toBeCloseTo(1, 5);
  });
});

// ── garmentDaysIdle ───────────────────────────────────────────────────────────

describe("garmentDaysIdle", () => {
  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  it("returns Infinity when garment has never been worn", () => {
    expect(garmentDaysIdle("g1", [])).toBe(Infinity);
  });

  it("returns 0 when garment was worn today", () => {
    const history = [{ garmentIds: ["g1"], date: daysAgo(0) }];
    expect(garmentDaysIdle("g1", history)).toBe(0);
  });

  it("returns correct idle days for past wear", () => {
    const history = [{ garmentIds: ["g1", "g2"], date: daysAgo(5) }];
    expect(garmentDaysIdle("g1", history)).toBe(5);
  });

  it("uses most recent wear date when multiple entries exist", () => {
    const history = [
      { garmentIds: ["g1"], date: daysAgo(10) },
      { garmentIds: ["g1"], date: daysAgo(3) },
      { garmentIds: ["g1"], date: daysAgo(7) },
    ];
    expect(garmentDaysIdle("g1", history)).toBe(3);
  });

  it("ignores entries that don't include the garment", () => {
    const history = [{ garmentIds: ["g2"], date: daysAgo(1) }];
    expect(garmentDaysIdle("g1", history)).toBe(Infinity);
  });

  it("reads from payload.garmentIds when garmentIds is absent", () => {
    const history = [{ payload: { garmentIds: ["g1"] }, date: daysAgo(4) }];
    expect(garmentDaysIdle("g1", history)).toBe(4);
  });

  it("handles null/undefined history gracefully", () => {
    expect(garmentDaysIdle("g1", null)).toBe(Infinity);
    expect(garmentDaysIdle("g1", undefined)).toBe(Infinity);
  });
});
