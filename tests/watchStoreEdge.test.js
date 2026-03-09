import { describe, it, expect, beforeEach } from "vitest";

import { useWatchStore } from "../src/stores/watchStore.js";

describe("watchStore — edge cases", () => {
  beforeEach(() => {
    useWatchStore.setState({ watches: [], activeWatch: null });
  });

  // ─── setWatches edge cases ─────────────────────────────────────────────────

  it("handles watches with duplicate IDs (stores as-is)", () => {
    const watches = [
      { id: "w1", name: "Watch A" },
      { id: "w1", name: "Watch B" },
    ];
    useWatchStore.getState().setWatches(watches);
    expect(useWatchStore.getState().watches).toHaveLength(2);
  });

  it("handles watch objects with minimal properties", () => {
    useWatchStore.getState().setWatches([{ id: "w1" }]);
    expect(useWatchStore.getState().watches[0].id).toBe("w1");
    expect(useWatchStore.getState().watches[0].name).toBeUndefined();
  });

  it("handles large collection", () => {
    const large = Array.from({ length: 100 }, (_, i) => ({ id: `w${i}`, name: `Watch ${i}` }));
    useWatchStore.getState().setWatches(large);
    expect(useWatchStore.getState().watches).toHaveLength(100);
  });

  // ─── setActiveWatch edge cases ─────────────────────────────────────────────

  it("can set active watch to object not in watches array", () => {
    useWatchStore.getState().setWatches([{ id: "w1" }]);
    useWatchStore.getState().setActiveWatch({ id: "w99", name: "Unknown" });
    expect(useWatchStore.getState().activeWatch.id).toBe("w99");
  });

  it("setting active watch to undefined behaves like null", () => {
    useWatchStore.getState().setActiveWatch({ id: "w1" });
    useWatchStore.getState().setActiveWatch(undefined);
    expect(useWatchStore.getState().activeWatch).toBeUndefined();
  });

  it("active watch reference is independent of watches array", () => {
    const watch = { id: "w1", name: "Submariner" };
    useWatchStore.getState().setActiveWatch(watch);
    useWatchStore.getState().setWatches([]); // clear collection
    expect(useWatchStore.getState().activeWatch.id).toBe("w1"); // still set
  });

  it("rapid successive setActiveWatch keeps last value", () => {
    for (let i = 0; i < 10; i++) {
      useWatchStore.getState().setActiveWatch({ id: `w${i}` });
    }
    expect(useWatchStore.getState().activeWatch.id).toBe("w9");
  });
});
