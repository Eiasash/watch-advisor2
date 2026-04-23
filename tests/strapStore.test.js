import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({}),
  setCachedState: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue(undefined),
  getImage: vi.fn().mockResolvedValue(undefined),
}));

import { useStrapStore } from "../src/stores/strapStore.js";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

const snowflake = WATCH_COLLECTION.find(w => w.id === "snowflake");

function resetStore() {
  // Reset to initial state by re-running the builder logic
  const straps = {};
  const activeStrap = {};
  for (const watch of WATCH_COLLECTION) {
    if (!watch.straps?.length) continue;
    for (const s of watch.straps) {
      straps[s.id] = { ...s, watchId: watch.id, thumbnail: null, photoUrl: null, wristShot: null, custom: false };
    }
    activeStrap[watch.id] = watch.straps[0].id;
  }
  useStrapStore.setState({ straps, activeStrap });
}

describe("strapStore", () => {
  beforeEach(resetStore);

  // ─── Initial state ───────────────────────────────────────────────────────
  it("initialises straps from WATCH_COLLECTION", () => {
    const state = useStrapStore.getState();
    expect(Object.keys(state.straps).length).toBeGreaterThan(0);
    expect(state.straps["snowflake-grey-alligator"]).toBeDefined();
    expect(state.straps["snowflake-grey-alligator"].watchId).toBe("snowflake");
  });

  it("sets first strap as active for each watch", () => {
    const state = useStrapStore.getState();
    expect(state.activeStrap["snowflake"]).toBe("snowflake-grey-alligator");
  });

  // ─── setActiveStrap ──────────────────────────────────────────────────────
  it("setActiveStrap changes active strap for a watch", () => {
    useStrapStore.getState().setActiveStrap("snowflake", "snowflake-navy-alligator");
    expect(useStrapStore.getState().activeStrap["snowflake"]).toBe("snowflake-navy-alligator");
  });

  // ─── addStrapPhoto ───────────────────────────────────────────────────────
  it("addStrapPhoto sets thumbnail and photoUrl", () => {
    useStrapStore.getState().addStrapPhoto("snowflake-grey-alligator", "thumb:data", "blob:photo");
    const strap = useStrapStore.getState().straps["snowflake-grey-alligator"];
    expect(strap.thumbnail).toBe("thumb:data");
    expect(strap.photoUrl).toBe("blob:photo");
  });

  it("addStrapPhoto preserves existing photoUrl when not provided", () => {
    useStrapStore.getState().addStrapPhoto("snowflake-grey-alligator", "t1", "url1");
    useStrapStore.getState().addStrapPhoto("snowflake-grey-alligator", "t2");
    const strap = useStrapStore.getState().straps["snowflake-grey-alligator"];
    expect(strap.thumbnail).toBe("t2");
    expect(strap.photoUrl).toBe("url1");
  });

  // ─── addWristShot ────────────────────────────────────────────────────────
  it("addWristShot sets wristShot on a strap", () => {
    useStrapStore.getState().addWristShot("snowflake-grey-alligator", "wrist:data");
    expect(useStrapStore.getState().straps["snowflake-grey-alligator"].wristShot).toBe("wrist:data");
  });

  // ─── addStrap (custom) ──────────────────────────────────────────────────
  it("addStrap creates a custom strap and sets it active", () => {
    const id = useStrapStore.getState().addStrap("snowflake", { label: "Custom NATO", color: "green", type: "nato" });
    expect(id).toMatch(/^custom-snowflake-/);
    const strap = useStrapStore.getState().straps[id];
    expect(strap.custom).toBe(true);
    expect(strap.label).toBe("Custom NATO");
    expect(strap.watchId).toBe("snowflake");
    expect(useStrapStore.getState().activeStrap["snowflake"]).toBe(id);
  });

  // ─── updateStrap ─────────────────────────────────────────────────────────
  it("updateStrap patches strap properties", () => {
    useStrapStore.getState().updateStrap("snowflake-grey-alligator", { label: "Updated label" });
    expect(useStrapStore.getState().straps["snowflake-grey-alligator"].label).toBe("Updated label");
  });

  // ─── deleteStrap ─────────────────────────────────────────────────────────
  it("deleteStrap removes a strap", () => {
    useStrapStore.getState().deleteStrap("snowflake-navy-alligator");
    expect(useStrapStore.getState().straps["snowflake-navy-alligator"]).toBeUndefined();
  });

  it("deleteStrap resets active to fallback when deleting active strap", () => {
    useStrapStore.getState().setActiveStrap("snowflake", "snowflake-navy-alligator");
    useStrapStore.getState().deleteStrap("snowflake-navy-alligator");
    // Should fall back to the other strap
    expect(useStrapStore.getState().activeStrap["snowflake"]).toBe("snowflake-grey-alligator");
  });

  it("deleteStrap sets active to null when no fallback exists", () => {
    // Delete all straps
    useStrapStore.getState().deleteStrap("snowflake-grey-alligator");
    useStrapStore.getState().deleteStrap("snowflake-navy-alligator");
    useStrapStore.getState().deleteStrap("snowflake-titanium-bracelet");
    expect(useStrapStore.getState().activeStrap["snowflake"]).toBe(null);
  });

  // ─── getActiveStrapObj ───────────────────────────────────────────────────
  it("getActiveStrapObj returns current active strap object", () => {
    const strap = useStrapStore.getState().getActiveStrapObj("snowflake");
    expect(strap).not.toBeNull();
    expect(strap.id).toBe("snowflake-grey-alligator");
  });

  it("getActiveStrapObj returns null for unknown watch", () => {
    const strap = useStrapStore.getState().getActiveStrapObj("nonexistent-watch");
    expect(strap).toBeNull();
  });

  // ─── getStrapsForWatch ───────────────────────────────────────────────────
  it("getStrapsForWatch returns all straps for a watch", () => {
    const straps = useStrapStore.getState().getStrapsForWatch("snowflake");
    expect(straps.length).toBe(3);
    expect(straps.map(s => s.id)).toContain("snowflake-grey-alligator");
    expect(straps.map(s => s.id)).toContain("snowflake-navy-alligator");
    expect(straps.map(s => s.id)).toContain("snowflake-titanium-bracelet");
  });

  it("getStrapsForWatch returns empty array for unknown watch", () => {
    const straps = useStrapStore.getState().getStrapsForWatch("nonexistent-watch");
    expect(straps.length).toBe(0);
  });

  // ─── hydrate / serialise ─────────────────────────────────────────────────
  it("serialise returns straps and activeStrap", () => {
    const serialised = useStrapStore.getState().serialise();
    expect(serialised).toHaveProperty("straps");
    expect(serialised).toHaveProperty("activeStrap");
  });

  it("hydrate merges saved state into current state", () => {
    const saved = {
      straps: { "extra-strap": { id: "extra-strap", watchId: "test", custom: true } },
      activeStrap: { test: "extra-strap" },
    };
    useStrapStore.getState().hydrate(saved);
    expect(useStrapStore.getState().straps["extra-strap"]).toBeDefined();
    expect(useStrapStore.getState().activeStrap["test"]).toBe("extra-strap");
    // Original straps preserved
    expect(useStrapStore.getState().straps["snowflake-grey-alligator"]).toBeDefined();
  });

  it("hydrate with null does nothing", () => {
    const before = useStrapStore.getState().serialise();
    useStrapStore.getState().hydrate(null);
    const after = useStrapStore.getState().serialise();
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });
});

