/**
 * Regression seal for F-a-5: historyStore.upsertEntry must persist the
 * MERGED entry to IDB + cloud, not the partial passed by the caller. Otherwise
 * callsites like WatchDashboard "Check In" (which omit outfitPhoto) would
 * write a partial to IDB, and on next reload `loadAll()` would return rows
 * missing fields that Zustand had merged in earlier in the session.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertSpy = vi.fn().mockResolvedValue(undefined);
const removeSpy = vi.fn().mockResolvedValue(undefined);
vi.mock("../src/services/persistence/historyPersistence.js", () => ({
  upsert: (...args) => upsertSpy(...args),
  remove: (...args) => removeSpy(...args),
}));

const pushHistoryEntry  = vi.fn().mockResolvedValue(undefined);
const deleteHistoryEntry = vi.fn().mockResolvedValue(undefined);
vi.mock("../src/services/supabaseSync.js", () => ({
  pushHistoryEntry:    (...args) => pushHistoryEntry(...args),
  deleteHistoryEntry:  (...args) => deleteHistoryEntry(...args),
}));

beforeEach(async () => {
  upsertSpy.mockClear();
  pushHistoryEntry.mockClear();
  // Reset zustand store state between tests
  const mod = await import("../src/stores/historyStore.js");
  mod.useHistoryStore.setState({ entries: [] });
});

async function flushMicrotasks() {
  // Allow getPersistence dynamic import + .then chain to resolve
  await new Promise(r => setTimeout(r, 20));
}

describe("historyStore.upsertEntry IDB write symmetry (F-a-5)", () => {
  it("persists the MERGED entry to IDB when called with a partial", async () => {
    const { useHistoryStore } = await import("../src/stores/historyStore.js");
    // Seed with full entry
    const full = {
      id: "e1", date: "2026-05-09", watchId: "w1",
      outfitPhoto: "data:image/png;base64,FULL_PHOTO",
      garmentIds: ["g1"], notes: "looks great", score: 8,
    };
    useHistoryStore.setState({ entries: [full] });

    // Caller (e.g. WatchDashboard Check In) passes a partial without outfitPhoto
    useHistoryStore.getState().upsertEntry({ id: "e1", checkInAt: "2026-05-09T18:00:00Z" });

    // Zustand merges synchronously
    const inMem = useHistoryStore.getState().entries.find(e => e.id === "e1");
    expect(inMem.outfitPhoto).toBe("data:image/png;base64,FULL_PHOTO");
    expect(inMem.notes).toBe("looks great");
    expect(inMem.checkInAt).toBe("2026-05-09T18:00:00Z");

    // Drain the dynamic import + fire-and-forget chain
    await flushMicrotasks();

    // IDB write must include the merged outfitPhoto, not just the partial
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const written = upsertSpy.mock.calls[0][0];
    expect(written.outfitPhoto).toBe("data:image/png;base64,FULL_PHOTO");
    expect(written.notes).toBe("looks great");
    expect(written.checkInAt).toBe("2026-05-09T18:00:00Z");
    // Cloud push too
    expect(pushHistoryEntry).toHaveBeenCalledTimes(1);
    expect(pushHistoryEntry.mock.calls[0][0].outfitPhoto).toBe("data:image/png;base64,FULL_PHOTO");
  });

  it("persists a full entry as-is when called with full (no regression for non-partial callers)", async () => {
    const { useHistoryStore } = await import("../src/stores/historyStore.js");
    const full = { id: "e2", date: "2026-05-09", watchId: "w1", outfitPhoto: "P", notes: "n", garmentIds: ["g1"], score: 7 };
    useHistoryStore.getState().upsertEntry(full);
    await flushMicrotasks();
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const written = upsertSpy.mock.calls[0][0];
    expect(written.id).toBe("e2");
    expect(written.outfitPhoto).toBe("P");
    expect(written.notes).toBe("n");
  });

  it("inserts new entries straight to IDB when no prior entry exists", async () => {
    const { useHistoryStore } = await import("../src/stores/historyStore.js");
    useHistoryStore.getState().upsertEntry({ id: "e3", date: "2026-05-09", watchId: "w1", garmentIds: ["g1"], score: 6 });
    await flushMicrotasks();
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy.mock.calls[0][0].id).toBe("e3");
  });
});
