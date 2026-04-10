import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({}),
  setCachedState: vi.fn().mockResolvedValue(undefined),
}));

import { useRejectStore } from "../src/stores/rejectStore.js";

describe("rejectStore — isRejected vs isRecentlyRejected edge cases", () => {
  beforeEach(() => {
    useRejectStore.setState({ entries: [] });
  });

  // ── isRejected threshold behavior ─────────────────────────────────────────

  describe("isRejected threshold", () => {
    it("single-garment outfit: requires 1 overlap (Math.min(2,1)=1)", () => {
      useRejectStore.getState().addRejection("w1", ["g1"]);
      // Query with the same single garment
      expect(useRejectStore.getState().isRejected("w1", ["g1"])).toBe(true);
    });

    it("two-garment query: requires 2 overlaps", () => {
      useRejectStore.getState().addRejection("w1", ["g1", "g2", "g3"]);
      // Only 1 overlap — not enough
      expect(useRejectStore.getState().isRejected("w1", ["g1", "g4"])).toBe(false);
      // 2 overlaps — sufficient
      expect(useRejectStore.getState().isRejected("w1", ["g1", "g2"])).toBe(true);
    });

    it("three-garment query: still only requires 2 overlaps", () => {
      useRejectStore.getState().addRejection("w1", ["g1", "g2", "g3"]);
      // 2 out of 3 overlap
      expect(useRejectStore.getState().isRejected("w1", ["g1", "g2", "g4"])).toBe(true);
    });

    it("empty garmentIds: always false", () => {
      useRejectStore.getState().addRejection("w1", ["g1"]);
      expect(useRejectStore.getState().isRejected("w1", [])).toBe(false);
    });

    it("wrong watchId: always false", () => {
      useRejectStore.getState().addRejection("w1", ["g1", "g2"]);
      expect(useRejectStore.getState().isRejected("w2", ["g1", "g2"])).toBe(false);
    });
  });

  // ── isRecentlyRejected — more aggressive (any single overlap) ─────────────

  describe("isRecentlyRejected (outfitBuilder alias)", () => {
    it("triggers on ANY single garment overlap", () => {
      useRejectStore.getState().addRejection("w1", ["g1", "g2", "g3"]);
      // Just 1 garment from the rejected combo
      expect(useRejectStore.getState().isRecentlyRejected("w1", ["g1", "g99"])).toBe(true);
    });

    it("does not trigger for wrong watch", () => {
      useRejectStore.getState().addRejection("w1", ["g1"]);
      expect(useRejectStore.getState().isRecentlyRejected("w2", ["g1"])).toBe(false);
    });

    it("does not trigger for empty garmentIds", () => {
      useRejectStore.getState().addRejection("w1", ["g1"]);
      expect(useRejectStore.getState().isRecentlyRejected("w1", [])).toBe(false);
    });

    it("does not trigger when no garments overlap", () => {
      useRejectStore.getState().addRejection("w1", ["g1", "g2"]);
      expect(useRejectStore.getState().isRecentlyRejected("w1", ["g3", "g4"])).toBe(false);
    });
  });

  // ── Behavioral difference documentation ───────────────────────────────────

  describe("isRejected vs isRecentlyRejected asymmetry", () => {
    it("isRecentlyRejected is more aggressive — 1 overlap enough for 2+ garments", () => {
      useRejectStore.getState().addRejection("w1", ["g1", "g2", "g3"]);
      const query = ["g1", "g99"];
      // isRejected needs 2 overlaps for 2-garment query → only 1 → false
      expect(useRejectStore.getState().isRejected("w1", query)).toBe(false);
      // isRecentlyRejected needs any overlap → g1 matches → true
      expect(useRejectStore.getState().isRecentlyRejected("w1", query)).toBe(true);
    });
  });

  // ── Reason stats ──────────────────────────────────────────────────────────

  describe("getReasonStats", () => {
    it("aggregates rejection reasons", () => {
      useRejectStore.getState().addRejection("w1", ["g1"], "", "too_casual");
      useRejectStore.getState().addRejection("w1", ["g2"], "", "too_casual");
      useRejectStore.getState().addRejection("w1", ["g3"], "", "wrong_color");
      const stats = useRejectStore.getState().getReasonStats();
      expect(stats.too_casual).toBe(2);
      expect(stats.wrong_color).toBe(1);
    });

    it("ignores empty reasons", () => {
      useRejectStore.getState().addRejection("w1", ["g1"], "", "");
      const stats = useRejectStore.getState().getReasonStats();
      expect(Object.keys(stats)).toHaveLength(0);
    });
  });

  // ── Slot field ────────────────────────────────────────────────────────────

  describe("slot tracking", () => {
    it("stores slot in rejection entry", () => {
      useRejectStore.getState().addRejection("w1", ["g1"], "casual", "wrong_color", "shirt");
      expect(useRejectStore.getState().entries[0].slot).toBe("shirt");
    });
  });
});
