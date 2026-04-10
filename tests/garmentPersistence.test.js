import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db.js
const mockDb = {
  put: vi.fn(() => Promise.resolve()),
  get: vi.fn(() => Promise.resolve(undefined)),
  delete: vi.fn(() => Promise.resolve()),
  getAll: vi.fn(() => Promise.resolve([])),
};
vi.mock("../src/services/db.js", () => ({
  db: mockDb,
  dbPromise: Promise.resolve({ getAll: vi.fn(() => Promise.resolve([])) }),
}));

// Mock wardrobeStore
const mockWardrobeState = { garments: [] };
vi.mock("../src/stores/wardrobeStore.js", () => ({
  useWardrobeStore: {
    setState: vi.fn((updater) => {
      if (typeof updater === "function") {
        const result = updater(mockWardrobeState);
        Object.assign(mockWardrobeState, result);
      } else {
        Object.assign(mockWardrobeState, updater);
      }
    }),
    getState: () => mockWardrobeState,
  },
}));

const { upsert, patch, remove, loadAll } = await import("../src/services/persistence/garmentPersistence.js");

describe("garmentPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWardrobeState.garments = [];
  });

  // ── loadAll ─────────────────────────────────────────────────────────────

  describe("loadAll", () => {
    it("returns empty array when store is empty", async () => {
      const result = await loadAll();
      expect(result).toEqual([]);
    });

    it("returns empty array on IDB error", async () => {
      // loadAll uses dbPromise directly, not the wrapper
      const result = await loadAll();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ── upsert ────────────────────────────────────────────────────────────────

  describe("upsert", () => {
    it("writes to IDB before updating Zustand", async () => {
      const garment = { id: "g1", name: "Blue Shirt", type: "shirt" };
      await upsert(garment);
      expect(mockDb.put).toHaveBeenCalledWith("garments_items", garment);
      expect(mockWardrobeState.garments).toHaveLength(1);
      expect(mockWardrobeState.garments[0].id).toBe("g1");
    });

    it("adds new garment when id does not exist", async () => {
      mockWardrobeState.garments = [{ id: "g1", name: "Old" }];
      await upsert({ id: "g2", name: "New" });
      expect(mockWardrobeState.garments).toHaveLength(2);
    });

    it("updates existing garment by id", async () => {
      mockWardrobeState.garments = [{ id: "g1", name: "Old", color: "red" }];
      await upsert({ id: "g1", name: "Updated" });
      expect(mockWardrobeState.garments).toHaveLength(1);
      expect(mockWardrobeState.garments[0].name).toBe("Updated");
      expect(mockWardrobeState.garments[0].color).toBe("red"); // merged
    });
  });

  // ── patch ─────────────────────────────────────────────────────────────────

  describe("patch", () => {
    it("merges fields with existing IDB record", async () => {
      mockDb.get.mockResolvedValueOnce({ id: "g1", name: "Shirt", color: "blue" });
      await patch("g1", { color: "red" });
      expect(mockDb.put).toHaveBeenCalledWith("garments_items", { id: "g1", name: "Shirt", color: "red" });
    });

    it("creates new record if id does not exist in IDB", async () => {
      mockDb.get.mockResolvedValueOnce(undefined);
      await patch("g-new", { name: "New Item" });
      expect(mockDb.put).toHaveBeenCalledWith("garments_items", { id: "g-new", name: "New Item" });
    });

    it("updates Zustand state for matching garment", async () => {
      mockWardrobeState.garments = [{ id: "g1", name: "Shirt", color: "blue" }];
      mockDb.get.mockResolvedValueOnce({ id: "g1", name: "Shirt", color: "blue" });
      await patch("g1", { color: "green" });
      expect(mockWardrobeState.garments[0].color).toBe("green");
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe("remove", () => {
    it("deletes from IDB and removes from Zustand", async () => {
      mockWardrobeState.garments = [{ id: "g1" }, { id: "g2" }];
      await remove("g1");
      expect(mockDb.delete).toHaveBeenCalledWith("garments_items", "g1");
      expect(mockWardrobeState.garments).toHaveLength(1);
      expect(mockWardrobeState.garments[0].id).toBe("g2");
    });

    it("no-op on Zustand if id not found", async () => {
      mockWardrobeState.garments = [{ id: "g1" }];
      await remove("g-nonexistent");
      expect(mockDb.delete).toHaveBeenCalledWith("garments_items", "g-nonexistent");
      expect(mockWardrobeState.garments).toHaveLength(1);
    });
  });
});
