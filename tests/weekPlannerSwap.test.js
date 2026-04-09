import { describe, it, expect } from "vitest";

/**
 * Tests for WeekPlanner swap/override logic — pure function extraction.
 * handleSwapGarment sets outfitOverrides[date][slot] = garment?.id ?? null
 * handleShuffle increments shuffle seed mod 12
 * handleResetOutfit clears both shuffle seed and overrides for a date
 */

describe("handleSwapGarment logic", () => {
  // Simulates the core logic from WeekPlanner.jsx:1105-1112
  function applySwap(prev, date, slot, garment) {
    return {
      ...prev,
      [date]: { ...(prev[date] ?? {}), [slot]: garment?.id ?? null },
    };
  }

  it("sets slot to garment id when garment is provided", () => {
    const result = applySwap({}, "2026-04-09", "shirt", { id: "g1", name: "Navy Polo" });
    expect(result["2026-04-09"].shirt).toBe("g1");
  });

  it("sets slot to null when garment is null (None — remove)", () => {
    const prev = { "2026-04-09": { shirt: "g1", pants: "g2" } };
    const result = applySwap(prev, "2026-04-09", "shirt", null);
    expect(result["2026-04-09"].shirt).toBeNull();
    // pants should be preserved
    expect(result["2026-04-09"].pants).toBe("g2");
  });

  it("sets slot to null when garment is undefined", () => {
    const result = applySwap({}, "2026-04-09", "shoes", undefined);
    expect(result["2026-04-09"].shoes).toBeNull();
  });

  it("preserves other dates when swapping", () => {
    const prev = { "2026-04-08": { shirt: "g5" } };
    const result = applySwap(prev, "2026-04-09", "shirt", { id: "g1" });
    expect(result["2026-04-08"].shirt).toBe("g5");
    expect(result["2026-04-09"].shirt).toBe("g1");
  });

  it("can override the same slot multiple times", () => {
    let state = {};
    state = applySwap(state, "2026-04-09", "shirt", { id: "g1" });
    expect(state["2026-04-09"].shirt).toBe("g1");
    state = applySwap(state, "2026-04-09", "shirt", { id: "g2" });
    expect(state["2026-04-09"].shirt).toBe("g2");
    state = applySwap(state, "2026-04-09", "shirt", null);
    expect(state["2026-04-09"].shirt).toBeNull();
  });

  it("supports all outfit slot types", () => {
    let state = {};
    const slots = ["shirt", "pants", "shoes", "jacket"];
    for (const slot of slots) {
      state = applySwap(state, "2026-04-09", slot, { id: `${slot}_1` });
    }
    expect(Object.keys(state["2026-04-09"])).toEqual(slots);
  });
});

describe("handleShuffle logic", () => {
  function applyShuffle(prev, date) {
    return { ...prev, [date]: ((prev[date] ?? 0) + 1) % 12 };
  }

  it("increments seed from 0 to 1", () => {
    const result = applyShuffle({}, "2026-04-09");
    expect(result["2026-04-09"]).toBe(1);
  });

  it("wraps around at 12 back to 0", () => {
    const result = applyShuffle({ "2026-04-09": 11 }, "2026-04-09");
    expect(result["2026-04-09"]).toBe(0);
  });

  it("preserves other dates", () => {
    const prev = { "2026-04-08": 3 };
    const result = applyShuffle(prev, "2026-04-09");
    expect(result["2026-04-08"]).toBe(3);
    expect(result["2026-04-09"]).toBe(1);
  });
});

describe("handleResetOutfit logic", () => {
  function applyReset(shuffleSeeds, overrides, date) {
    const newSeeds = { ...shuffleSeeds };
    delete newSeeds[date];
    const newOverrides = { ...overrides };
    delete newOverrides[date];
    return { shuffleSeeds: newSeeds, overrides: newOverrides };
  }

  it("clears both shuffle seed and overrides for the date", () => {
    const result = applyReset(
      { "2026-04-09": 5, "2026-04-10": 2 },
      { "2026-04-09": { shirt: "g1" }, "2026-04-10": { pants: "g2" } },
      "2026-04-09"
    );
    expect(result.shuffleSeeds["2026-04-09"]).toBeUndefined();
    expect(result.overrides["2026-04-09"]).toBeUndefined();
    // Other dates preserved
    expect(result.shuffleSeeds["2026-04-10"]).toBe(2);
    expect(result.overrides["2026-04-10"].pants).toBe("g2");
  });

  it("is safe to call on non-existent date", () => {
    const result = applyReset({}, {}, "2026-04-09");
    expect(result.shuffleSeeds).toEqual({});
    expect(result.overrides).toEqual({});
  });
});

describe("OutfitSlotChip None — remove option", () => {
  // The OutfitSlotChip calls onSwap(slot, null) when "None — remove" is clicked
  // This should result in the override being set to null for that slot

  it("onSwap with null clears the slot", () => {
    const overrides = {};
    function onSwap(slot, garment) {
      overrides[slot] = garment?.id ?? null;
    }
    onSwap("shirt", null);
    expect(overrides.shirt).toBeNull();
  });

  it("onSwap with garment sets the id", () => {
    const overrides = {};
    function onSwap(slot, garment) {
      overrides[slot] = garment?.id ?? null;
    }
    onSwap("pants", { id: "g3", name: "Khaki Chinos" });
    expect(overrides.pants).toBe("g3");
  });
});

describe("Logged outfit overrides (_isLogged entries)", () => {
  // When an outfit is logged, it has _isLogged flag but can still be overridden
  // by the user swapping garments in WeekPlanner

  it("override applies on top of logged outfit", () => {
    const loggedOutfit = {
      _isLogged: true,
      shirt: { id: "g1", name: "Navy Polo" },
      pants: { id: "g2", name: "Khaki Chinos" },
      shoes: { id: "g3", name: "Brown Derby" },
    };

    // User overrides the shirt
    const overrides = { shirt: "g10" };

    // Resolution logic: override wins if present
    function resolveSlot(slot, logged, override) {
      if (override !== undefined) return override;
      return logged?.[slot]?.id ?? null;
    }

    expect(resolveSlot("shirt", loggedOutfit, overrides.shirt)).toBe("g10");
    expect(resolveSlot("pants", loggedOutfit, overrides.pants)).toBe("g2");
    expect(resolveSlot("shoes", loggedOutfit, overrides.shoes)).toBe("g3");
  });

  it("null override removes slot even from logged outfit", () => {
    const loggedOutfit = {
      _isLogged: true,
      jacket: { id: "g5", name: "Navy Blazer" },
    };
    const overrides = { jacket: null };

    function resolveSlot(slot, logged, override) {
      if (override !== undefined) return override;
      return logged?.[slot]?.id ?? null;
    }

    expect(resolveSlot("jacket", loggedOutfit, overrides.jacket)).toBeNull();
  });
});
