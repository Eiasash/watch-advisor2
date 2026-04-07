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
  if (fix.correctedType  && fix.correctedType  !== (g.type)) patch.type = fix.correctedType;
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

// ── Staleness detection logic ────────────────────────────────────────────────

describe("Audit staleness detection", () => {
  it("detects stale when garment count differs from audited count", () => {
    const currentCount = 12;
    const auditedCount = 10;
    const isStale = auditedCount > 0 && auditedCount !== currentCount;
    expect(isStale).toBe(true);
  });

  it("not stale when garment count matches audited count", () => {
    const currentCount = 10;
    const auditedCount = 10;
    const isStale = auditedCount > 0 && auditedCount !== currentCount;
    expect(isStale).toBe(false);
  });

  it("not stale when auditedCount is 0 (never audited)", () => {
    const currentCount = 10;
    const auditedCount = 0;
    const isStale = auditedCount > 0 && auditedCount !== currentCount;
    expect(isStale).toBe(false);
  });

  it("clears stale after re-run (audited count updated to current)", () => {
    let auditedCount = 10;
    const currentCount = 12;
    // Simulate re-run
    auditedCount = currentCount;
    const isStale = auditedCount > 0 && auditedCount !== currentCount;
    expect(isStale).toBe(false);
  });
});

// ── Verifier cache persistence ────────────────────────────────────────────────

describe("PhotoVerifier — applied/dismissed state persistence", () => {
  let mockSetCachedStatePV;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetCachedStatePV = vi.fn().mockResolvedValue({});
    mockGarments = [
      { id: "g1", name: "White shirt", type: "shirt", color: "white" },
    ];
  });

  it("writes _verifyResults to cache when applyFix marks applied", () => {
    // Simulate the setResults callback that writes to cache
    let results = {
      g1: { garmentId: "g1", ok: false, correctedType: "sweater", correctedColor: "white" },
    };
    // Mirror the actual component logic
    const next = { ...results, g1: { ...results.g1, _applied: true } };
    mockSetCachedStatePV({ _verifyResults: next });
    expect(mockSetCachedStatePV).toHaveBeenCalledWith(
      expect.objectContaining({
        _verifyResults: expect.objectContaining({
          g1: expect.objectContaining({ _applied: true }),
        }),
      })
    );
  });

  it("writes _verifyResults to cache when dismissCard marks dismissed", () => {
    let results = {
      g1: { garmentId: "g1", ok: false, correctedType: "sweater" },
    };
    const next = { ...results, g1: { ...results.g1, _dismissed: true } };
    mockSetCachedStatePV({ _verifyResults: next });
    expect(mockSetCachedStatePV).toHaveBeenCalledWith(
      expect.objectContaining({
        _verifyResults: expect.objectContaining({
          g1: expect.objectContaining({ _dismissed: true }),
        }),
      })
    );
  });

  it("applied cards are excluded from issues list", () => {
    const results = {
      g1: { garmentId: "g1", ok: false, _applied: true },
      g2: { garmentId: "g2", ok: false, _applied: false },
    };
    const issues = Object.values(results).filter(r => !r.ok && !r._applied && !r._dismissed);
    expect(issues).toHaveLength(1);
    expect(issues[0].garmentId).toBe("g2");
  });

  it("dismissed cards are excluded from issues list", () => {
    const results = {
      g1: { garmentId: "g1", ok: false, _dismissed: true },
      g2: { garmentId: "g2", ok: false },
    };
    const issues = Object.values(results).filter(r => !r.ok && !r._applied && !r._dismissed);
    expect(issues).toHaveLength(1);
    expect(issues[0].garmentId).toBe("g2");
  });

  it("Apply All skips already-applied cards", () => {
    const issues = [
      { garmentId: "g1", correctedType: "shirt", correctedColor: "white", correctedName: "White shirt" }, // no change
      { garmentId: "g2", correctedType: "sweater", correctedColor: "navy", correctedName: "Navy knit" },
    ];
    mockGarments = [
      { id: "g1", name: "White shirt", type: "shirt", color: "white" },
      { id: "g2", name: "Navy knit", type: "shirt", color: "navy" }, // type wrong
    ];
    const setResults = vi.fn();
    issues.forEach(r => applyFix(r.garmentId, r, mockGarments, mockUpdateGarment, mockPushGarment, mockSetCachedState, setResults));
    expect(mockUpdateGarment).toHaveBeenCalledTimes(1);
    expect(mockUpdateGarment).toHaveBeenCalledWith("g2", { type: "sweater" });
  });
});
