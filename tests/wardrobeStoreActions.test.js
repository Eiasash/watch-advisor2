import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({ garments: [], history: [] }),
  setCachedState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/supabaseSync.js", () => ({
  pushHistoryEntry: vi.fn().mockResolvedValue(undefined),
  pushGarment: vi.fn().mockResolvedValue(undefined),
  pullCloudState: vi.fn().mockResolvedValue({ garments: [], history: [] }),
  subscribeSyncState: vi.fn(() => () => {}),
}));

import { useWardrobeStore } from "../src/stores/wardrobeStore.js";

describe("wardrobeStore — setGarments", () => {
  beforeEach(() => {
    useWardrobeStore.setState({ garments: [], selectedIds: new Set(), selectMode: false });
  });

  it("replaces entire garments array", () => {
    const garments = [
      { id: "g1", type: "shirt", color: "navy" },
      { id: "g2", type: "pants", color: "grey" },
    ];
    useWardrobeStore.getState().setGarments(garments);
    expect(useWardrobeStore.getState().garments).toHaveLength(2);
    expect(useWardrobeStore.getState().garments[0].id).toBe("g1");
  });

  it("can set to empty array", () => {
    useWardrobeStore.setState({ garments: [{ id: "g1" }] });
    useWardrobeStore.getState().setGarments([]);
    expect(useWardrobeStore.getState().garments).toHaveLength(0);
  });

  it("replaces, does not append", () => {
    useWardrobeStore.setState({ garments: [{ id: "g1" }] });
    useWardrobeStore.getState().setGarments([{ id: "g2" }]);
    expect(useWardrobeStore.getState().garments).toHaveLength(1);
    expect(useWardrobeStore.getState().garments[0].id).toBe("g2");
  });
});

describe("wardrobeStore — setWeekCtx", () => {
  beforeEach(() => {
    useWardrobeStore.setState({
      weekCtx: ["smart-casual","smart-casual","smart-casual","smart-casual","smart-casual","casual","casual"],
    });
  });

  it("sets week context array", () => {
    const ctx = ["formal","formal","formal","formal","formal","casual","casual"];
    useWardrobeStore.getState().setWeekCtx(ctx);
    expect(useWardrobeStore.getState().weekCtx).toEqual(ctx);
  });

  it("replaces entire weekCtx", () => {
    useWardrobeStore.getState().setWeekCtx(["casual","casual","casual","casual","casual","casual","casual"]);
    expect(useWardrobeStore.getState().weekCtx[0]).toBe("casual");
    expect(useWardrobeStore.getState().weekCtx[6]).toBe("casual");
  });
});

describe("wardrobeStore — setOnCallDates", () => {
  beforeEach(() => {
    useWardrobeStore.setState({ onCallDates: [] });
  });

  it("sets on-call dates array", () => {
    const dates = ["2026-03-07", "2026-03-14", "2026-03-21"];
    useWardrobeStore.getState().setOnCallDates(dates);
    expect(useWardrobeStore.getState().onCallDates).toEqual(dates);
  });

  it("can set to empty array", () => {
    useWardrobeStore.setState({ onCallDates: ["2026-03-07"] });
    useWardrobeStore.getState().setOnCallDates([]);
    expect(useWardrobeStore.getState().onCallDates).toHaveLength(0);
  });
});

describe("wardrobeStore — setSelectedGarmentId", () => {
  it("sets selectedGarmentId", () => {
    useWardrobeStore.getState().setSelectedGarmentId("g1");
    expect(useWardrobeStore.getState().selectedGarmentId).toBe("g1");
  });

  it("can set to null", () => {
    useWardrobeStore.getState().setSelectedGarmentId("g1");
    useWardrobeStore.getState().setSelectedGarmentId(null);
    expect(useWardrobeStore.getState().selectedGarmentId).toBeNull();
  });
});

describe("wardrobeStore — setHighlightedGarmentName", () => {
  it("sets highlightedGarmentName", () => {
    useWardrobeStore.getState().setHighlightedGarmentName("Navy Shirt");
    expect(useWardrobeStore.getState().highlightedGarmentName).toBe("Navy Shirt");
  });

  it("can set to null", () => {
    useWardrobeStore.getState().setHighlightedGarmentName("Navy Shirt");
    useWardrobeStore.getState().setHighlightedGarmentName(null);
    expect(useWardrobeStore.getState().highlightedGarmentName).toBeNull();
  });
});

describe("wardrobeStore — enterSelectMode / exitSelectMode", () => {
  beforeEach(() => {
    useWardrobeStore.setState({ selectMode: false, selectedIds: new Set() });
  });

  it("enterSelectMode sets selectMode to true", () => {
    useWardrobeStore.getState().enterSelectMode();
    expect(useWardrobeStore.getState().selectMode).toBe(true);
  });

  it("exitSelectMode sets selectMode to false and clears selection", () => {
    useWardrobeStore.setState({ selectMode: true, selectedIds: new Set(["g1", "g2"]) });
    useWardrobeStore.getState().exitSelectMode();
    expect(useWardrobeStore.getState().selectMode).toBe(false);
    expect(useWardrobeStore.getState().selectedIds.size).toBe(0);
  });
});
