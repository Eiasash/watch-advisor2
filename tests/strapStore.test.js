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
    // Delete both straps
    useStrapStore.getState().deleteStrap("snowflake-grey-alligator");
    useStrapStore.getState().deleteStrap("snowflake-navy-alligator");
    expect(useStrapStore.getState().activeStrap["snowflake"]).toBe(null);
  });

  // ─── getActiveStrapObj ───────────────────────────────────────────────────
  it("getActiveStrapObj returns current active strap object", () => {
    const strap = useStrapStore.getState().getActiveStrapObj("snowflake");
    expect(strap).not.toBeNull();
    expect(strap.id).toBe("snowflake-grey-alligator");
  });

  it("getActiveStrapObj returns null for watch without straps", () => {
    const strap = useStrapStore.getState().getActiveStrapObj("laureato");
    expect(strap).toBeNull();
  });

  // ─── getStrapsForWatch ───────────────────────────────────────────────────
  it("getStrapsForWatch returns all straps for a watch", () => {
    const straps = useStrapStore.getState().getStrapsForWatch("snowflake");
    expect(straps.length).toBe(2);
    expect(straps.map(s => s.id)).toContain("snowflake-grey-alligator");
    expect(straps.map(s => s.id)).toContain("snowflake-navy-alligator");
  });

  it("getStrapsForWatch returns empty array for watch without straps", () => {
    const straps = useStrapStore.getState().getStrapsForWatch("laureato");
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
