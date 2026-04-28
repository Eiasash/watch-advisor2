import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({}),
  setCachedState: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue(undefined),
  getImage: vi.fn().mockResolvedValue(undefined),
}));

import { useTravelStore } from "../src/stores/travelStore.js";

function reset() {
  useTravelStore.setState({ trips: [] });
}

describe("travelStore", () => {
  beforeEach(reset);

  it("starts empty", () => {
    expect(useTravelStore.getState().trips).toEqual([]);
  });

  it("adds a trip with sensible defaults", () => {
    const id = useTravelStore.getState().addTrip({ destination: "Rome" });
    const trip = useTravelStore.getState().trips[0];
    expect(trip.id).toBe(id);
    expect(trip.destination).toBe("Rome");
    expect(trip.days).toBe(1);
    expect(trip.climate).toBe("temperate");
    expect(trip.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("respects supplied id", () => {
    useTravelStore.getState().addTrip({ id: "trip-fixed", destination: "Tokyo" });
    expect(useTravelStore.getState().trips[0].id).toBe("trip-fixed");
  });

  it("updates a trip", () => {
    const id = useTravelStore.getState().addTrip({ destination: "Rome" });
    useTravelStore.getState().updateTrip(id, { climate: "tropical" });
    expect(useTravelStore.getState().getTrip(id).climate).toBe("tropical");
  });

  it("removes a trip", () => {
    const id = useTravelStore.getState().addTrip({ destination: "Rome" });
    useTravelStore.getState().removeTrip(id);
    expect(useTravelStore.getState().trips).toEqual([]);
  });

  it("hydrate replaces trips list", () => {
    useTravelStore.getState().addTrip({ destination: "X" });
    useTravelStore.getState().hydrate({ trips: [{ id: "y", destination: "Y", days: 1, climate: "cold" }] });
    expect(useTravelStore.getState().trips).toHaveLength(1);
    expect(useTravelStore.getState().trips[0].id).toBe("y");
  });

  it("hydrate ignores garbage input", () => {
    useTravelStore.getState().addTrip({ destination: "X" });
    useTravelStore.getState().hydrate(null);
    useTravelStore.getState().hydrate({});
    useTravelStore.getState().hydrate({ trips: "not-an-array" });
    expect(useTravelStore.getState().trips).toHaveLength(1); // unchanged
  });

  it("serialise mirrors trips array", () => {
    useTravelStore.getState().addTrip({ destination: "X" });
    const ser = useTravelStore.getState().serialise();
    expect(ser.trips).toEqual(useTravelStore.getState().trips);
  });

  it("addTrip prepends — newest first", () => {
    useTravelStore.getState().addTrip({ id: "a", destination: "A" });
    useTravelStore.getState().addTrip({ id: "b", destination: "B" });
    expect(useTravelStore.getState().trips.map(t => t.id)).toEqual(["b", "a"]);
  });
});
