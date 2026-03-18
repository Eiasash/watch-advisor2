import { describe, it, expect } from "vitest";
import { inferDayProfile, scoreWatchForDay, DAY_PROFILES } from "../src/engine/dayProfile.js";

// ─── inferDayProfile ────────────────────────────────────────────────────────

describe("inferDayProfile", () => {
  it("returns smart-casual for empty events", () => {
    expect(inferDayProfile([])).toBe("smart-casual");
  });

  it("returns smart-casual for undefined events", () => {
    expect(inferDayProfile()).toBe("smart-casual");
  });

  it("detects hospital-smart-casual from hospital keyword", () => {
    expect(inferDayProfile(["Hospital rounds 8am"])).toBe("hospital-smart-casual");
  });

  it("detects hospital-smart-casual from clinic keyword", () => {
    expect(inferDayProfile(["Clinic follow-up"])).toBe("hospital-smart-casual");
  });

  it("detects hospital-smart-casual from ward keyword", () => {
    expect(inferDayProfile(["Ward rounds"])).toBe("hospital-smart-casual");
  });

  it("detects formal from wedding keyword", () => {
    expect(inferDayProfile(["Wedding reception"])).toBe("formal");
  });

  it("detects formal from gala keyword", () => {
    expect(inferDayProfile(["Annual gala"])).toBe("formal");
  });

  it("detects formal from black tie keyword", () => {
    expect(inferDayProfile(["Black tie event"])).toBe("formal");
  });

  it("detects casual from gym keyword", () => {
    expect(inferDayProfile(["Gym session"])).toBe("casual");
  });

  it("detects travel from flight keyword", () => {
    expect(inferDayProfile(["Flight to London"])).toBe("travel");
  });

  it("detects shift from on-call keyword", () => {
    expect(inferDayProfile(["on-call tonight"])).toBe("shift");
  });

  it("hospital keyword takes priority over night shift", () => {
    // "hospital" matches hospital-smart-casual first since it's checked before shift
    expect(inferDayProfile(["Night shift at hospital"])).toBe("hospital-smart-casual");
  });

  it("detects shift from standalone night shift", () => {
    expect(inferDayProfile(["night shift tonight"])).toBe("shift");
  });

  it("is case-insensitive", () => {
    expect(inferDayProfile(["HOSPITAL ROUNDS"])).toBe("hospital-smart-casual");
  });

  it("scans across multiple events", () => {
    expect(inferDayProfile(["Lunch meeting", "Evening gala dinner"])).toBe("formal");
  });

  it("returns smart-casual for unrecognized events", () => {
    expect(inferDayProfile(["Grocery shopping", "Read a book"])).toBe("smart-casual");
  });
});

// ─── DAY_PROFILES constant ──────────────────────────────────────────────────

describe("DAY_PROFILES", () => {
  it("contains all expected profiles", () => {
    expect(DAY_PROFILES).toContain("hospital-smart-casual");
    expect(DAY_PROFILES).toContain("smart-casual");
    expect(DAY_PROFILES).toContain("formal");
    expect(DAY_PROFILES).toContain("casual");
    expect(DAY_PROFILES).toContain("travel");
    expect(DAY_PROFILES).toContain("shift");
  });

  it("has exactly 6 profiles", () => {
    expect(DAY_PROFILES).toHaveLength(6);
  });
});

// ─── scoreWatchForDay ───────────────────────────────────────────────────────

