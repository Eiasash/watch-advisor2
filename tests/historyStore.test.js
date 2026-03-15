import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({ garments: [], history: [] }),
  setCachedState: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue(undefined),
  getImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/supabaseSync.js", () => ({
  pushHistoryEntry: vi.fn().mockResolvedValue(undefined),
  deleteHistoryEntry: vi.fn().mockResolvedValue(undefined),
  pushGarment: vi.fn().mockResolvedValue(undefined),
  pullCloudState: vi.fn().mockResolvedValue({ garments: [], history: [] }),
  subscribeSyncState: vi.fn(() => () => {}),
}));

vi.mock("../src/services/persistence/historyPersistence.js", () => ({
  upsert: vi.fn(async (entry) => {
    const { useHistoryStore } = await import("../src/stores/historyStore.js");
    useHistoryStore.setState(state => {
      const idx = state.entries.findIndex(e => e.id === entry.id);
      const next = idx >= 0
        ? state.entries.map((e, i) => i === idx ? entry : e)
        : [...state.entries, entry];
      return { entries: next };
    });
  }),
  remove: vi.fn(async (id) => {
    const { useHistoryStore } = await import("../src/stores/historyStore.js");
    useHistoryStore.setState(state => ({
      entries: state.entries.filter(e => e.id !== id),
    }));
  }),
  loadAll: vi.fn().mockResolvedValue([]),
}));

import { useHistoryStore } from "../src/stores/historyStore.js";
import { setCachedState } from "../src/services/localCache.js";
import { pushHistoryEntry, deleteHistoryEntry } from "../src/services/supabaseSync.js";

// ─── upsertEntry ───────────────────────────────────────────────────────────

describe("historyStore — upsertEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHistoryStore.setState({ entries: [] });
  });

  it("appends entry when no matching date exists", async () => {
    useHistoryStore.getState().upsertEntry({ id: "h1", date: "2026-03-07", watchId: "w1" });
    await new Promise(r => setTimeout(r, 10));
    expect(useHistoryStore.getState().entries).toHaveLength(1);
    expect(useHistoryStore.getState().entries[0].id).toBe("h1");
  });

  it("replaces entry when matching date exists", async () => {
    useHistoryStore.setState({
      entries: [{ id: "h1", date: "2026-03-07", watchId: "w1", garmentIds: ["g1"] }],
    });
    const updated = { id: "h1", date: "2026-03-07", watchId: "w2", garmentIds: ["g2", "g3"] };
    useHistoryStore.getState().upsertEntry(updated);
    await new Promise(r => setTimeout(r, 10));
    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].watchId).toBe("w2");
    expect(entries[0].garmentIds).toEqual(["g2", "g3"]);
  });

  it("does not replace entries with different dates", async () => {
    useHistoryStore.setState({
      entries: [
        { id: "h1", date: "2026-03-06", watchId: "w1" },
        { id: "h2", date: "2026-03-07", watchId: "w2" },
      ],
    });
    const updated = { id: "h3", date: "2026-03-07", watchId: "w3" };
    useHistoryStore.getState().upsertEntry(updated);
    await new Promise(r => setTimeout(r, 10));
    const entries = useHistoryStore.getState().entries;
    // Adds new entry (different id), keeps both originals
    expect(entries).toHaveLength(3);
    expect(entries[0].watchId).toBe("w1"); // unchanged
    expect(entries[1].watchId).toBe("w2"); // unchanged (different id)
    expect(entries[2].watchId).toBe("w3"); // new entry appended
  });

  it("replaces only the entry with matching id", async () => {
    useHistoryStore.setState({
      entries: [
        { id: "h1", date: "2026-03-07", watchId: "w1" },
        { id: "h2", date: "2026-03-08", watchId: "w2" },
      ],
    });
    useHistoryStore.getState().upsertEntry({ id: "h1", date: "2026-03-07", watchId: "w99" });
    await new Promise(r => setTimeout(r, 10));
    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0].watchId).toBe("w99");
    expect(entries[1].watchId).toBe("w2");
  });

  it("calls pushHistoryEntry for cloud sync", () => {
    const entry = { id: "h1", date: "2026-03-07", watchId: "w1" };
    useHistoryStore.getState().upsertEntry(entry);
    expect(pushHistoryEntry).toHaveBeenCalledWith(entry);
  });

  it("persists even when pushHistoryEntry rejects", async () => {
    pushHistoryEntry.mockRejectedValueOnce(new Error("Network fail"));
    useHistoryStore.getState().upsertEntry({ id: "h1", date: "2026-03-07", watchId: "w1" });
    await new Promise(r => setTimeout(r, 10));
    expect(useHistoryStore.getState().entries).toHaveLength(1);
  });
});

// ─── removeEntry ───────────────────────────────────────────────────────────

describe("historyStore — removeEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHistoryStore.setState({ entries: [] });
  });

  it("removes entry by id", async () => {
    useHistoryStore.setState({
      entries: [
        { id: "h1", date: "2026-03-06", watchId: "w1" },
        { id: "h2", date: "2026-03-07", watchId: "w2" },
      ],
    });
    useHistoryStore.getState().removeEntry("h1");
    await new Promise(r => setTimeout(r, 10));
    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("h2");
  });

  it("no-op when id does not exist", async () => {
    useHistoryStore.setState({
      entries: [{ id: "h1", date: "2026-03-07", watchId: "w1" }],
    });
    useHistoryStore.getState().removeEntry("nonexistent");
    await new Promise(r => setTimeout(r, 10));
    expect(useHistoryStore.getState().entries).toHaveLength(1);
  });

  it("calls deleteHistoryEntry for cloud sync", () => {
    useHistoryStore.setState({
      entries: [{ id: "h1", date: "2026-03-07", watchId: "w1" }],
    });
    useHistoryStore.getState().removeEntry("h1");
    expect(deleteHistoryEntry).toHaveBeenCalledWith("h1");
  });

  it("removes all entries when called for each", async () => {
    useHistoryStore.setState({
      entries: [
        { id: "h1", date: "2026-03-06" },
        { id: "h2", date: "2026-03-07" },
      ],
    });
    useHistoryStore.getState().removeEntry("h1");
    await new Promise(r => setTimeout(r, 10));
    useHistoryStore.getState().removeEntry("h2");
    await new Promise(r => setTimeout(r, 10));
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });

  it("persists even when deleteHistoryEntry rejects", async () => {
    deleteHistoryEntry.mockRejectedValueOnce(new Error("Network fail"));
    useHistoryStore.setState({
      entries: [{ id: "h1", date: "2026-03-07" }],
    });
    useHistoryStore.getState().removeEntry("h1");
    await new Promise(r => setTimeout(r, 10));
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });
});
