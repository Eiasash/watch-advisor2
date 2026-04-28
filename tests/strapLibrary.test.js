import { describe, it, expect } from "vitest";
import {
  buildStrapList, watchesForStrap, sampleOutfitsForStrap, groupStrapsByType,
} from "../src/features/strapLibrary/strapLibrary.js";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

describe("strapLibrary", () => {
  describe("buildStrapList", () => {
    it("returns empty array for empty input", () => {
      expect(buildStrapList({})).toEqual([]);
    });

    it("hydrates straps with originWatch reference", () => {
      const snowflake = WATCH_COLLECTION.find(w => w.id === "snowflake");
      const grey = snowflake.straps.find(s => s.id === "snowflake-grey-alligator");
      const list = buildStrapList({
        [grey.id]: { ...grey, watchId: "snowflake" },
      });
      expect(list).toHaveLength(1);
      expect(list[0].originWatchId).toBe("snowflake");
      expect(list[0].originWatch?.brand).toBe("Grand Seiko");
    });

    it("sorts by type, color, label", () => {
      const list = buildStrapList({
        a: { id: "a", watchId: "x", type: "leather", color: "brown", label: "B" },
        b: { id: "b", watchId: "x", type: "bracelet", color: "silver", label: "Bracelet" },
        c: { id: "c", watchId: "x", type: "leather", color: "brown", label: "A" },
        d: { id: "d", watchId: "x", type: "leather", color: "black", label: "Black" },
      });
      expect(list.map(s => s.id)).toEqual(["b", "d", "c", "a"]);
    });

    it("ignores entries missing id", () => {
      const list = buildStrapList({
        good: { id: "good", watchId: "x" },
        bad: null,
        empty: { watchId: "x" }, // no id
      });
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("good");
    });
  });

  describe("watchesForStrap", () => {
    it("returns empty for null strap", () => {
      expect(watchesForStrap(null)).toEqual([]);
    });

    it("returns owning watch for bracelet (no cross-strap)", () => {
      const w = WATCH_COLLECTION.find(x => x.id === "blackbay");
      const bracelet = w.straps.find(s => s.type === "bracelet");
      const result = watchesForStrap({ ...bracelet, watchId: "blackbay" });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("blackbay");
    });

    it("returns owning watch for integrated strap", () => {
      const w = WATCH_COLLECTION.find(x => x.id === "laureato");
      const integrated = w.straps[0];
      const result = watchesForStrap({ ...integrated, watchId: "laureato" });
      expect(result.length).toBe(1);
    });

    it("includes lug-matched watches in same style family for leather", () => {
      // Hanhart leather (20mm pilot/sport) — should NOT cross to dress watches
      const hanhart = WATCH_COLLECTION.find(x => x.id === "hanhart");
      const leather = hanhart.straps.find(s => s.type === "leather");
      const result = watchesForStrap({ ...leather, watchId: "hanhart" });
      expect(result[0].id).toBe("hanhart");
      // Could include other 20mm tool/sport watches; should not include the
      // Snowflake (19mm dress) since lug width mismatches
      expect(result.find(w => w.id === "snowflake")).toBeUndefined();
    });

    it("NATO straps cross-fit any lug-matched watch (universal)", () => {
      // Speedmaster NATO (20mm)
      const speedy = WATCH_COLLECTION.find(x => x.id === "speedmaster");
      const nato = speedy.straps.find(s => s.type === "nato");
      const result = watchesForStrap({ ...nato, watchId: "speedmaster" });
      // Should include the speedy + at least one other 20mm watch
      expect(result.length).toBeGreaterThan(1);
    });

    it("excludes retired watches from cross-strap candidates", () => {
      const speedy = WATCH_COLLECTION.find(x => x.id === "speedmaster");
      const nato = speedy.straps.find(s => s.type === "nato");
      const result = watchesForStrap({ ...nato, watchId: "speedmaster" });
      const retired = result.filter(w => w.retired);
      expect(retired.length).toBe(0);
    });
  });

  describe("sampleOutfitsForStrap", () => {
    it("returns empty for missing inputs", () => {
      expect(sampleOutfitsForStrap(null, null)).toEqual([]);
    });

    it("recommends black shoe for black leather", () => {
      const watch = WATCH_COLLECTION.find(w => w.id === "monaco");
      const strap = watch.straps[0]; // black leather
      const recs = sampleOutfitsForStrap(strap, watch);
      expect(recs.some(r => /black/i.test(r.shoes))).toBe(true);
    });

    it("recommends brown shoe for brown leather", () => {
      const watch = WATCH_COLLECTION.find(w => w.id === "blackbay");
      const strap = watch.straps.find(s => s.color === "brown");
      const recs = sampleOutfitsForStrap(strap, watch);
      expect(recs.some(r => /brown|cognac/i.test(r.shoes))).toBe(true);
    });

    it("flags bracelet as versatile", () => {
      const watch = WATCH_COLLECTION.find(w => w.id === "gmt");
      const strap = watch.straps[0];
      const recs = sampleOutfitsForStrap(strap, watch);
      expect(recs.some(r => r.context === "Versatile")).toBe(true);
    });

    it("recommends dressy outfit for high-formality watches", () => {
      const watch = WATCH_COLLECTION.find(w => w.id === "reverso"); // formality 9
      const strap = watch.straps[0];
      const recs = sampleOutfitsForStrap(strap, watch);
      expect(recs.some(r => r.context === "Dressy")).toBe(true);
    });
  });

  describe("groupStrapsByType", () => {
    it("groups by strap type", () => {
      const list = [
        { id: "1", type: "leather" },
        { id: "2", type: "leather" },
        { id: "3", type: "bracelet" },
        { id: "4", type: undefined },
      ];
      const groups = groupStrapsByType(list);
      expect(groups.leather).toHaveLength(2);
      expect(groups.bracelet).toHaveLength(1);
      expect(groups.other).toHaveLength(1);
    });
  });
});