describe("scoreWatchForDay", () => {
  const dressWatch = { id: "reverso", formality: 9, style: "dress", replica: false };
  const sportWatch = { id: "speedmaster", formality: 5, style: "sport", replica: false };
  const replicaWatch = { id: "rep-sub", formality: 6, style: "diver", replica: true };

  it("returns a number between -1 and 2", () => {
    const score = scoreWatchForDay(dressWatch, "formal");
    expect(score).toBeGreaterThanOrEqual(-1);
    expect(score).toBeLessThanOrEqual(2);
  });

  it("scores dress watch higher for formal profile", () => {
    const dressScore = scoreWatchForDay(dressWatch, "formal");
    const sportScore = scoreWatchForDay(sportWatch, "formal");
    expect(dressScore).toBeGreaterThan(sportScore);
  });

  it("scores sport watch higher for casual profile", () => {
    const sportScore = scoreWatchForDay(sportWatch, "casual");
    const dressScore = scoreWatchForDay(dressWatch, "casual");
    expect(sportScore).toBeGreaterThan(dressScore);
  });

  it("penalises replica in hospital context", () => {
    const genuineScore = scoreWatchForDay({ ...replicaWatch, replica: false }, "hospital-smart-casual");
    const replicaScore = scoreWatchForDay(replicaWatch, "hospital-smart-casual");
    expect(genuineScore).toBeGreaterThan(replicaScore);
  });

  it("penalises replica in formal context", () => {
    const genuineScore = scoreWatchForDay({ ...replicaWatch, replica: false }, "formal");
    const replicaScore = scoreWatchForDay(replicaWatch, "formal");
    expect(genuineScore).toBeGreaterThan(replicaScore);
  });

  it("penalises replica in shift context", () => {
    const genuineScore = scoreWatchForDay({ ...replicaWatch, replica: false }, "shift");
    const replicaScore = scoreWatchForDay(replicaWatch, "shift");
    expect(genuineScore).toBeGreaterThan(replicaScore);
  });

  it("does not penalise replica in casual context", () => {
    const genuineScore = scoreWatchForDay({ ...replicaWatch, replica: false }, "casual");
    const replicaScore = scoreWatchForDay(replicaWatch, "casual");
    expect(genuineScore).toBe(replicaScore);
  });

  it("penalises recently worn watch", () => {
    const history = [{ watchId: "reverso" }];
    const freshScore = scoreWatchForDay(dressWatch, "formal", []);
    const wornScore = scoreWatchForDay(dressWatch, "formal", history);
    expect(freshScore).toBeGreaterThan(wornScore);
  });

  it("does not penalise watch worn more than 7 entries ago", () => {
    const history = Array.from({ length: 8 }, (_, i) => ({ watchId: `other-${i}` }));
    history.unshift({ watchId: "reverso" }); // oldest entry
    const score = scoreWatchForDay(dressWatch, "formal", history);
    const freshScore = scoreWatchForDay(dressWatch, "formal", []);
    expect(score).toBe(freshScore);
  });

  it("handles missing formality gracefully (defaults to 5)", () => {
    const noFormality = { id: "x", style: "sport", replica: false };
    const score = scoreWatchForDay(noFormality, "casual");
    expect(typeof score).toBe("number");
    expect(score).not.toBeNaN();
  });

  it("handles unknown profile gracefully", () => {
    const score = scoreWatchForDay(dressWatch, "nonexistent-profile");
    expect(typeof score).toBe("number");
    expect(score).not.toBeNaN();
  });
});

describe("scoreWatchForDay — pilot formality floor", () => {
  const laco = { id: "laco", brand: "Laco", model: "Flieger Type B", style: "pilot", formality: 5, replica: false };
  const hanhart = { id: "hanhart", brand: "Hanhart", model: "Pioneer Flyback", style: "pilot", formality: 6, replica: false };
  const speedmaster = { id: "speedmaster", brand: "Omega", model: "Speedmaster", style: "sport", formality: 7, replica: false };

  it("Laco (pilot, formality 5) scores 0 on shift — hard floor", () => {
    expect(scoreWatchForDay(laco, "shift")).toBe(0);
  });

  it("Laco scores 0 on hospital-smart-casual — hard floor", () => {
    expect(scoreWatchForDay(laco, "hospital-smart-casual")).toBe(0);
  });

  it("Laco scores 0 on formal — hard floor", () => {
    expect(scoreWatchForDay(laco, "formal")).toBe(0);
  });

  it("Laco scores > 0 on casual — pilot/field is appropriate", () => {
    expect(scoreWatchForDay(laco, "casual")).toBeGreaterThan(0);
  });

  it("Laco scores > 0 on smart-casual — no floor there", () => {
    expect(scoreWatchForDay(laco, "smart-casual")).toBeGreaterThan(0);
  });

  it("Hanhart (pilot, formality 6) is NOT blocked on shift — meets floor", () => {
    expect(scoreWatchForDay(hanhart, "shift")).toBeGreaterThan(0);
  });

  it("Speedmaster (sport, formality 7) beats Laco on shift", () => {
    const lacoScore = scoreWatchForDay(laco, "shift");
    const speedScore = scoreWatchForDay(speedmaster, "shift");
    expect(speedScore).toBeGreaterThan(lacoScore);
  });
});
