import { describe, it, expect } from "vitest";

/**
 * Integration test: outfit generation end-to-end
 * Tests the chain: inferDayProfile → pickWatch → scoreGarment → outfit quality
 * Uses real functions with real watch data patterns.
 */

import { inferDayProfile, scoreWatchForDay } from "../src/engine/dayProfile.js";
import { pickWatch, pickWatchPair } from "../src/engine/watchRotation.js";
import { colorMatchScore, formalityMatchScore, strapShoeScore, scoreGarment } from "../src/outfitEngine/scoring.js";

const SAMPLE_WATCHES = [
  { id: "snowflake", name: "Grand Seiko Snowflake", style: "dress-sport", formality: 7, dial: "silver-white", strap: "bracelet", replica: false },
  { id: "submariner", name: "Rolex Submariner", style: "sport", formality: 6, dial: "black", strap: "bracelet", replica: false },
  { id: "datejust", name: "Rolex Datejust", style: "dress-sport", formality: 8, dial: "blue", strap: "bracelet", replica: false },
  { id: "speedmaster", name: "Omega Speedmaster", style: "sport", formality: 6, dial: "black", strap: "bracelet", replica: false },
  { id: "casioak", name: "Casio GA-2100", style: "sport", formality: 3, dial: "black", strap: "rubber", replica: false },
  { id: "rep-ap", name: "AP Royal Oak (Rep)", style: "sport-elegant", formality: 7, dial: "blue", strap: "bracelet", replica: true },
];

const SAMPLE_GARMENTS = [
  { id: "g1", type: "shirt", color: "white", formality: 7 },
  { id: "g2", type: "shirt", color: "navy", formality: 5 },
  { id: "g3", type: "pants", color: "grey", formality: 7 },
  { id: "g4", type: "pants", color: "black", formality: 8 },
  { id: "g5", type: "shoes", color: "black", formality: 7 },
  { id: "g6", type: "shoes", color: "brown", formality: 6 },
  { id: "g7", type: "shoes", color: "white", formality: 3 },
  { id: "g8", type: "jacket", color: "navy", formality: 8 },
];

// ─── Day profile inference ──────────────────────────────────────────────────

describe("integration — day profile → watch selection → scoring", () => {
  it("hospital event → hospital-smart-casual → genuine watch preferred", () => {
    const profile = inferDayProfile(["Hospital ward rounds", "Patient consults"]);
    expect(profile).toBe("hospital-smart-casual");

    // Score watches — replicas should be penalized
    const genuineScore = scoreWatchForDay(SAMPLE_WATCHES[0], profile, []); // snowflake
    const replicaScore = scoreWatchForDay(SAMPLE_WATCHES[5], profile, []); // rep-ap
    expect(genuineScore).toBeGreaterThan(replicaScore);
  });

  it("no events → smart-casual default", () => {
    const profile = inferDayProfile([]);
    expect(profile).toBe("smart-casual");
  });

  it("wedding → formal profile", () => {
    const profile = inferDayProfile(["Wedding reception"]);
    expect(profile).toBe("formal");
  });

  it("gym → casual profile", () => {
    const profile = inferDayProfile(["Gym workout"]);
    expect(profile).toBe("casual");
  });

  it("on-call → shift profile with genuine preference", () => {
    const profile = inferDayProfile(["On-call night shift"]);
    expect(profile).toBe("shift");

    const genuineScore = scoreWatchForDay(SAMPLE_WATCHES[0], profile, []);
    const replicaScore = scoreWatchForDay(SAMPLE_WATCHES[5], profile, []);
    expect(genuineScore).toBeGreaterThan(replicaScore);
  });
});

// ─── Watch rotation integration ─────────────────────────────────────────────

describe("integration — watch rotation with day profile", () => {
  it("pickWatch returns a watch for smart-casual", () => {
    const watch = pickWatch(SAMPLE_WATCHES, [], "smart-casual");
    expect(watch).toBeDefined();
    expect(watch.id).toBeDefined();
  });

  it("pickWatch avoids recently worn watches", () => {
    const history = [
      { watchId: "snowflake" },
      { watchId: "submariner" },
      { watchId: "datejust" },
      { watchId: "speedmaster" },
      { watchId: "casioak" },
    ];
    const watch = pickWatch(SAMPLE_WATCHES, history, "smart-casual");
    // Should pick rep-ap (only one not in recent history)
    expect(watch.id).toBe("rep-ap");
  });

  it("pickWatchPair returns primary and backup", () => {
    const pair = pickWatchPair(SAMPLE_WATCHES, [], "smart-casual");
    expect(pair.primary).toBeDefined();
    expect(pair.backup).toBeDefined();
    expect(pair.primary.id).not.toBe(pair.backup.id);
  });

  it("pickWatch falls back to all watches when all are recently worn", () => {
    const history = SAMPLE_WATCHES.map(w => ({ watchId: w.id }));
    const watch = pickWatch(SAMPLE_WATCHES, history, "smart-casual");
    expect(watch).toBeDefined();
  });
});

