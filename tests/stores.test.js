import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db.js and persistence layer to prevent real IDB open in Node test env
vi.mock("../src/services/db.js", () => ({
  DB_NAME: "watch-advisor2", DB_VERSION: 3,
  dbPromise: Promise.resolve({}),
  db: { put: vi.fn(), get: vi.fn(), getAll: vi.fn().mockResolvedValue([]), delete: vi.fn(), putAll: vi.fn() },
}));
vi.mock("../src/services/dbSafeLoad.js", () => ({
  safeLoad: vi.fn().mockResolvedValue([]),
  safeGet:  vi.fn().mockResolvedValue(null),
}));
vi.mock("../src/services/persistence/historyPersistence.js", () => ({
  upsert: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  loadAll: vi.fn().mockResolvedValue([]),
}));

// Mock localCache and supabaseSync to prevent real IDB/Supabase calls
vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({ garments: [], history: [] }),
  setCachedState: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue(undefined),
  getImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/supabaseSync.js", () => ({
  pushHistoryEntry:   vi.fn().mockResolvedValue(undefined),
  deleteHistoryEntry: vi.fn().mockResolvedValue(undefined),
  pushGarment:        vi.fn().mockResolvedValue(undefined),
  pullCloudState:     vi.fn().mockResolvedValue({ garments: [], history: [] }),
  subscribeSyncState: vi.fn(() => () => {}),
}));

import { useWardrobeStore } from "../src/stores/wardrobeStore.js";
import { useHistoryStore }  from "../src/stores/historyStore.js";
import { setCachedState }   from "../src/services/localCache.js";
import { pushHistoryEntry } from "../src/services/supabaseSync.js";
import * as historyPersistence from "../src/services/persistence/historyPersistence.js";

// ─── wardrobeStore ──────────────────────────────────────────────────────────

describe("wardrobeStore — CRUD", () => {
  beforeEach(() => {
    useWardrobeStore.setState({
      garments: [],
      selectedIds: new Set(),
      selectMode: false,
    });
  });

  it("addGarment appends to garments list", () => {
    const store = useWardrobeStore.getState();
    store.addGarment({ id: "g1", type: "shirt", color: "navy" });
    expect(useWardrobeStore.getState().garments).toHaveLength(1);
    expect(useWardrobeStore.getState().garments[0].id).toBe("g1");
  });

  it("updateGarment modifies specific garment", () => {
    useWardrobeStore.setState({ garments: [{ id: "g1", type: "shirt", color: "navy" }] });
    useWardrobeStore.getState().updateGarment("g1", { color: "black" });
    expect(useWardrobeStore.getState().garments[0].color).toBe("black");
    expect(useWardrobeStore.getState().garments[0].type).toBe("shirt");
  });

  it("updateGarment leaves other garments untouched", () => {
    useWardrobeStore.setState({
      garments: [
        { id: "g1", type: "shirt", color: "navy" },
        { id: "g2", type: "pants", color: "grey" },
      ],
    });
    useWardrobeStore.getState().updateGarment("g1", { color: "black" });
    expect(useWardrobeStore.getState().garments[1].color).toBe("grey");
  });

  it("removeGarment removes by id", () => {
    useWardrobeStore.setState({
      garments: [
        { id: "g1", type: "shirt" },
        { id: "g2", type: "pants" },
      ],
    });
    useWardrobeStore.getState().removeGarment("g1");
    expect(useWardrobeStore.getState().garments).toHaveLength(1);
    expect(useWardrobeStore.getState().garments[0].id).toBe("g2");
  });
});

describe("wardrobeStore — addAngle", () => {
  beforeEach(() => {
    useWardrobeStore.setState({
      garments: [{ id: "g1", type: "shoes", photoAngles: [] }],
    });
  });

  it("adds angle to garment", () => {
    useWardrobeStore.getState().addAngle("g1", "data:image/jpeg;base64,abc");
    expect(useWardrobeStore.getState().garments[0].photoAngles).toHaveLength(1);
  });

  it("enforces max 4 angles", () => {
    const store = useWardrobeStore.getState();
    store.addAngle("g1", "a1");
    store.addAngle("g1", "a2");
    store.addAngle("g1", "a3");
    store.addAngle("g1", "a4");
    store.addAngle("g1", "a5"); // should be ignored
    expect(useWardrobeStore.getState().garments[0].photoAngles).toHaveLength(4);
  });

  it("does not modify other garments", () => {
    useWardrobeStore.setState({
      garments: [
        { id: "g1", type: "shoes", photoAngles: [] },
        { id: "g2", type: "shirt", photoAngles: [] },
      ],
    });
    useWardrobeStore.getState().addAngle("g1", "angle");
    expect(useWardrobeStore.getState().garments[1].photoAngles).toHaveLength(0);
  });
});

// ─── wardrobeStore — multi-select ───────────────────────────────────────────

describe("wardrobeStore — multi-select", () => {
  beforeEach(() => {
    useWardrobeStore.setState({
      garments: [{ id: "g1" }, { id: "g2" }, { id: "g3" }],
      selectedIds: new Set(),
      selectMode: false,
    });
  });

  it("toggleSelect adds an id and enters select mode", () => {
    useWardrobeStore.getState().toggleSelect("g1");
    const state = useWardrobeStore.getState();
    expect(state.selectedIds.has("g1")).toBe(true);
    expect(state.selectMode).toBe(true);
  });

  it("toggleSelect again removes the id", () => {
    useWardrobeStore.getState().toggleSelect("g1");
    useWardrobeStore.getState().toggleSelect("g1");
    const state = useWardrobeStore.getState();
    expect(state.selectedIds.has("g1")).toBe(false);
    expect(state.selectMode).toBe(false);
  });

  it("clearSelection clears all selected ids and exits select mode", () => {
    useWardrobeStore.getState().toggleSelect("g1");
    useWardrobeStore.getState().toggleSelect("g2");
    useWardrobeStore.getState().clearSelection();
    const state = useWardrobeStore.getState();
    expect(state.selectedIds.size).toBe(0);
    expect(state.selectMode).toBe(false);
  });
});

