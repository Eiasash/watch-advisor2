import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock historyStore
const mockEntries = [];
const mockUpsertEntry = vi.fn();
vi.mock("../src/stores/historyStore.js", () => ({
  useHistoryStore: {
    getState: () => ({
      entries: mockEntries,
      upsertEntry: mockUpsertEntry,
    }),
  },
}));

const { recordAIFeedback, scoreGap } = await import("../src/domain/outfitFeedback.js");

describe("outfitFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntries.length = 0;
  });

  // ── recordAIFeedback ──────────────────────────────────────────────────────

  describe("recordAIFeedback", () => {
    it("writes AI score to matching history entry", () => {
      mockEntries.push({ id: "wear-2026-04-10-w1", watchId: "w1", date: "2026-04-10" });
      recordAIFeedback("2026-04-10", "w1", 8, { vision: "good", works: "yes" });
      expect(mockUpsertEntry).toHaveBeenCalledTimes(1);
      const updated = mockUpsertEntry.mock.calls[0][0];
      expect(updated.aiScore).toBe(8);
      expect(updated.aiVision).toBe("good");
      expect(updated.aiWorks).toBe("yes");
      expect(updated.aiFeedbackAt).toBeTruthy();
    });

    it("sets null for missing aiDetails fields", () => {
      mockEntries.push({ id: "wear-2026-04-10-w1", watchId: "w1", date: "2026-04-10" });
      recordAIFeedback("2026-04-10", "w1", 7);
      const updated = mockUpsertEntry.mock.calls[0][0];
      expect(updated.aiVision).toBeNull();
      expect(updated.aiRisk).toBeNull();
      expect(updated.aiUpgrade).toBeNull();
    });

    it("no-op when dateISO is empty", () => {
      recordAIFeedback("", "w1", 5);
      expect(mockUpsertEntry).not.toHaveBeenCalled();
    });

    it("no-op when watchId is empty", () => {
      recordAIFeedback("2026-04-10", "", 5);
      expect(mockUpsertEntry).not.toHaveBeenCalled();
    });

    it("no-op when aiScore is 0 (falsy)", () => {
      recordAIFeedback("2026-04-10", "w1", 0);
      expect(mockUpsertEntry).not.toHaveBeenCalled();
    });

    it("no-op when entry is not found in history", () => {
      mockEntries.push({ id: "wear-2026-04-09-w1", watchId: "w1", date: "2026-04-09" });
      recordAIFeedback("2026-04-10", "w1", 8);
      expect(mockUpsertEntry).not.toHaveBeenCalled();
    });
  });

  // ── scoreGap ──────────────────────────────────────────────────────────────

  describe("scoreGap", () => {
    it("returns positive when user rated higher than AI", () => {
      expect(scoreGap({ score: 9, aiScore: 7 })).toBe(2);
    });

    it("returns negative when AI rated higher than user", () => {
      expect(scoreGap({ score: 5, aiScore: 8 })).toBe(-3);
    });

    it("returns 0 when ratings match", () => {
      expect(scoreGap({ score: 7, aiScore: 7 })).toBe(0);
    });

    it("returns null when score is missing", () => {
      expect(scoreGap({ aiScore: 7 })).toBeNull();
    });

    it("returns null when aiScore is missing", () => {
      expect(scoreGap({ score: 7 })).toBeNull();
    });

    it("returns null for null entry", () => {
      expect(scoreGap(null)).toBeNull();
    });

    it("returns null for undefined entry", () => {
      expect(scoreGap(undefined)).toBeNull();
    });

    it("returns null for empty object", () => {
      expect(scoreGap({})).toBeNull();
    });
  });
});
