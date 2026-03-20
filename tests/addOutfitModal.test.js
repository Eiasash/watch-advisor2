import { describe, it, expect } from "vitest";
import { normalizeType } from "../src/classifier/normalizeType.js";

const OUTFIT_SLOTS = ["shirt", "sweater", "layer", "pants", "shoes", "jacket", "belt"];
const SLOT_ICONS = { shirt:"\u{1F454}", sweater:"\u{1FAA2}", layer:"\u{1F9E3}", pants:"\u{1F456}", shoes:"\u{1F45F}", jacket:"\u{1F9E5}", belt:"\u{1FAA2}" };

// ── AddOutfitModal garmentIds extraction ──────────────────────────────────────
// Mirrors the logic in AddOutfitModal: garmentIds = OUTFIT_SLOTS.map(s => outfitSlots[s]?.id).filter(Boolean)

function extractGarmentIds(outfitSlots) {
  return OUTFIT_SLOTS.map(s => outfitSlots[s]?.id).filter(Boolean);
}

describe("AddOutfitModal — extractGarmentIds", () => {
  it("extracts IDs from all filled slots", () => {
    const slots = {
      shirt: { id: "s1", type: "shirt" },
      pants: { id: "p1", type: "pants" },
      shoes: { id: "sh1", type: "shoes" },
    };
    const ids = extractGarmentIds(slots);
    expect(ids).toEqual(["s1", "p1", "sh1"]);
  });

  it("returns empty array when no slots filled", () => {
    expect(extractGarmentIds({})).toEqual([]);
  });

  it("skips null/undefined slots", () => {
    const slots = {
      shirt: { id: "s1", type: "shirt" },
      pants: null,
      shoes: undefined,
    };
    expect(extractGarmentIds(slots)).toEqual(["s1"]);
  });

  it("includes belt and sweater when present", () => {
    const slots = {
      shirt: { id: "s1" },
      sweater: { id: "sw1" },
      pants: { id: "p1" },
      shoes: { id: "sh1" },
      belt: { id: "b1" },
    };
    const ids = extractGarmentIds(slots);
    expect(ids).toContain("sw1");
    expect(ids).toContain("b1");
    expect(ids).toHaveLength(5);
  });

  it("preserves slot order (shirt, sweater, layer, pants, shoes, jacket, belt)", () => {
    const slots = {
      belt: { id: "b1" },
      shoes: { id: "sh1" },
      shirt: { id: "s1" },
      pants: { id: "p1" },
      jacket: { id: "j1" },
      sweater: { id: "sw1" },
      layer: { id: "l1" },
    };
    const ids = extractGarmentIds(slots);
    expect(ids).toEqual(["s1", "sw1", "l1", "p1", "sh1", "j1", "b1"]);
  });
});

// ── Slot swap logic ──────────────────────────────────────────────────────────
// Mirrors handleSlotSwap: setOutfitSlots(prev => ({ ...prev, [slot]: garment }))

function swapSlot(outfitSlots, slot, garment) {
  return { ...outfitSlots, [slot]: garment };
}

describe("AddOutfitModal — slot swap", () => {
  it("replaces existing garment in slot", () => {
    const initial = { shirt: { id: "s1", color: "white" }, pants: { id: "p1" } };
    const result = swapSlot(initial, "shirt", { id: "s2", color: "blue" });
    expect(result.shirt.id).toBe("s2");
    expect(result.shirt.color).toBe("blue");
    expect(result.pants.id).toBe("p1"); // unchanged
  });

  it("adds garment to empty slot", () => {
    const initial = { shirt: { id: "s1" } };
    const result = swapSlot(initial, "pants", { id: "p1" });
    expect(result.pants.id).toBe("p1");
    expect(result.shirt.id).toBe("s1");
  });

  it("does not mutate original object", () => {
    const initial = { shirt: { id: "s1" } };
    const result = swapSlot(initial, "shirt", { id: "s2" });
    expect(initial.shirt.id).toBe("s1");
    expect(result.shirt.id).toBe("s2");
  });
});

// ── Logged outfit chips — garment resolution ─────────────────────────────────
// Mirrors the logged chips logic: wornGs = entry.garmentIds.map(id => garments.find(g => g.id === id)).filter(Boolean)

