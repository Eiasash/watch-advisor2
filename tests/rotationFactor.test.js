import { describe, it, expect, vi } from "vitest";

// Mock dependencies
vi.mock("../src/domain/rotationStats.js", () => ({
  garmentDaysIdle: vi.fn(() => 14),
  rotationPressure: vi.fn(() => 0.5),
}));

vi.mock("../src/config/scoringOverrides.js", () => ({
  getOverride: vi.fn((key, defaultVal) => defaultVal),
}));

import rotationFactor from "../src/outfitEngine/scoringFactors/rotationFactor.js";
import { garmentDaysIdle, rotationPressure } from "../src/domain/rotationStats.js";
import { getOverride } from "../src/config/scoringOverrides.js";

describe("rotationFactor", () => {
  // ── Normal operation ──────────────────────────────────────────────────────

  it("returns rotationPressure × default multiplier (0.40)", () => {
    rotationPressure.mockReturnValueOnce(0.5);
    const result = rotationFactor(
      { garment: { id: "g1" } },
      { history: [] }
    );
    expect(result).toBeCloseTo(0.5 * 0.40, 5);
  });

  it("calls garmentDaysIdle with garment id and history", () => {
    const history = [{ id: "h1", garmentIds: ["g1"] }];
    rotationFactor({ garment: { id: "g1" } }, { history });
    expect(garmentDaysIdle).toHaveBeenCalledWith("g1", history);
  });

  it("calls rotationPressure with idle days", () => {
    garmentDaysIdle.mockReturnValueOnce(21);
    rotationFactor({ garment: { id: "g1" } }, { history: [] });
    expect(rotationPressure).toHaveBeenCalledWith(21);
  });

  it("uses getOverride for the multiplier", () => {
    rotationPressure.mockReturnValueOnce(0.8);
    rotationFactor({ garment: { id: "g1" } }, { history: [] });
    expect(getOverride).toHaveBeenCalledWith("rotationFactor", 0.40);
  });

  it("respects custom override multiplier", () => {
    rotationPressure.mockReturnValueOnce(0.5);
    getOverride.mockReturnValueOnce(0.60);
    const result = rotationFactor({ garment: { id: "g1" } }, { history: [] });
    expect(result).toBeCloseTo(0.5 * 0.60, 5);
  });

  // ── Guard: no garment id ──────────────────────────────────────────────────

  it("returns 0 when garment has no id", () => {
    expect(rotationFactor({ garment: {} }, { history: [] })).toBe(0);
  });

  it("returns 0 when garment is null", () => {
    expect(rotationFactor({ garment: null }, { history: [] })).toBe(0);
  });

  it("returns 0 when garment is undefined", () => {
    expect(rotationFactor({}, { history: [] })).toBe(0);
  });

  // ── Edge: never-worn garment ──────────────────────────────────────────────

  it("handles never-worn garment (Infinity idle days)", () => {
    garmentDaysIdle.mockReturnValueOnce(Infinity);
    rotationPressure.mockReturnValueOnce(0.50);
    const result = rotationFactor({ garment: { id: "new" } }, { history: [] });
    expect(result).toBeCloseTo(0.50 * 0.40, 5);
  });

  // ── Edge: recently worn garment ───────────────────────────────────────────

  it("handles recently-worn garment (0 idle days)", () => {
    garmentDaysIdle.mockReturnValueOnce(0);
    rotationPressure.mockReturnValueOnce(0.03);
    const result = rotationFactor({ garment: { id: "g1" } }, { history: [] });
    expect(result).toBeCloseTo(0.03 * 0.40, 5);
  });
});
