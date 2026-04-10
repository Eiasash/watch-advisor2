import { describe, it, expect, vi } from "vitest";

// Mock rotationStats
vi.mock("../src/domain/rotationStats.js", () => ({
  daysIdle: vi.fn((watchId) => {
    const map = { "w1": 3, "w2": 14, "w3": Infinity };
    return map[watchId] ?? 0;
  }),
  wearCount: vi.fn((watchId) => {
    const map = { "w1": 50, "w2": 12, "w3": 0 };
    return map[watchId] ?? 0;
  }),
  watchCPW: vi.fn((watch) => {
    if (watch.id === "w1") return 200;
    if (watch.id === "w2") return 850;
    return null;
  }),
}));

import { buildRotationMap } from "../src/domain/rotationSelectors.js";

describe("rotationSelectors — buildRotationMap", () => {
  const watches = [
    { id: "w1", brand: "Rolex", model: "Sub" },
    { id: "w2", brand: "Omega", model: "SM" },
    { id: "w3", brand: "Cartier", model: "Tank" },
  ];
  const history = [];

  it("returns a map keyed by watchId", () => {
    const map = buildRotationMap(watches, history);
    expect(Object.keys(map)).toEqual(["w1", "w2", "w3"]);
  });

  it("each entry has idle, wearCount, and cpw fields", () => {
    const map = buildRotationMap(watches, history);
    for (const key of Object.keys(map)) {
      expect(map[key]).toHaveProperty("idle");
      expect(map[key]).toHaveProperty("wearCount");
      expect(map[key]).toHaveProperty("cpw");
    }
  });

  it("computes correct idle days per watch", () => {
    const map = buildRotationMap(watches, history);
    expect(map["w1"].idle).toBe(3);
    expect(map["w2"].idle).toBe(14);
    expect(map["w3"].idle).toBe(Infinity);
  });

  it("computes correct wear counts", () => {
    const map = buildRotationMap(watches, history);
    expect(map["w1"].wearCount).toBe(50);
    expect(map["w2"].wearCount).toBe(12);
    expect(map["w3"].wearCount).toBe(0);
  });

  it("computes CPW (null for never-worn)", () => {
    const map = buildRotationMap(watches, history);
    expect(map["w1"].cpw).toBe(200);
    expect(map["w2"].cpw).toBe(850);
    expect(map["w3"].cpw).toBeNull();
  });

  it("returns empty map for empty watches array", () => {
    const map = buildRotationMap([], history);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it("handles single watch", () => {
    const map = buildRotationMap([watches[0]], history);
    expect(Object.keys(map)).toEqual(["w1"]);
  });
});