function resolveWornGarments(garmentIds, garments) {
  return garmentIds.map(id => garments.find(g => g.id === id)).filter(Boolean);
}

describe("WeekPlanner — logged outfit chip garment resolution", () => {
  const garments = [
    { id: "s1", type: "shirt", color: "white", thumbnail: "thumb1" },
    { id: "p1", type: "pants", color: "navy", thumbnail: "thumb2" },
    { id: "sh1", type: "shoes", color: "brown", thumbnail: "thumb3" },
    { id: "j1", type: "jacket", color: "black", thumbnail: null },
  ];

  it("resolves all garment IDs to objects", () => {
    const result = resolveWornGarments(["s1", "p1", "sh1"], garments);
    expect(result).toHaveLength(3);
    expect(result[0].color).toBe("white");
    expect(result[1].color).toBe("navy");
    expect(result[2].color).toBe("brown");
  });

  it("filters out unknown IDs", () => {
    const result = resolveWornGarments(["s1", "UNKNOWN", "sh1"], garments);
    expect(result).toHaveLength(2);
    expect(result.map(g => g.id)).toEqual(["s1", "sh1"]);
  });

  it("returns empty for empty garmentIds", () => {
    expect(resolveWornGarments([], garments)).toEqual([]);
  });

  it("returns empty when garments list is empty", () => {
    expect(resolveWornGarments(["s1", "p1"], [])).toEqual([]);
  });

  it("each resolved garment has type for normalizeType fallback icon", () => {
    const result = resolveWornGarments(["s1", "p1"], garments);
    result.forEach(g => {
      const normalized = normalizeType(g.type);
      expect(SLOT_ICONS[normalized] ?? "•").toBeDefined();
    });
  });
});

// ── TodayPanel timeSlot label logic ──────────────────────────────────────────

const TIME_SLOT_LABELS = {
  morning: "\u{1F305} Morning",
  afternoon: "\u2600\uFE0F Afternoon",
  evening: "\u{1F306} Evening",
  night: "\u{1F319} Night",
};

function getEntryLabel(entry, index, totalEntries) {
  if (entry.timeSlot) {
    return TIME_SLOT_LABELS[entry.timeSlot] ?? entry.timeSlot;
  }
  if (totalEntries > 1) {
    return index === 0 ? "Primary" : `Outfit ${index + 1}`;
  }
  return null;
}

describe("TodayPanel — multi-outfit entry labels", () => {
  it("returns timeSlot label for morning", () => {
    expect(getEntryLabel({ timeSlot: "morning" }, 0, 2)).toContain("Morning");
  });

  it("returns timeSlot label for evening", () => {
    expect(getEntryLabel({ timeSlot: "evening" }, 1, 2)).toContain("Evening");
  });

  it("returns timeSlot label for afternoon", () => {
    expect(getEntryLabel({ timeSlot: "afternoon" }, 0, 1)).toContain("Afternoon");
  });

  it("returns timeSlot label for night", () => {
    expect(getEntryLabel({ timeSlot: "night" }, 0, 1)).toContain("Night");
  });

  it("returns 'Primary' for first entry without timeSlot when multiple entries", () => {
    expect(getEntryLabel({}, 0, 2)).toBe("Primary");
  });

  it("returns 'Outfit N' for subsequent entries without timeSlot", () => {
    expect(getEntryLabel({}, 1, 3)).toBe("Outfit 2");
    expect(getEntryLabel({}, 2, 3)).toBe("Outfit 3");
  });

  it("returns null for single entry without timeSlot", () => {
    expect(getEntryLabel({}, 0, 1)).toBe(null);
  });

  it("returns raw timeSlot string for unknown slot value", () => {
    expect(getEntryLabel({ timeSlot: "brunch" }, 0, 1)).toBe("brunch");
  });
});

// ── AddOutfitModal confirm payload ───────────────────────────────────────────

function buildConfirmPayload(timeSlot, watchId, notes, outfitSlots) {
  const garmentIds = OUTFIT_SLOTS.map(s => outfitSlots[s]?.id).filter(Boolean);
  return {
    timeSlot,
    watchId,
    notes: (notes ?? "").trim() || null,
    garmentIds,
  };
}