// ─── moveStrap ───────────────────────────────────────────────────────────────

describe("strapStore — moveStrap", () => {
  beforeEach(resetStore);

  it("moves a strap to a different watch", () => {
    useStrapStore.getState().moveStrap("snowflake-navy-alligator", "snowflake", "reverso");
    const strap = useStrapStore.getState().straps["snowflake-navy-alligator"];
    expect(strap.watchId).toBe("reverso");
    expect(strap.crossStrapped).toBe(true);
    expect(strap.originalWatchId).toBe("snowflake");
  });

  it("auto-activates the moved strap on the target watch", () => {
    useStrapStore.getState().moveStrap("snowflake-navy-alligator", "snowflake", "reverso");
    expect(useStrapStore.getState().activeStrap["reverso"]).toBe("snowflake-navy-alligator");
  });

  it("falls back active strap on source watch when moved strap was active", () => {
    // Set navy as active, then move it
    useStrapStore.getState().setActiveStrap("snowflake", "snowflake-navy-alligator");
    useStrapStore.getState().moveStrap("snowflake-navy-alligator", "snowflake", "reverso");
    // Source watch should fall back to another strap
    const activeOnSnowflake = useStrapStore.getState().activeStrap["snowflake"];
    expect(activeOnSnowflake).not.toBe("snowflake-navy-alligator");
  });

  it("sets source active to null when no fallback remains", () => {
    // Create a watch with only one strap to test null fallback
    useStrapStore.setState(s => ({
      straps: { ...s.straps, "solo-strap": { id: "solo-strap", watchId: "solo-watch", custom: true } },
      activeStrap: { ...s.activeStrap, "solo-watch": "solo-strap" },
    }));
    useStrapStore.getState().moveStrap("solo-strap", "solo-watch", "reverso");
    expect(useStrapStore.getState().activeStrap["solo-watch"]).toBeNull();
  });

  it("does nothing when strap does not exist", () => {
    const before = JSON.stringify(useStrapStore.getState().serialise());
    useStrapStore.getState().moveStrap("nonexistent-strap", "snowflake", "reverso");
    const after = JSON.stringify(useStrapStore.getState().serialise());
    expect(after).toBe(before);
  });

  it("preserves originalWatchId if already set (nested cross-strap)", () => {
    // First move to reverso
    useStrapStore.getState().moveStrap("snowflake-navy-alligator", "snowflake", "reverso");
    // Then move again to another watch — originalWatchId should stay as "snowflake"
    useStrapStore.getState().moveStrap("snowflake-navy-alligator", "reverso", "speedmaster");
    const strap = useStrapStore.getState().straps["snowflake-navy-alligator"];
    expect(strap.originalWatchId).toBe("snowflake");
    expect(strap.watchId).toBe("speedmaster");
  });
});