// ─── wardrobeStore — batch operations ───────────────────────────────────────

describe("wardrobeStore — batchDelete", () => {
  it("removes all selected garments", () => {
    useWardrobeStore.setState({
      garments: [{ id: "g1" }, { id: "g2" }, { id: "g3" }],
      selectedIds: new Set(["g1", "g3"]),
      selectMode: true,
    });
    useWardrobeStore.getState().batchDelete();
    const state = useWardrobeStore.getState();
    expect(state.garments).toHaveLength(1);
    expect(state.garments[0].id).toBe("g2");
    expect(state.selectMode).toBe(false);
    expect(state.selectedIds.size).toBe(0);
  });
});

describe("wardrobeStore — batchSetType", () => {
  it("sets type and clears needsReview for selected garments", () => {
    useWardrobeStore.setState({
      garments: [
        { id: "g1", type: "shirt", needsReview: true },
        { id: "g2", type: "shirt", needsReview: true },
        { id: "g3", type: "pants", needsReview: false },
      ],
      selectedIds: new Set(["g1", "g2"]),
      selectMode: true,
    });
    useWardrobeStore.getState().batchSetType("shoes");
    const state = useWardrobeStore.getState();
    expect(state.garments[0].type).toBe("shoes");
    expect(state.garments[0].needsReview).toBe(false);
    expect(state.garments[1].type).toBe("shoes");
    expect(state.garments[2].type).toBe("pants"); // untouched
  });
});

describe("wardrobeStore — batchMergeAngles", () => {
  it("merges thumbnails of rest into primary's photoAngles", () => {
    useWardrobeStore.setState({
      garments: [
        { id: "g1", type: "shoes", photoAngles: [], thumbnail: "main" },
        { id: "g2", type: "shoes", photoAngles: [], thumbnail: "angle1" },
        { id: "g3", type: "shoes", photoAngles: [], thumbnail: "angle2" },
      ],
      selectedIds: new Set(["g1", "g2", "g3"]),
      selectMode: true,
    });
    useWardrobeStore.getState().batchMergeAngles();
    const state = useWardrobeStore.getState();
    // g2 and g3 should be removed
    expect(state.garments).toHaveLength(1);
    expect(state.garments[0].id).toBe("g1");
    // their thumbnails become angles on g1
    expect(state.garments[0].photoAngles).toContain("angle1");
    expect(state.garments[0].photoAngles).toContain("angle2");
  });

  it("enforces max 4 angles when merging", () => {
    useWardrobeStore.setState({
      garments: [
        { id: "g1", type: "shoes", photoAngles: ["e1", "e2"], thumbnail: "main" },
        { id: "g2", type: "shoes", photoAngles: ["a1"], thumbnail: "t2" },
        { id: "g3", type: "shoes", photoAngles: ["a2"], thumbnail: "t3" },
        { id: "g4", type: "shoes", photoAngles: [], thumbnail: "t4" },
      ],
      selectedIds: new Set(["g1", "g2", "g3", "g4"]),
      selectMode: true,
    });
    useWardrobeStore.getState().batchMergeAngles();
    const state = useWardrobeStore.getState();
    expect(state.garments[0].photoAngles.length).toBeLessThanOrEqual(4);
  });

  it("does nothing with fewer than 2 selected", () => {
    useWardrobeStore.setState({
      garments: [{ id: "g1", type: "shoes", photoAngles: [] }],
      selectedIds: new Set(["g1"]),
      selectMode: true,
    });
    useWardrobeStore.getState().batchMergeAngles();
    expect(useWardrobeStore.getState().garments).toHaveLength(1);
  });
});

// ─── historyStore ───────────────────────────────────────────────────────────
//
// historyStore.addEntry is now a thin delegation wrapper.
// Write order: historyPersistence.upsert (IDB → Zustand) → cloud (fire-and-forget).
// Tests verify delegation contracts, not direct state mutation.

describe("historyStore — addEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHistoryStore.setState({ entries: [] });
  });

  it("delegates to historyPersistence.upsert with the entry", async () => {
    const entry = { id: "h1", watchId: "snowflake", date: "2026-03-07" };
    useHistoryStore.getState().addEntry(entry);
    // _persist() uses dynamic import() — wait for the module to resolve and
    // the .then() callback to execute before asserting.
    await vi.waitUntil(() => historyPersistence.upsert.mock.calls.length > 0, { timeout: 500 });
    expect(historyPersistence.upsert).toHaveBeenCalledWith(entry);
  });

  it("does NOT call setCachedState directly (persistence layer owns IDB writes)", () => {
    useHistoryStore.getState().addEntry({ id: "h1", watchId: "snowflake" });
    expect(setCachedState).not.toHaveBeenCalled();
  });

  it("calls pushHistoryEntry for cloud sync", () => {
    const entry = { id: "h1", watchId: "snowflake" };
    useHistoryStore.getState().addEntry(entry);
    expect(pushHistoryEntry).toHaveBeenCalledWith(entry);
  });
});
