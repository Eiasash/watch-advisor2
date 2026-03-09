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

import { useHistoryStore } from "../src/stores/historyStore.js";
import { setCachedState } from "../src/services/localCache.js";
import { pushHistoryEntry, deleteHistoryEntry } from "../src/services/supabaseSync.js";

// ─── upsertEntry ───────────────────────────────────────────────────────────

describe("historyStore — upsertEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHistoryStore.setState({ entries: [] });
  });

  it("appends entry when no matching date exists", () => {
    useHistoryStore.getState().upsertEntry({ id: "h1", date: "2026-03-07", watchId: "w1" });
    expect(useHistoryStore.getState().entries).toHaveLength(1);
    expect(useHistoryStore.getState().entries[0].id).toBe("h1");
  });

  it("replaces entry when matching date exists", () => {
    useHistoryStore.setState({
      entries: [{ id: "h1", date: "2026-03-07", watchId: "w1", garmentIds: ["g1"] }],
    });
    const updated = { id: "h1", date: "2026-03-07", watchId: "w2", garmentIds: ["g2", "g3"] };
    useHistoryStore.getState().upsertEntry(updated);
    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].watchId).toBe("w2");
    expect(entries[0].garmentIds).toEqual(["g2", "g3"]);
  });

  it("does not replace entries with different dates", () => {
    useHistoryStore.setState({
      entries: [
        { id: "h1", date: "2026-03-06", watchId: "w1" },
        { id: "h2", date: "2026-03-07", watchId: "w2" },
      ],
    });
    const updated = { id: "h3", date: "2026-03-07", watchId: "w3" };
    useHistoryStore.getState().upsertEntry(updated);
    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0].watchId).toBe("w1"); // unchanged
    expect(entries[1].watchId).toBe("w3"); // replaced
  });

  it("replaces only the first matching date entry", () => {
    useHistoryStore.setState({
      entries: [
        { id: "h1", date: "2026-03-07", watchId: "w1" },
        { id: "h2", date: "2026-03-08", watchId: "w2" },
      ],
    });
    useHistoryStore.getState().upsertEntry({ id: "h1-v2", date: "2026-03-07", watchId: "w99" });
    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0].watchId).toBe("w99");
    expect(entries[1].watchId).toBe("w2");
  });

  it("calls setCachedState with updated entries", () => {
    useHistoryStore.getState().upsertEntry({ id: "h1", date: "2026-03-07", watchId: "w1" });
    expect(setCachedState).toHaveBeenCalledWith({
      history: [{ id: "h1", date: "2026-03-07", watchId: "w1" }],
    });
  });

  it("calls pushHistoryEntry for cloud sync", () => {
    const entry = { id: "h1", date: "2026-03-07", watchId: "w1" };
    useHistoryStore.getState().upsertEntry(entry);
    expect(pushHistoryEntry).toHaveBeenCalledWith(entry);
  });

  it("persists even when setCachedState rejects", () => {
    setCachedState.mockRejectedValueOnce(new Error("IDB fail"));
    useHistoryStore.getState().upsertEntry({ id: "h1", date: "2026-03-07", watchId: "w1" });
    expect(useHistoryStore.getState().entries).toHaveLength(1);
  });

  it("persists even when pushHistoryEntry rejects", () => {
    pushHistoryEntry.mockRejectedValueOnce(new Error("Network fail"));
    useHistoryStore.getState().upsertEntry({ id: "h1", date: "2026-03-07", watchId: "w1" });
    expect(useHistoryStore.getState().entries).toHaveLength(1);
  });
});

// ─── removeEntry ───────────────────────────────────────────────────────────

describe("historyStore — removeEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHistoryStore.setState({ entries: [] });
  });

  it("removes entry by id", () => {
    useHistoryStore.setState({
      entries: [
        { id: "h1", date: "2026-03-06", watchId: "w1" },
        { id: "h2", date: "2026-03-07", watchId: "w2" },
      ],
    });
    useHistoryStore.getState().removeEntry("h1");
    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("h2");
  });

  it("no-op when id does not exist", () => {
    useHistoryStore.setState({
      entries: [{ id: "h1", date: "2026-03-07", watchId: "w1" }],
    });
    useHistoryStore.getState().removeEntry("nonexistent");
    expect(useHistoryStore.getState().entries).toHaveLength(1);
  });

  it("calls setCachedState with remaining entries", () => {
    useHistoryStore.setState({
      entries: [
        { id: "h1", date: "2026-03-06", watchId: "w1" },
        { id: "h2", date: "2026-03-07", watchId: "w2" },
      ],
    });
    useHistoryStore.getState().removeEntry("h1");
    expect(setCachedState).toHaveBeenCalledWith({
      history: [{ id: "h2", date: "2026-03-07", watchId: "w2" }],
    });
  });

  it("calls deleteHistoryEntry for cloud sync", () => {
    useHistoryStore.setState({
      entries: [{ id: "h1", date: "2026-03-07", watchId: "w1" }],
    });
    useHistoryStore.getState().removeEntry("h1");
    expect(deleteHistoryEntry).toHaveBeenCalledWith("h1");
  });

  it("removes all entries when called for each", () => {
    useHistoryStore.setState({
      entries: [
        { id: "h1", date: "2026-03-06" },
        { id: "h2", date: "2026-03-07" },
      ],
    });
    useHistoryStore.getState().removeEntry("h1");
    useHistoryStore.getState().removeEntry("h2");
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });

  it("persists even when deleteHistoryEntry rejects", () => {
    deleteHistoryEntry.mockRejectedValueOnce(new Error("Network fail"));
    useHistoryStore.setState({
      entries: [{ id: "h1", date: "2026-03-07" }],
    });
    useHistoryStore.getState().removeEntry("h1");
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });
});