describe("AddOutfitModal — confirm payload", () => {
  it("includes timeSlot, watchId, notes, and garmentIds", () => {
    const payload = buildConfirmPayload("evening", "w1", "Eid dinner", {
      shirt: { id: "s1" },
      pants: { id: "p1" },
      shoes: { id: "sh1" },
    });
    expect(payload).toEqual({
      timeSlot: "evening",
      watchId: "w1",
      notes: "Eid dinner",
      garmentIds: ["s1", "p1", "sh1"],
    });
  });

  it("trims whitespace-only notes to null", () => {
    const payload = buildConfirmPayload("morning", "w1", "   ", {});
    expect(payload.notes).toBe(null);
  });

  it("trims notes with leading/trailing whitespace", () => {
    const payload = buildConfirmPayload("morning", "w1", "  date night  ", {});
    expect(payload.notes).toBe("date night");
  });

  it("sets null for empty notes", () => {
    const payload = buildConfirmPayload("night", "w1", "", {});
    expect(payload.notes).toBe(null);
  });

  it("sets null for undefined notes", () => {
    const payload = buildConfirmPayload("night", "w1", undefined, {});
    expect(payload.notes).toBe(null);
  });

  it("produces empty garmentIds when outfit is empty", () => {
    const payload = buildConfirmPayload("evening", "w1", null, {});
    expect(payload.garmentIds).toEqual([]);
  });

  it("includes all 7 slots when fully populated", () => {
    const slots = {
      shirt: { id: "s1" },
      sweater: { id: "sw1" },
      layer: { id: "l1" },
      pants: { id: "p1" },
      shoes: { id: "sh1" },
      jacket: { id: "j1" },
      belt: { id: "b1" },
    };
    const payload = buildConfirmPayload("afternoon", "w2", "full outfit", slots);
    expect(payload.garmentIds).toHaveLength(7);
    expect(payload.garmentIds).toEqual(["s1", "sw1", "l1", "p1", "sh1", "j1", "b1"]);
  });
});

// ── History entry creation from AddOutfitModal ───────────────────────────────

function buildHistoryEntry(date, ctx, payload) {
  return {
    id: `rotation-${date}-${payload.timeSlot}-${Date.now()}`,
    date,
    watchId: payload.watchId,
    garmentIds: payload.garmentIds ?? [],
    context: ctx ?? "smart-casual",
    timeSlot: payload.timeSlot,
    notes: payload.notes ?? null,
    loggedAt: new Date().toISOString(),
  };
}

describe("AddOutfitModal — history entry creation", () => {
  it("creates entry with garmentIds from payload", () => {
    const entry = buildHistoryEntry("2026-03-20", "smart-casual", {
      timeSlot: "evening",
      watchId: "w1",
      notes: "Dinner",
      garmentIds: ["s1", "p1", "sh1"],
    });
    expect(entry.garmentIds).toEqual(["s1", "p1", "sh1"]);
    expect(entry.timeSlot).toBe("evening");
    expect(entry.watchId).toBe("w1");
    expect(entry.notes).toBe("Dinner");
    expect(entry.date).toBe("2026-03-20");
    expect(entry.context).toBe("smart-casual");
    expect(entry.id).toContain("rotation-2026-03-20-evening");
  });

  it("defaults garmentIds to empty array when missing", () => {
    const entry = buildHistoryEntry("2026-03-20", "casual", {
      timeSlot: "night",
      watchId: "w2",
    });
    expect(entry.garmentIds).toEqual([]);
  });

  it("defaults context to smart-casual when null", () => {
    const entry = buildHistoryEntry("2026-03-20", null, {
      timeSlot: "morning",
      watchId: "w1",
      garmentIds: [],
    });
    expect(entry.context).toBe("smart-casual");
  });

  it("includes loggedAt timestamp", () => {
    const before = new Date().toISOString();
    const entry = buildHistoryEntry("2026-03-20", "formal", {
      timeSlot: "evening",
      watchId: "w1",
      garmentIds: ["s1"],
    });
    const after = new Date().toISOString();
    expect(entry.loggedAt >= before).toBe(true);
    expect(entry.loggedAt <= after).toBe(true);
  });
});