// ─── returnStrap ─────────────────────────────────────────────────────────────

describe("strapStore — returnStrap", () => {
  beforeEach(resetStore);

  it("returns a cross-strapped strap to its original watch", () => {
    useStrapStore.getState().moveStrap("snowflake-navy-alligator", "snowflake", "reverso");
    useStrapStore.getState().returnStrap("snowflake-navy-alligator");
    const strap = useStrapStore.getState().straps["snowflake-navy-alligator"];
    expect(strap.watchId).toBe("snowflake");
    expect(strap.crossStrapped).toBe(false);
  });

  it("activates the strap on its original watch after return", () => {
    useStrapStore.getState().moveStrap("snowflake-navy-alligator", "snowflake", "reverso");
    useStrapStore.getState().returnStrap("snowflake-navy-alligator");
    expect(useStrapStore.getState().activeStrap["snowflake"]).toBe("snowflake-navy-alligator");
  });

  it("falls back active on current watch when returned strap was active there", () => {
    useStrapStore.getState().moveStrap("snowflake-navy-alligator", "snowflake", "reverso");
    // navy-alligator is now active on reverso (set by moveStrap)
    useStrapStore.getState().returnStrap("snowflake-navy-alligator");
    // reverso should fall back to another strap or null
    expect(useStrapStore.getState().activeStrap["reverso"]).not.toBe("snowflake-navy-alligator");
  });

  it("does nothing when strap has no originalWatchId", () => {
    const before = JSON.stringify(useStrapStore.getState().serialise());
    useStrapStore.getState().returnStrap("snowflake-grey-alligator"); // not cross-strapped
    const after = JSON.stringify(useStrapStore.getState().serialise());
    expect(after).toBe(before);
  });

  it("does nothing for nonexistent strap", () => {
    const before = JSON.stringify(useStrapStore.getState().serialise());
    useStrapStore.getState().returnStrap("nonexistent-strap");
    const after = JSON.stringify(useStrapStore.getState().serialise());
    expect(after).toBe(before);
  });
});

