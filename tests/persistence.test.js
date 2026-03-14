/**
 * Tests for src/services/persistence/* and src/services/db.js
 *
 * vi.mock factories are hoisted before variable declarations, so all mock
 * data must live inside the factories or be retrieved via imports after mocking.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../src/services/db.js", () => ({
  DB_NAME:    "watch-advisor2",
  DB_VERSION: 3,
  dbPromise:  Promise.resolve({ getAll: vi.fn().mockResolvedValue([]) }),
  db: {
    put:            vi.fn().mockResolvedValue(undefined),
    get:            vi.fn().mockResolvedValue(null),
    getAll:         vi.fn().mockResolvedValue([]),
    getAllFromIndex: vi.fn().mockResolvedValue([]),
    delete:         vi.fn().mockResolvedValue(undefined),
    clear:          vi.fn().mockResolvedValue(undefined),
    putAll:         vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../src/services/dbSafeLoad.js", () => ({
  safeLoad: vi.fn().mockResolvedValue([]),
  safeGet:  vi.fn().mockResolvedValue(null),
}));

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({ history: [] }),
  setCachedState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/supabaseSync.js", () => ({
  pushHistoryEntry:   vi.fn().mockResolvedValue(undefined),
  deleteHistoryEntry: vi.fn().mockResolvedValue(undefined),
  pushGarment:        vi.fn().mockResolvedValue(undefined),
  subscribeSyncState: vi.fn(() => () => {}),
  pullCloudState:     vi.fn().mockResolvedValue({ _localOnly: true }),
}));

vi.mock("../src/stores/historyStore.js", () => ({
  useHistoryStore: {
    getState: vi.fn(() => ({ entries: [] })),
    setState: vi.fn(),
  },
}));

vi.mock("../src/stores/wardrobeStore.js", () => ({
  useWardrobeStore: {
    getState: vi.fn(() => ({ garments: [] })),
    setState: vi.fn(),
  },
}));

vi.mock("../src/stores/strapStore.js", () => ({
  useStrapStore: {
    getState: vi.fn(() => ({ activeStrap: {} })),
    setState: vi.fn(),
  },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { db } from "../src/services/db.js";
import { safeLoad } from "../src/services/dbSafeLoad.js";
import { upsert, remove, loadAll } from "../src/services/persistence/historyPersistence.js";
import { upsert as upsertGarment, remove as removeGarment } from "../src/services/persistence/garmentPersistence.js";
import { useHistoryStore } from "../src/stores/historyStore.js";
import { useWardrobeStore } from "../src/stores/wardrobeStore.js";

// ── historyPersistence — upsert ───────────────────────────────────────────────

describe("historyPersistence — upsert", () => {
  let historyState;

  beforeEach(() => {
    historyState = { entries: [] };
    vi.clearAllMocks();
    useHistoryStore.getState.mockReturnValue(historyState);
    useHistoryStore.setState.mockImplementation(updater => {
      const patch = typeof updater === "function" ? updater(historyState) : updater;
      historyState = { ...historyState, ...patch };
    });
    db.put.mockResolvedValue(undefined);
  });

  it("writes to IDB before updating Zustand", async () => {
    const order = [];
    db.put.mockImplementation(async () => { order.push("idb"); });
    useHistoryStore.setState.mockImplementation(updater => {
      order.push("zustand");
      const patch = typeof updater === "function" ? updater(historyState) : updater;
      historyState = { ...historyState, ...patch };
    });
    await upsert({ id: "e1", watchId: "speedmaster", date: "2026-03-10" });
    expect(order).toEqual(["idb", "zustand"]);
  });

  it("adds new entry to Zustand state", async () => {
    await upsert({ id: "e1", watchId: "speedmaster", date: "2026-03-10" });
    expect(historyState.entries).toHaveLength(1);
    expect(historyState.entries[0].id).toBe("e1");
  });

  it("updates existing entry without duplicating", async () => {
    historyState = { entries: [{ id: "e1", watchId: "speedmaster", date: "2026-03-10", notes: "" }] };
    useHistoryStore.getState.mockReturnValue(historyState);
    useHistoryStore.setState.mockImplementation(updater => {
      const patch = typeof updater === "function" ? updater(historyState) : updater;
      historyState = { ...historyState, ...patch };
    });
    await upsert({ id: "e1", watchId: "speedmaster", date: "2026-03-10", notes: "Nice" });
    expect(historyState.entries).toHaveLength(1);
    expect(historyState.entries[0].notes).toBe("Nice");
  });

  it("calls db.put with history_items store", async () => {
    const entry = { id: "e2", watchId: "gmt", date: "2026-03-11" };
    await upsert(entry);
    expect(db.put).toHaveBeenCalledWith("history_items", entry);
  });
});

// ── historyPersistence — remove ───────────────────────────────────────────────

describe("historyPersistence — remove", () => {
  let historyState;

  beforeEach(() => {
    historyState = { entries: [{ id: "e1", watchId: "speedmaster", date: "2026-03-10" }] };
    vi.clearAllMocks();
    useHistoryStore.getState.mockReturnValue(historyState);
    useHistoryStore.setState.mockImplementation(updater => {
      const patch = typeof updater === "function" ? updater(historyState) : updater;
      historyState = { ...historyState, ...patch };
    });
    db.delete.mockResolvedValue(undefined);
  });

  it("deletes from IDB before updating Zustand", async () => {
    const order = [];
    db.delete.mockImplementation(async () => { order.push("idb"); });
    useHistoryStore.setState.mockImplementation(updater => {
      order.push("zustand");
      const patch = typeof updater === "function" ? updater(historyState) : updater;
      historyState = { ...historyState, ...patch };
    });
    await remove("e1");
    expect(order).toEqual(["idb", "zustand"]);
  });

  it("removes entry from Zustand state", async () => {
    await remove("e1");
    expect(historyState.entries).toHaveLength(0);
  });

  it("calls db.delete with correct store and id", async () => {
    await remove("e1");
    expect(db.delete).toHaveBeenCalledWith("history_items", "e1");
  });
});

// ── historyPersistence — loadAll ──────────────────────────────────────────────

describe("historyPersistence — loadAll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns entries from safeLoad when store has data", async () => {
    const stored = [{ id: "e1", watchId: "speedmaster", date: "2026-03-10" }];
    safeLoad.mockResolvedValueOnce(stored);
    expect(await loadAll()).toEqual(stored);
  });

  it("returns empty array when safeLoad returns empty and no legacy data", async () => {
    safeLoad.mockResolvedValueOnce([]);
    expect(await loadAll()).toEqual([]);
  });

  it("calls safeLoad with the history_items store", async () => {
    safeLoad.mockResolvedValueOnce([]);
    await loadAll();
    expect(safeLoad).toHaveBeenCalledWith("history_items");
  });
});

// ── garmentPersistence — upsert ───────────────────────────────────────────────

describe("garmentPersistence — upsert", () => {
  let wardrobeState;

  beforeEach(() => {
    wardrobeState = { garments: [] };
    vi.clearAllMocks();
    useWardrobeStore.getState.mockReturnValue(wardrobeState);
    useWardrobeStore.setState.mockImplementation(updater => {
      const patch = typeof updater === "function" ? updater(wardrobeState) : updater;
      wardrobeState = { ...wardrobeState, ...patch };
    });
    db.put.mockResolvedValue(undefined);
  });

  it("writes IDB before Zustand", async () => {
    const order = [];
    db.put.mockImplementation(async () => { order.push("idb"); });
    useWardrobeStore.setState.mockImplementation(updater => {
      order.push("zustand");
      const patch = typeof updater === "function" ? updater(wardrobeState) : updater;
      wardrobeState = { ...wardrobeState, ...patch };
    });
    await upsertGarment({ id: "g1", type: "shirt", color: "navy" });
    expect(order).toEqual(["idb", "zustand"]);
  });

  it("adds new garment to Zustand", async () => {
    await upsertGarment({ id: "g1", type: "shirt", color: "navy" });
    expect(wardrobeState.garments).toHaveLength(1);
    expect(wardrobeState.garments[0].id).toBe("g1");
  });

  it("calls db.put with garments_items store", async () => {
    const g = { id: "g1", type: "shirt", color: "navy" };
    await upsertGarment(g);
    expect(db.put).toHaveBeenCalledWith("garments_items", g);
  });
});

// ── garmentPersistence — remove ───────────────────────────────────────────────

describe("garmentPersistence — remove", () => {
  let wardrobeState;

  beforeEach(() => {
    wardrobeState = { garments: [{ id: "g1", type: "shirt" }] };
    vi.clearAllMocks();
    useWardrobeStore.getState.mockReturnValue(wardrobeState);
    useWardrobeStore.setState.mockImplementation(updater => {
      const patch = typeof updater === "function" ? updater(wardrobeState) : updater;
      wardrobeState = { ...wardrobeState, ...patch };
    });
    db.delete.mockResolvedValue(undefined);
  });

  it("removes garment from Zustand after IDB delete", async () => {
    await removeGarment("g1");
    expect(wardrobeState.garments).toHaveLength(0);
  });

  it("calls db.delete with correct store and id", async () => {
    await removeGarment("g1");
    expect(db.delete).toHaveBeenCalledWith("garments_items", "g1");
  });

  it("IDB delete runs before Zustand update", async () => {
    const order = [];
    db.delete.mockImplementation(async () => { order.push("idb"); });
    useWardrobeStore.setState.mockImplementation(updater => {
      order.push("zustand");
      const patch = typeof updater === "function" ? updater(wardrobeState) : updater;
      wardrobeState = { ...wardrobeState, ...patch };
    });
    await removeGarment("g1");
    expect(order).toEqual(["idb", "zustand"]);
  });
});
