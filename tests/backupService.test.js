import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock IDB for backup service
const backupStore = {};
const mockBackupDB = {
  put: vi.fn(async (store, val) => { backupStore[val.id] = val; }),
  get: vi.fn(async (store, key) => backupStore[key] ?? undefined),
  getAll: vi.fn(async () => Object.values(backupStore)),
  delete: vi.fn(async (store, key) => { delete backupStore[key]; }),
  transaction: vi.fn(() => ({
    store: { delete: vi.fn(async (key) => { delete backupStore[key]; }) },
    done: Promise.resolve(),
  })),
};

// Mock localCache
const mockState = {
  garments: [{ id: "g1", type: "shirt", color: "white" }],
  watches: [{ id: "w1", brand: "Omega" }],
  history: [{ id: "h1", watchId: "w1" }],
  weekCtx: null,
  onCallDates: null,
};

vi.mock("idb", () => ({
  openDB: vi.fn(async () => mockBackupDB),
}));

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn(async () => ({ ...mockState })),
}));

const { createBackup, isBackupDue, listBackups, restoreBackup } = await import("../src/services/backupService.js");

describe("backupService", () => {
  beforeEach(() => {
    Object.keys(backupStore).forEach(k => delete backupStore[k]);
    vi.clearAllMocks();
  });

  it("creates a backup snapshot in IDB", async () => {
    const id = await createBackup();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
    expect(mockBackupDB.put).toHaveBeenCalled();
    const snapshot = mockBackupDB.put.mock.calls[0][1];
    expect(snapshot.garmentCount).toBe(1);
    expect(snapshot.watchCount).toBe(1);
    expect(snapshot.historyCount).toBe(1);
    expect(snapshot.data.garments).toHaveLength(1);
  });

  it("isBackupDue returns true when no backups exist", async () => {
    expect(await isBackupDue()).toBe(true);
  });

  it("isBackupDue returns false for recent backup", async () => {
    backupStore["recent"] = { id: "recent", createdAt: Date.now() };
    expect(await isBackupDue()).toBe(false);
  });

  it("isBackupDue returns true after 7 days", async () => {
    backupStore["old"] = { id: "old", createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000 };
    expect(await isBackupDue()).toBe(true);
  });

  it("listBackups returns metadata sorted by date", async () => {
    backupStore["b1"] = { id: "b1", createdAt: 1000, garmentCount: 5, watchCount: 3, historyCount: 2 };
    backupStore["b2"] = { id: "b2", createdAt: 2000, garmentCount: 8, watchCount: 3, historyCount: 4 };
    const list = await listBackups();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("b2"); // newest first
    expect(list[0]).not.toHaveProperty("data"); // no data blob in list
  });

  it("restoreBackup returns data for valid ID", async () => {
    backupStore["b1"] = {
      id: "b1", createdAt: 1000,
      data: { garments: [{ id: "g1" }], watches: [], history: [] },
    };
    const data = await restoreBackup("b1");
    expect(data.garments).toHaveLength(1);
    expect(data.garments[0].id).toBe("g1");
  });

  it("restoreBackup throws for missing ID", async () => {
    await expect(restoreBackup("nonexistent")).rejects.toThrow("not found");
  });

  it("prunes old backups beyond MAX_BACKUPS (4)", async () => {
    // Pre-fill 4 existing backups
    for (let i = 0; i < 4; i++) {
      backupStore[`old-${i}`] = { id: `old-${i}`, createdAt: i * 1000 };
    }
    mockBackupDB.getAll.mockImplementation(async () => Object.values(backupStore));

    await createBackup();

    // transaction().store.delete should have been called for the oldest
    const txMock = mockBackupDB.transaction.mock;
    expect(txMock.calls.length).toBeGreaterThan(0);
  });

  it("backup data includes planner state", async () => {
    mockState.weekCtx = [1, 2, 3, 4, 5, 6, 7];
    mockState.onCallDates = ["2026-03-01"];
    await createBackup();
    const snapshot = mockBackupDB.put.mock.calls[0][1];
    expect(snapshot.data.weekCtx).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(snapshot.data.onCallDates).toEqual(["2026-03-01"]);
    // Reset
    mockState.weekCtx = null;
    mockState.onCallDates = null;
  });
});