// ─── getCrossStrapped ─────────────────────────────────────────────────────────

describe("strapStore — getCrossStrapped", () => {
  beforeEach(resetStore);

  it("returns empty array when no straps are cross-strapped", () => {
    expect(useStrapStore.getState().getCrossStrapped()).toHaveLength(0);
  });

  it("returns cross-strapped straps after a move", () => {
    useStrapStore.getState().moveStrap("snowflake-navy-alligator", "snowflake", "reverso");
    const xStrapped = useStrapStore.getState().getCrossStrapped();
    expect(xStrapped).toHaveLength(1);
    expect(xStrapped[0].id).toBe("snowflake-navy-alligator");
  });

  it("returns multiple cross-strapped straps", () => {
    useStrapStore.getState().moveStrap("snowflake-navy-alligator", "snowflake", "reverso");
    useStrapStore.getState().moveStrap("snowflake-grey-alligator", "snowflake", "speedmaster");
    expect(useStrapStore.getState().getCrossStrapped()).toHaveLength(2);
  });
});

// ─── incrementWearCount ───────────────────────────────────────────────────────

describe("strapStore — incrementWearCount", () => {
  beforeEach(resetStore);

  it("increments wearCount from 0 to 1", () => {
    useStrapStore.getState().incrementWearCount("snowflake-grey-alligator");
    const strap = useStrapStore.getState().straps["snowflake-grey-alligator"];
    expect(strap.wearCount).toBe(1);
  });

  it("accumulates wear counts across multiple calls", () => {
    useStrapStore.getState().incrementWearCount("snowflake-grey-alligator");
    useStrapStore.getState().incrementWearCount("snowflake-grey-alligator");
    useStrapStore.getState().incrementWearCount("snowflake-grey-alligator");
    expect(useStrapStore.getState().straps["snowflake-grey-alligator"].wearCount).toBe(3);
  });

  it("sets lastWorn to today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    useStrapStore.getState().incrementWearCount("snowflake-grey-alligator");
    expect(useStrapStore.getState().straps["snowflake-grey-alligator"].lastWorn).toBe(today);
  });

  it("does nothing for nonexistent strap", () => {
    const before = JSON.stringify(useStrapStore.getState().serialise());
    useStrapStore.getState().incrementWearCount("nonexistent-strap");
    const after = JSON.stringify(useStrapStore.getState().serialise());
    expect(after).toBe(before);
  });
});

// ─── getStrapStats ────────────────────────────────────────────────────────────

