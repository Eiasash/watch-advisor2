import { describe, it, expect, vi } from "vitest";

// Mocks for rotationFactor / repetitionFactor dependencies.
// categoryRotationMultiplier (from scoringWeights.js) is intentionally NOT
// mocked — it's the real function under test.
vi.mock("../src/domain/rotationStats.js", () => ({
  garmentDaysIdle: vi.fn(() => 14),
  rotationPressure: vi.fn(() => 0.5),
}));
vi.mock("../src/config/scoringOverrides.js", () => ({
  getOverride: vi.fn((key, dflt) => dflt),
}));
vi.mock("../src/domain/contextMemory.js", () => ({
  repetitionPenalty: vi.fn(() => -0.28),
}));

import {
  categoryRotationMultiplier,
  CATEGORY_ROTATION_MULTIPLIER,
} from "../src/config/scoringWeights.js";
import rotationFactor from "../src/outfitEngine/scoringFactors/rotationFactor.js";
import repetitionFactor from "../src/outfitEngine/scoringFactors/repetitionFactor.js";
import diversityFactor from "../src/outfitEngine/scoringFactors/diversityFactor.js";

// ── categoryRotationMultiplier (pure) ─────────────────────────────────────────

describe("categoryRotationMultiplier", () => {
  it("shoes → 0 (rotation-neutral)", () => {
    expect(categoryRotationMultiplier({ type: "shoes" })).toBe(0);
  });

  it("pants → 0.4 (relieved)", () => {
    expect(categoryRotationMultiplier({ type: "pants" })).toBe(0.4);
  });

  it("shirt / jacket / sweater → 1 (unchanged)", () => {
    expect(categoryRotationMultiplier({ type: "shirt" })).toBe(1);
    expect(categoryRotationMultiplier({ type: "jacket" })).toBe(1);
    expect(categoryRotationMultiplier({ type: "sweater" })).toBe(1);
  });

  it("falls back to .category when .type is absent", () => {
    expect(categoryRotationMultiplier({ category: "shoes" })).toBe(0);
    expect(categoryRotationMultiplier({ category: "pants" })).toBe(0.4);
  });

  it("is case-insensitive", () => {
    expect(categoryRotationMultiplier({ type: "Shoes" })).toBe(0);
    expect(categoryRotationMultiplier({ type: "PANTS" })).toBe(0.4);
  });

  it("null / undefined / empty garment → 1 (no damping)", () => {
    expect(categoryRotationMultiplier(null)).toBe(1);
    expect(categoryRotationMultiplier(undefined)).toBe(1);
    expect(categoryRotationMultiplier({})).toBe(1);
  });

  it("config exposes shoes 0 and pants 0.4", () => {
    expect(CATEGORY_ROTATION_MULTIPLIER.shoes).toBe(0);
    expect(CATEGORY_ROTATION_MULTIPLIER.pants).toBe(0.4);
  });
});

// ── rotationFactor damping ────────────────────────────────────────────────────

describe("rotationFactor — per-category damping", () => {
  it("shoes → 0 (no rotation pressure at all)", () => {
    expect(
      rotationFactor({ garment: { id: "s1", type: "shoes" } }, { history: [] }),
    ).toBe(0);
  });

  it("pants → relieved ×0.4", () => {
    // rotationPressure 0.5 × override 0.40 × 0.4
    expect(
      rotationFactor({ garment: { id: "p1", type: "pants" } }, { history: [] }),
    ).toBeCloseTo(0.5 * 0.4 * 0.4, 5);
  });

  it("shirt → full pressure ×1", () => {
    expect(
      rotationFactor({ garment: { id: "sh1", type: "shirt" } }, { history: [] }),
    ).toBeCloseTo(0.5 * 0.4, 5);
  });
});

// ── repetitionFactor damping ──────────────────────────────────────────────────

describe("repetitionFactor — per-category damping", () => {
  it("shoes → 0 (repetition penalty fully dropped)", () => {
    expect(
      repetitionFactor(
        { garment: { id: "s1", type: "shoes" }, diversityBonus: 0 },
        { history: [] },
      ),
    ).toBe(0);
  });

  it("pants → relieved ×0.4", () => {
    expect(
      repetitionFactor(
        { garment: { id: "p1", type: "pants" }, diversityBonus: 0 },
        { history: [] },
      ),
    ).toBeCloseTo(-0.28 * 0.4, 5);
  });

  it("shirt → full -0.28 penalty", () => {
    expect(
      repetitionFactor(
        { garment: { id: "sh1", type: "shirt" }, diversityBonus: 0 },
        { history: [] },
      ),
    ).toBe(-0.28);
  });
});

// ── diversityFactor damping ───────────────────────────────────────────────────

describe("diversityFactor — per-category damping", () => {
  it("shoes → 0 even when a diversity penalty is present", () => {
    expect(
      diversityFactor({ garment: { id: "s1", type: "shoes" }, diversityBonus: -0.36 }),
    ).toBe(0);
  });

  it("pants → relieved ×0.4", () => {
    expect(
      diversityFactor({ garment: { id: "p1", type: "pants" }, diversityBonus: -0.3 }),
    ).toBeCloseTo(-0.3 * 0.4, 5);
  });

  it("shirt → full penalty", () => {
    expect(
      diversityFactor({ garment: { id: "sh1", type: "shirt" }, diversityBonus: -0.24 }),
    ).toBe(-0.24);
  });

  it("zero bonus → 0 regardless of slot", () => {
    expect(diversityFactor({ garment: { id: "s1", type: "shoes" }, diversityBonus: 0 })).toBe(0);
    expect(diversityFactor({ garment: { id: "p1", type: "pants" }, diversityBonus: 0 })).toBe(0);
  });
});
