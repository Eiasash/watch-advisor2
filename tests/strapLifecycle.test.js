import { describe, it, expect } from "vitest";
import { buildStrapLifecycle, strapsNeedingAttention } from "../src/domain/strapLifecycle.js";

const watches = [
  {
    id: "speedmaster",
    model: "Speedmaster",
    straps: [
      { id: "strap-leather", label: "Black leather", type: "leather" },
      { id: "strap-bracelet", label: "Steel bracelet", type: "bracelet" },
    ],
  },
  {
    id: "reverso",
    model: "Reverso",
    straps: [
      { id: "strap-alligator", label: "Navy alligator", type: "alligator" },
    ],
  },
];

function makeHistory(strapId, strapLabel, watchId, count) {
  return Array.from({ length: count }, (_, i) => ({
    strapId,
    strapLabel,
    watchId,
    date: `2026-0${Math.min(9, Math.floor(i / 30) + 1)}-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
}

describe("buildStrapLifecycle — lifespan estimation", () => {
  it("estimates bracelet lifespan as Infinity", () => {
    const history = makeHistory("strap-bracelet", "Steel bracelet", "speedmaster", 100);
    const result = buildStrapLifecycle(history, watches);
    const bracelet = result.find(s => s.strapId === "strap-bracelet");
    expect(bracelet.lifespan).toBe(Infinity);
    expect(bracelet.remaining).toBe(Infinity);
    expect(bracelet.healthPct).toBe(100);
  });

  it("estimates leather lifespan as 350", () => {
    const history = makeHistory("strap-leather", "Black leather", "speedmaster", 50);
    const result = buildStrapLifecycle(history, watches);
    const leather = result.find(s => s.strapId === "strap-leather");
    expect(leather.lifespan).toBe(350);
    expect(leather.remaining).toBe(300);
  });

  it("estimates alligator lifespan as 280", () => {
    const history = makeHistory("strap-alligator", "Navy alligator", "reverso", 10);
    const result = buildStrapLifecycle(history, watches);
    const alligator = result.find(s => s.strapId === "strap-alligator");
    expect(alligator.lifespan).toBe(280);
  });

  it("detects canvas from label", () => {
    const history = makeHistory(null, "Grey canvas NATO", "speedmaster", 5);
    const result = buildStrapLifecycle(history, watches);
    expect(result[0].lifespan).toBe(500);
  });

  it("detects rubber from label", () => {
    const history = makeHistory(null, "Black rubber", "speedmaster", 5);
    const result = buildStrapLifecycle(history, watches);
    expect(result[0].lifespan).toBe(600);
  });

  it("uses default 400 for unknown type", () => {
    const history = makeHistory(null, "Mystery material", "speedmaster", 5);
    const result = buildStrapLifecycle(history, watches);
    expect(result[0].lifespan).toBe(400);
  });
});

describe("buildStrapLifecycle — wear tracking", () => {
  it("counts wears correctly", () => {
    const history = makeHistory("strap-leather", "Black leather", "speedmaster", 42);
    const result = buildStrapLifecycle(history, watches);
    const leather = result.find(s => s.strapId === "strap-leather");
    expect(leather.wearCount).toBe(42);
  });

  it("tracks first and last worn dates", () => {
    const history = [
      { strapId: "strap-leather", watchId: "speedmaster", date: "2026-01-15" },
      { strapId: "strap-leather", watchId: "speedmaster", date: "2026-03-20" },
      { strapId: "strap-leather", watchId: "speedmaster", date: "2026-02-10" },
    ];
    const result = buildStrapLifecycle(history, watches);
    const leather = result.find(s => s.strapId === "strap-leather");
    expect(leather.firstWorn).toBe("2026-01-15");
    expect(leather.lastWorn).toBe("2026-03-20");
  });

  it("calculates health percentage", () => {
    const history = makeHistory("strap-leather", "Black leather", "speedmaster", 175);
    const result = buildStrapLifecycle(history, watches);
    const leather = result.find(s => s.strapId === "strap-leather");
    // 175/350 = 50% used → 50% health
    expect(leather.healthPct).toBe(50);
  });

  it("health never goes below 0", () => {
    const history = makeHistory("strap-leather", "Black leather", "speedmaster", 500);
    const result = buildStrapLifecycle(history, watches);
    const leather = result.find(s => s.strapId === "strap-leather");
    expect(leather.healthPct).toBe(0);
    expect(leather.remaining).toBe(0);
  });

  it("includes watch model from watches array", () => {
    const history = makeHistory("strap-leather", "Black leather", "speedmaster", 5);
    const result = buildStrapLifecycle(history, watches);
    expect(result[0].watchModel).toBe("Speedmaster");
  });
});

describe("buildStrapLifecycle — edge cases", () => {
  it("handles null history", () => {
    expect(buildStrapLifecycle(null, watches)).toEqual([]);
  });

  it("handles empty history", () => {
    expect(buildStrapLifecycle([], watches)).toEqual([]);
  });

  it("skips entries without strapId or strapLabel", () => {
    const history = [
      { watchId: "speedmaster", date: "2026-01-01" }, // no strap info
    ];
    expect(buildStrapLifecycle(history, watches)).toEqual([]);
  });

  it("filters out straps with 0 wears", () => {
    // This shouldn't happen naturally, but guard is there
    const result = buildStrapLifecycle([], watches);
    expect(result.length).toBe(0);
  });

  it("uses strapLabel as fallback key when strapId missing", () => {
    const history = [
      { strapLabel: "Custom strap", watchId: "speedmaster", date: "2026-01-01" },
      { strapLabel: "Custom strap", watchId: "speedmaster", date: "2026-01-02" },
    ];
    const result = buildStrapLifecycle(history, watches);
    expect(result[0].strapLabel).toBe("Custom strap");
    expect(result[0].wearCount).toBe(2);
  });

  it("sorts by health percentage ascending (worst first)", () => {
    const history = [
      ...makeHistory("strap-leather", "Black leather", "speedmaster", 300), // bad health
      ...makeHistory("strap-alligator", "Navy alligator", "reverso", 10), // good health
    ];
    const result = buildStrapLifecycle(history, watches);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].healthPct).toBeLessThanOrEqual(result[i].healthPct);
    }
  });

  it("computes replacement date for finite-life straps", () => {
    const history = [
      { strapId: "strap-leather", watchId: "speedmaster", date: "2026-01-01" },
      { strapId: "strap-leather", watchId: "speedmaster", date: "2026-02-01" },
      { strapId: "strap-leather", watchId: "speedmaster", date: "2026-03-01" },
    ];
    const result = buildStrapLifecycle(history, watches);
    const leather = result.find(s => s.strapId === "strap-leather");
    expect(leather.replacementDate).not.toBeNull();
    // Should be a YYYY-MM-DD formatted string
    expect(leather.replacementDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("no replacement date for bracelets", () => {
    const history = makeHistory("strap-bracelet", "Steel bracelet", "speedmaster", 100);
    const result = buildStrapLifecycle(history, watches);
    const bracelet = result.find(s => s.strapId === "strap-bracelet");
    expect(bracelet.replacementDate).toBeNull();
  });
});

describe("strapsNeedingAttention", () => {
  it("flags straps with health < 30%", () => {
    const lifecycle = [
      { strapId: "s1", healthPct: 25, remaining: 100 },
      { strapId: "s2", healthPct: 80, remaining: 200 },
    ];
    const result = strapsNeedingAttention(lifecycle);
    expect(result.length).toBe(1);
    expect(result[0].strapId).toBe("s1");
  });

  it("flags straps with < 50 remaining wears", () => {
    const lifecycle = [
      { strapId: "s1", healthPct: 50, remaining: 30 },
      { strapId: "s2", healthPct: 50, remaining: 200 },
    ];
    const result = strapsNeedingAttention(lifecycle);
    expect(result.length).toBe(1);
    expect(result[0].strapId).toBe("s1");
  });

  it("excludes bracelets (infinite remaining)", () => {
    const lifecycle = [
      { strapId: "s1", healthPct: 100, remaining: Infinity },
    ];
    expect(strapsNeedingAttention(lifecycle)).toEqual([]);
  });

  it("returns empty for healthy straps", () => {
    const lifecycle = [
      { strapId: "s1", healthPct: 80, remaining: 200 },
      { strapId: "s2", healthPct: 60, remaining: 150 },
    ];
    expect(strapsNeedingAttention(lifecycle)).toEqual([]);
  });
});