describe("strapStore — getStrapStats", () => {
  beforeEach(resetStore);

  it("returns null for nonexistent strap", () => {
    expect(useStrapStore.getState().getStrapStats("nonexistent")).toBeNull();
  });

  it("returns correct stats for a fresh strap", () => {
    const stats = useStrapStore.getState().getStrapStats("snowflake-grey-alligator");
    expect(stats).not.toBeNull();
    expect(stats.wears).toBe(0);
    expect(stats.lastWorn).toBeNull();
    expect(stats.healthPct).toBe(100);
    expect(stats.needsReplacement).toBe(false);
  });

  it("healthPct decreases as wears increase", () => {
    // Wear the strap many times
    for (let i = 0; i < 100; i++) {
      useStrapStore.getState().incrementWearCount("snowflake-grey-alligator");
    }
    const stats = useStrapStore.getState().getStrapStats("snowflake-grey-alligator");
    // leather type → lifespan 200; 100/200 = 50% used → 50% health
    expect(stats.wears).toBe(100);
    expect(stats.healthPct).toBe(50);
    expect(stats.lifespan).toBe(200);
  });

  it("healthPct is clamped to 0 at max wears", () => {
    for (let i = 0; i < 220; i++) {
      useStrapStore.getState().incrementWearCount("snowflake-grey-alligator");
    }
    const stats = useStrapStore.getState().getStrapStats("snowflake-grey-alligator");
    expect(stats.healthPct).toBe(0);
    expect(stats.needsReplacement).toBe(true);
  });

  it("bracelet type uses 9999 lifespan → near 100% health", () => {
    const stats = useStrapStore.getState().getStrapStats("snowflake-titanium-bracelet");
    expect(stats).not.toBeNull();
    expect(stats.lifespan).toBe(9999);
    expect(stats.healthPct).toBe(100);
    expect(stats.needsReplacement).toBe(false);
  });

  it("includes lastWorn date after wear", () => {
    useStrapStore.getState().incrementWearCount("snowflake-grey-alligator");
    const stats = useStrapStore.getState().getStrapStats("snowflake-grey-alligator");
    expect(stats.lastWorn).not.toBeNull();
    expect(stats.lastWorn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── selectActiveStrap / selectStrapsForWatch ──────────────────────────────

describe("strapStore — selectActiveStrap and selectStrapsForWatch selectors", () => {
  beforeEach(resetStore);

  it("selectActiveStrap returns same reference when strap unchanged", async () => {
    const { selectActiveStrap } = await import("../src/stores/strapStore.js");
    const selector = selectActiveStrap("snowflake");
    const s1 = selector(useStrapStore.getState());
    const s2 = selector(useStrapStore.getState());
    // No change → same reference
    expect(s1).toBe(s2);
  });

  it("selectActiveStrap returns new reference when strap changes", async () => {
    const { selectActiveStrap } = await import("../src/stores/strapStore.js");
    const selector = selectActiveStrap("snowflake");
    const s1 = selector(useStrapStore.getState());
    // Change the active strap
    useStrapStore.getState().setActiveStrap("snowflake", "snowflake-navy-alligator");
    const s2 = selector(useStrapStore.getState());
    expect(s1?.id).not.toBe(s2?.id);
  });

  it("selectActiveStrap returns null for a watch with no active strap", async () => {
    const { selectActiveStrap } = await import("../src/stores/strapStore.js");
    const selector = selectActiveStrap("watch-with-no-straps");
    const result = selector(useStrapStore.getState());
    expect(result).toBeNull();
  });

  it("selectStrapsForWatch returns straps for a watch", async () => {
    const { selectStrapsForWatch } = await import("../src/stores/strapStore.js");
    const selector = selectStrapsForWatch("snowflake");
    const straps = selector(useStrapStore.getState());
    expect(straps.length).toBeGreaterThan(0);
    expect(straps.every(s => s.watchId === "snowflake")).toBe(true);
  });

  it("selectStrapsForWatch returns same reference when straps unchanged", async () => {
    const { selectStrapsForWatch } = await import("../src/stores/strapStore.js");
    const selector = selectStrapsForWatch("snowflake");
    const r1 = selector(useStrapStore.getState());
    const r2 = selector(useStrapStore.getState());
    expect(r1).toBe(r2);
  });

  it("selectStrapsForWatch returns new reference when straps change", async () => {
    const { selectStrapsForWatch } = await import("../src/stores/strapStore.js");
    const selector = selectStrapsForWatch("snowflake");
    const r1 = selector(useStrapStore.getState());
    // Add a new strap
    useStrapStore.getState().addStrap("snowflake", { label: "Test NATO", type: "nato" });
    const r2 = selector(useStrapStore.getState());
    expect(r1.length).not.toBe(r2.length);
  });

  it("selectStrapsForWatch returns empty array for unknown watch", async () => {
    const { selectStrapsForWatch } = await import("../src/stores/strapStore.js");
    const selector = selectStrapsForWatch("unknown-watch-id");
    const result = selector(useStrapStore.getState());
    expect(result).toEqual([]);
  });
});
