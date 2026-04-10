import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the idb module before importing db.js
const mockStore = new Map();
const mockDb = {
  put: vi.fn((store, value, key) => { mockStore.set(`${store}:${key ?? value?.id}`, value); return Promise.resolve(); }),
  get: vi.fn((store, key) => Promise.resolve(mockStore.get(`${store}:${key}`))),
  getAll: vi.fn((store) => Promise.resolve([...mockStore.values()])),
  getAllFromIndex: vi.fn(() => Promise.resolve([])),
  delete: vi.fn((store, id) => { mockStore.delete(`${store}:${id}`); return Promise.resolve(); }),
  clear: vi.fn(() => { mockStore.clear(); return Promise.resolve(); }),
  transaction: vi.fn(() => ({
    store: { put: vi.fn(() => Promise.resolve()) },
    done: Promise.resolve(),
  })),
  objectStoreNames: { contains: () => false },
  createObjectStore: vi.fn(() => ({ createIndex: vi.fn() })),
};

vi.mock("idb", () => ({
  openDB: vi.fn(() => Promise.resolve(mockDb)),
}));

const { db, DB_NAME, DB_VERSION } = await import("../src/services/db.js");

describe("db wrapper", () => {
  beforeEach(() => {
    mockStore.clear();
    vi.clearAllMocks();
  });

  // ── Constants ────────────────────────────────────────────────────────────

  it("exports DB_NAME as 'watch-advisor2'", () => {
    expect(DB_NAME).toBe("watch-advisor2");
  });

  it("exports DB_VERSION as 3", () => {
    expect(DB_VERSION).toBe(3);
  });

  // ── put ───────────────────────────────────────────────────────────────────

  it("put() forwards store, value, and key to idb", async () => {
    await db.put("state", { foo: 1 }, "app");
    expect(mockDb.put).toHaveBeenCalledWith("state", { foo: 1 }, "app");
  });

  it("put() works without key for keyPath stores", async () => {
    await db.put("garments_items", { id: "g1", name: "shirt" });
    expect(mockDb.put).toHaveBeenCalledWith("garments_items", { id: "g1", name: "shirt" }, undefined);
  });

  it("put() passes undefined key when not provided", async () => {
    await db.put("history_items", { id: "h1" });
    expect(mockDb.put).toHaveBeenCalledWith("history_items", { id: "h1" }, undefined);
  });

  // ── get ───────────────────────────────────────────────────────────────────

  it("get() forwards store and key", async () => {
    await db.get("state", "app");
    expect(mockDb.get).toHaveBeenCalledWith("state", "app");
  });

  it("get() returns undefined for missing key", async () => {
    const result = await db.get("state", "nonexistent");
    expect(result).toBeUndefined();
  });

  // ── getAll ────────────────────────────────────────────────────────────────

  it("getAll() returns all records from a store", async () => {
    mockDb.getAll.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    const result = await db.getAll("garments_items");
    expect(result).toHaveLength(2);
  });

  // ── getAllFromIndex ────────────────────────────────────────────────────────

  it("getAllFromIndex() forwards store, index, and query", async () => {
    await db.getAllFromIndex("history_items", "watchId", "w1");
    expect(mockDb.getAllFromIndex).toHaveBeenCalledWith("history_items", "watchId", "w1");
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it("delete() forwards store and id", async () => {
    await db.delete("garments_items", "g1");
    expect(mockDb.delete).toHaveBeenCalledWith("garments_items", "g1");
  });

  // ── clear ─────────────────────────────────────────────────────────────────

  it("clear() forwards store name", async () => {
    await db.clear("images");
    expect(mockDb.clear).toHaveBeenCalledWith("images");
  });

  // ── putAll ────────────────────────────────────────────────────────────────

  it("putAll() opens a readwrite transaction and puts all records", async () => {
    const storePut = vi.fn(() => Promise.resolve());
    mockDb.transaction.mockReturnValueOnce({
      store: { put: storePut },
      done: Promise.resolve(),
    });
    await db.putAll("history_items", [{ id: "h1" }, { id: "h2" }]);
    expect(mockDb.transaction).toHaveBeenCalledWith("history_items", "readwrite");
    expect(storePut).toHaveBeenCalledTimes(2);
  });

  it("putAll() with empty array completes without error", async () => {
    const storePut = vi.fn(() => Promise.resolve());
    mockDb.transaction.mockReturnValueOnce({
      store: { put: storePut },
      done: Promise.resolve(),
    });
    await db.putAll("history_items", []);
    expect(storePut).not.toHaveBeenCalled();
  });
});
