import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db.js — dbPromise resolves to a mock database connection
const mockConn = {
  getAll: vi.fn(),
  get: vi.fn(),
};

vi.mock("../src/services/db.js", () => ({
  dbPromise: Promise.resolve(mockConn),
  DB_NAME: "watch-advisor2",
}));

const { safeLoad, safeGet } = await import("../src/services/dbSafeLoad.js");

describe("safeLoad", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all records from the specified store", async () => {
    mockConn.getAll.mockResolvedValueOnce([{ id: "g1" }, { id: "g2" }]);
    const result = await safeLoad("garments_items");
    expect(result).toHaveLength(2);
    expect(mockConn.getAll).toHaveBeenCalledWith("garments_items");
  });

  it("returns empty array when store is empty", async () => {
    mockConn.getAll.mockResolvedValueOnce([]);
    const result = await safeLoad("garments_items");
    expect(result).toEqual([]);
  });

  it("returns empty array on IDB error and deletes database", async () => {
    mockConn.getAll.mockRejectedValueOnce(new Error("IDB corrupt"));
    const deleteDb = vi.fn();
    globalThis.indexedDB.deleteDatabase = deleteDb;
    const result = await safeLoad("garments_items");
    expect(result).toEqual([]);
  });

  it("returns empty array even when deleteDatabase also fails", async () => {
    mockConn.getAll.mockRejectedValueOnce(new Error("IDB error"));
    const prevDelete = globalThis.indexedDB.deleteDatabase;
    globalThis.indexedDB.deleteDatabase = () => { throw new Error("delete failed"); };
    const result = await safeLoad("history_items");
    expect(result).toEqual([]);
    globalThis.indexedDB.deleteDatabase = prevDelete;
  });
});

describe("safeGet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the value for a given key", async () => {
    mockConn.get.mockResolvedValueOnce({ weekCtx: ["casual"] });
    const result = await safeGet("state", "app");
    expect(result).toEqual({ weekCtx: ["casual"] });
    expect(mockConn.get).toHaveBeenCalledWith("state", "app");
  });

  it("returns fallback when key does not exist (undefined)", async () => {
    mockConn.get.mockResolvedValueOnce(undefined);
    const result = await safeGet("state", "app", { default: true });
    expect(result).toEqual({ default: true });
  });

  it("returns null as default fallback", async () => {
    mockConn.get.mockResolvedValueOnce(null);
    const result = await safeGet("state", "missing");
    expect(result).toBeNull();
  });

  it("returns fallback on IDB error", async () => {
    mockConn.get.mockRejectedValueOnce(new Error("IDB corrupt"));
    const result = await safeGet("state", "app", []);
    expect(result).toEqual([]);
  });
});
