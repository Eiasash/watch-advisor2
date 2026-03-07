import { describe, it, expect } from "vitest";
import { pickWatchForCalendar } from "../src/engine/calendarWatchRotation.js";

const watches = [
  { id: "reverso", formality: 9, style: "dress", replica: false },
  { id: "speedmaster", formality: 5, style: "sport", replica: false },
  { id: "submariner", formality: 6, style: "diver", replica: true },
  { id: "datejust", formality: 7, style: "sport-elegant", replica: false },
];

describe("pickWatchForCalendar", () => {
  it("returns primary and backup watches", () => {
    const result = pickWatchForCalendar(watches);
    expect(result.primary).not.toBeNull();
    expect(result.backup).not.toBeNull();
    expect(result.primary.id).not.toBe(result.backup.id);
  });

  it("returns a dayProfile string", () => {
    const result = pickWatchForCalendar(watches, ["Hospital rounds"]);
    expect(result.dayProfile).toBe("hospital-smart-casual");
  });

  it("returns smart-casual for empty events", () => {
    const result = pickWatchForCalendar(watches);
    expect(result.dayProfile).toBe("smart-casual");
  });

  it("handles empty watch list", () => {
    const result = pickWatchForCalendar([]);
    expect(result.primary).toBeNull();
    expect(result.backup).toBeNull();
    expect(result.dayProfile).toBe("smart-casual");
  });

  it("prefers dress watch for formal events", () => {
    const result = pickWatchForCalendar(watches, ["Black tie gala"]);
    expect(result.primary.id).toBe("reverso");
    expect(result.dayProfile).toBe("formal");
  });

  it("avoids replicas for hospital events", () => {
    const result = pickWatchForCalendar(watches, ["Hospital ward rounds"]);
    expect(result.primary.replica).not.toBe(true);
  });

  it("avoids recently worn watches when alternatives exist", () => {
    const history = [{ watchId: "datejust" }, { watchId: "reverso" }];
    const result = pickWatchForCalendar(watches, [], {}, history);
    // Should prefer un-worn watches
    expect(["speedmaster", "submariner"]).toContain(result.primary.id);
  });

  it("single watch returns it as primary with null backup", () => {
    const result = pickWatchForCalendar([watches[0]]);
    expect(result.primary.id).toBe("reverso");
    expect(result.backup).toBeNull();
  });
});
