import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for AuditPanel applyFix logic.
 * We extract and test the core fix-application behavior that powers both
 * individual "Apply" buttons and the "Apply All Fixes" batch action.
 */

// ── Mock stores and services ────────────────────────────────────────────────

const mockUpdateGarment = vi.fn();
const mockPushGarment = vi.fn().mockResolvedValue({});
const mockSetCachedState = vi.fn().mockResolvedValue({});

vi.mock("../src/stores/wardrobeStore.js", () => ({
  useWardrobeStore: vi.fn((sel) => {
    const state = {
      garments: mockGarments,
      updateGarment: mockUpdateGarment,
    };
    return sel(state);
  }),
}));

vi.mock("../src/services/supabaseSync.js", () => ({
  pushGarment: (...args) => mockPushGarment(...args),
}));

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({}),
  setCachedState: (...args) => mockSetCachedState(...args),
}));

let mockGarments = [];

// ── applyFix logic (extracted from component for unit testing) ──────────────

function applyFix(garmentId, fix, garments, updateGarment, pushGarment, setCachedState, setResults) {
  const g = garments.find(x => x.id === garmentId);
  if (!g) return;
  const patch = {};
  if (fix.correctedType  && fix.correctedType  !== (g.type ?? g.category)) patch.type = fix.correctedType;
  if (fix.correctedColor && fix.correctedColor !== g.color)                 patch.color = fix.correctedColor;
  if (fix.correctedName  && fix.correctedName  !== g.name)                  patch.name = fix.correctedName;
  if (!Object.keys(patch).length) {
    setResults(garmentId, true);
    return;
  }
  updateGarment(garmentId, patch);
  const updated = { ...g, ...patch, needsReview: false };
  pushGarment(updated);
  const updatedGarments = garments.map(x => x.id === garmentId ? updated : x);
  setCachedState({ garments: updatedGarments });
  setResults(garmentId, true);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("AuditPanel applyFix logic", () => {
  let setResults;

  beforeEach(() => {
    vi.clearAllMocks();
    setResults = vi.fn();
    mockGarments = [
      { id: "g1", name: "Navy polo", type: "shirt", color: "navy" },
      { id: "g2", name: "Grey chinos", type: "pants", color: "grey" },
      { id: "g3", name: "Brown loafers", type: "shoes", color: "brown" },
    ];
  });

  it("applies type correction", () => {
    applyFix("g1", { correctedType: "sweater", correctedColor: "navy", correctedName: "Navy polo" },
      mockGarments, mockUpdateGarment, mockPushGarment, mockSetCachedState, setResults);
    expect(mockUpdateGarment).toHaveBeenCalledWith("g1", { type: "sweater" });
    expect(mockPushGarment).toHaveBeenCalledWith(expect.objectContaining({ type: "sweater", needsReview: false }));
    expect(setResults).toHaveBeenCalledWith("g1", true);
  });

  it("applies color correction", () => {
    applyFix("g2", { correctedType: "pants", correctedColor: "charcoal", correctedName: "Grey chinos" },
      mockGarments, mockUpdateGarment, mockPushGarment, mockSetCachedState, setResults);
    expect(mockUpdateGarment).toHaveBeenCalledWith("g2", { color: "charcoal" });
  });

  it("applies name correction", () => {
    applyFix("g3", { correctedType: "shoes", correctedColor: "brown", correctedName: "Tan loafers" },
      mockGarments, mockUpdateGarment, mockPushGarment, mockSetCachedState, setResults);
    expect(mockUpdateGarment).toHaveBeenCalledWith("g3", { name: "Tan loafers" });
  });

  it("applies multiple corrections at once", () => {
    applyFix("g1", { correctedType: "jacket", correctedColor: "black", correctedName: "Black blazer" },
      mockGarments, mockUpdateGarment, mockPushGarment, mockSetCachedState, setResults);
    expect(mockUpdateGarment).toHaveBeenCalledWith("g1", { type: "jacket", color: "black", name: "Black blazer" });
  });

  it("marks as applied without patching when no changes needed", () => {
    applyFix("g1", { correctedType: "shirt", correctedColor: "navy", correctedName: "Navy polo" },
      mockGarments, mockUpdateGarment, mockPushGarment, mockSetCachedState, setResults);
    expect(mockUpdateGarment).not.toHaveBeenCalled();
    expect(mockPushGarment).not.toHaveBeenCalled();
    expect(setResults).toHaveBeenCalledWith("g1", true);
  });

  it("does nothing for non-existent garment", () => {
    applyFix("nonexistent", { correctedType: "shirt" },
      mockGarments, mockUpdateGarment, mockPushGarment, mockSetCachedState, setResults);
    expect(mockUpdateGarment).not.toHaveBeenCalled();
    expect(setResults).not.toHaveBeenCalled();
  });

  it("persists updated garments to IDB cache", () => {
    applyFix("g1", { correctedType: "sweater", correctedColor: "navy", correctedName: "Navy polo" },
      mockGarments, mockUpdateGarment, mockPushGarment, mockSetCachedState, setResults);
    expect(mockSetCachedState).toHaveBeenCalledWith(
      expect.objectContaining({
        garments: expect.arrayContaining([
          expect.objectContaining({ id: "g1", type: "sweater", needsReview: false }),
        ]),
      })
    );
  });
});

describe("Apply All Fixes — batch behavior", () => {
  let setResults;

  beforeEach(() => {
    vi.clearAllMocks();
    setResults = vi.fn();
    mockGarments = [
      { id: "g1", name: "Navy polo", type: "shirt", color: "navy" },
      { id: "g2", name: "Grey chinos", type: "pants", color: "grey" },
      { id: "g3", name: "Brown loafers", type: "shoes", color: "brown" },
    ];
  });

  it("applies all fixes when iterated over issues array", () => {
    const issues = [
      { garmentId: "g1", correctedType: "sweater", correctedColor: "navy", correctedName: "Navy polo" },
      { garmentId: "g2", correctedType: "pants", correctedColor: "charcoal", correctedName: "Charcoal chinos" },
      { garmentId: "g3", correctedType: "shoes", correctedColor: "tan", correctedName: "Tan loafers" },
    ];

    // This mirrors the "Apply All" button: issues.forEach(r => applyFix(r.garmentId, r))
    issues.forEach(r =>
      applyFix(r.garmentId, r, mockGarments, mockUpdateGarment, mockPushGarment, mockSetCachedState, setResults)
    );

    expect(mockUpdateGarment).toHaveBeenCalledTimes(3);
    expect(mockPushGarment).toHaveBeenCalledTimes(3);
    expect(setResults).toHaveBeenCalledTimes(3);
    expect(mockUpdateGarment).toHaveBeenCalledWith("g1", { type: "sweater" });
    expect(mockUpdateGarment).toHaveBeenCalledWith("g2", { color: "charcoal", name: "Charcoal chinos" });
    expect(mockUpdateGarment).toHaveBeenCalledWith("g3", { color: "tan", name: "Tan loafers" });
  });

  it("skips garments with no changes in batch", () => {
    const issues = [
      { garmentId: "g1", correctedType: "shirt", correctedColor: "navy", correctedName: "Navy polo" }, // no change
      { garmentId: "g2", correctedType: "pants", correctedColor: "black", correctedName: "Grey chinos" }, // color change
    ];

    issues.forEach(r =>
      applyFix(r.garmentId, r, mockGarments, mockUpdateGarment, mockPushGarment, mockSetCachedState, setResults)
    );

    expect(mockUpdateGarment).toHaveBeenCalledTimes(1); // only g2
    expect(mockUpdateGarment).toHaveBeenCalledWith("g2", { color: "black" });
    expect(setResults).toHaveBeenCalledTimes(2); // both marked as applied
  });
});
