import { describe, it, expect, vi, beforeEach } from "vitest";

import { useWatchStore } from "../src/stores/watchStore.js";

describe("watchStore", () => {
  beforeEach(() => {
    useWatchStore.setState({ watches: [], activeWatch: null });
  });

  // ─── setWatches ──────────────────────────────────────────────────────────

  describe("setWatches", () => {
    it("replaces entire watches array", () => {
      const watches = [
        { id: "w1", name: "Submariner", style: "sport", formality: 6, replica: false },
        { id: "w2", name: "Datejust", style: "dress-sport", formality: 7, replica: false },
      ];
      useWatchStore.getState().setWatches(watches);
      expect(useWatchStore.getState().watches).toHaveLength(2);
      expect(useWatchStore.getState().watches[0].id).toBe("w1");
      expect(useWatchStore.getState().watches[1].id).toBe("w2");
    });

    it("replaces existing watches with new array", () => {
      useWatchStore.setState({ watches: [{ id: "old" }] });
      useWatchStore.getState().setWatches([{ id: "new1" }, { id: "new2" }]);
      expect(useWatchStore.getState().watches).toHaveLength(2);
      expect(useWatchStore.getState().watches[0].id).toBe("new1");
    });

    it("can set watches to empty array", () => {
      useWatchStore.setState({ watches: [{ id: "w1" }] });
      useWatchStore.getState().setWatches([]);
      expect(useWatchStore.getState().watches).toHaveLength(0);
    });

    it("does not affect activeWatch when setting watches", () => {
      const activeWatch = { id: "w1", name: "Test" };
      useWatchStore.setState({ activeWatch });
      useWatchStore.getState().setWatches([{ id: "w2" }]);
      expect(useWatchStore.getState().activeWatch).toBe(activeWatch);
    });
  });

  // ─── setActiveWatch ──────────────────────────────────────────────────────

  describe("setActiveWatch", () => {
    it("sets the active watch", () => {
      const watch = { id: "w1", name: "Submariner", dial: "black" };
      useWatchStore.getState().setActiveWatch(watch);
      expect(useWatchStore.getState().activeWatch).toBe(watch);
      expect(useWatchStore.getState().activeWatch.id).toBe("w1");
    });

    it("can set active watch to null", () => {
      useWatchStore.setState({ activeWatch: { id: "w1" } });
      useWatchStore.getState().setActiveWatch(null);
      expect(useWatchStore.getState().activeWatch).toBeNull();
    });

    it("replaces previous active watch", () => {
      useWatchStore.getState().setActiveWatch({ id: "w1" });
      useWatchStore.getState().setActiveWatch({ id: "w2" });
      expect(useWatchStore.getState().activeWatch.id).toBe("w2");
    });

    it("does not affect watches array", () => {
      useWatchStore.setState({ watches: [{ id: "w1" }, { id: "w2" }] });
      useWatchStore.getState().setActiveWatch({ id: "w1" });
      expect(useWatchStore.getState().watches).toHaveLength(2);
    });

    it("stores full watch object with all properties", () => {
      const watch = {
        id: "snowflake",
        name: "Grand Seiko Snowflake",
        style: "dress-sport",
        formality: 7,
        dial: "silver-white",
        strap: "bracelet",
        replica: false,
      };
      useWatchStore.getState().setActiveWatch(watch);
      const active = useWatchStore.getState().activeWatch;
      expect(active.name).toBe("Grand Seiko Snowflake");
      expect(active.style).toBe("dress-sport");
      expect(active.strap).toBe("bracelet");
      expect(active.replica).toBe(false);
    });
  });
});