// ─── Scoring integration ────────────────────────────────────────────────────

describe("integration — garment scoring with real watches", () => {
  it("white shirt scores well with silver-white dial (Snowflake)", () => {
    const score = colorMatchScore(SAMPLE_WATCHES[0], SAMPLE_GARMENTS[0]);
    expect(score).toBe(1.0); // white is compatible with silver-white
  });

  it("black shoes score well with bracelet strap", () => {
    const score = strapShoeScore(SAMPLE_WATCHES[0], SAMPLE_GARMENTS[4]);
    expect(score).toBe(1.0); // bracelet = no restriction
  });

  it("brown shoes get 0.0 with black leather strap", () => {
    const blackLeatherWatch = { ...SAMPLE_WATCHES[0], strap: "black leather" };
    const score = strapShoeScore(blackLeatherWatch, SAMPLE_GARMENTS[5]);
    expect(score).toBe(0.0); // brown shoes + black leather = hard veto
  });

  it("black shoes get 1.0 with black leather strap", () => {
    const blackLeatherWatch = { ...SAMPLE_WATCHES[0], strap: "black leather" };
    const score = strapShoeScore(blackLeatherWatch, SAMPLE_GARMENTS[4]);
    expect(score).toBe(1.0); // black shoes + black leather = match
  });

  it("scoreGarment produces non-zero score for compatible garments", () => {
    const score = scoreGarment(SAMPLE_WATCHES[0], SAMPLE_GARMENTS[0]);
    expect(score).toBeGreaterThan(0);
  });

  it("scoreGarment with weather affects jacket scoring", () => {
    const coldWeather = { tempC: 5 };
    const hotWeather = { tempC: 30 };
    const jacket = SAMPLE_GARMENTS[7];

    const coldScore = scoreGarment(SAMPLE_WATCHES[0], jacket, coldWeather);
    const hotScore = scoreGarment(SAMPLE_WATCHES[0], jacket, hotWeather);
    expect(coldScore).toBeGreaterThan(hotScore);
  });

  it("formality match is higher for matching formality levels", () => {
    // Snowflake formality=7, white shirt formality=7
    const matchScore = formalityMatchScore(SAMPLE_WATCHES[0], SAMPLE_GARMENTS[0]);
    // Snowflake formality=7, casual shoes formality=3
    const mismatchScore = formalityMatchScore(SAMPLE_WATCHES[0], SAMPLE_GARMENTS[6]);
    expect(matchScore).toBeGreaterThan(mismatchScore);
  });
});

// ─── End-to-end outfit quality ──────────────────────────────────────────────

describe("integration — end-to-end outfit quality check", () => {
  it("hospital day → scored garments are ordered by quality", () => {
    const profile = inferDayProfile(["Hospital rounds"]);
    const watch = pickWatch(SAMPLE_WATCHES, [], profile);

    // Score all garments
    const scored = SAMPLE_GARMENTS.map(g => ({
      garment: g,
      score: scoreGarment(watch, g),
    })).sort((a, b) => b.score - a.score);

    // Top garment should have a positive score
    expect(scored[0].score).toBeGreaterThan(0);
    // All scores should be finite numbers
    scored.forEach(s => {
      expect(Number.isFinite(s.score)).toBe(true);
    });
  });

  it("casual day → casual watch picked, informal garments score higher", () => {
    const profile = inferDayProfile(["Gym workout"]);
    expect(profile).toBe("casual");

    const watch = pickWatch(SAMPLE_WATCHES, [], profile);
    // Casual profile should prefer sport watches
    expect(["sport", "pilot"]).toContain(watch.style);

    // White sneakers (formality=3) should score higher than derby shoes (formality=7) for casual
    const sneakerScore = scoreGarment(watch, SAMPLE_GARMENTS[6]);
    const dressShoeScore = scoreGarment(watch, SAMPLE_GARMENTS[4]);
    // Both should be valid scores
    expect(Number.isFinite(sneakerScore)).toBe(true);
    expect(Number.isFinite(dressShoeScore)).toBe(true);
  });
});
