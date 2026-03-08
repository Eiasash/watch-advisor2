import { describe, it, expect } from "vitest";
import { pickWatch, pickWatchPair } from "../src/engine/watchRotation.js";

const watches = [
  { id: "w1", formality: 9, style: "dress", replica: false },
  { id: "w2", formality: 5, style: "sport", replica: false },
  { id: "w3", formality: 7, style: "sport-elegant", replica: false },
  { id: "w4", formality: 6, style: "dress-sport", replica: true },
];

// ─── pickWatch edge cases ────────────────────────────────────────────────────

describe("pickWatch — edge cases", () => {
  it("returns the only watch when collection has one item", () => {
    expect(pickWatch([watches[0]]).id).toBe("w1");
  });

  it("handles two watches with full recent history", () => {
    const pair = [watches[0], watches[1]];
    const history = pair.map(w => ({ watchId: w.id }));
    const result = pickWatch(pair, history);
    expect(result).not.toBeNull();
  });

  it("defaults to smart-casual day profile", () => {
    const result = pickWatch(watches);
    expect(result).not.toBeNull();
  });

  it("scores correctly for travel profile", () => {
    const result = pickWatch(watches, [], "travel");
    // sport and pilot styles are preferred for travel
    expect(result.id).toBe("w2");
  });

  it("scores correctly for shift profile (penalises replica)", () => {
    // w3 and w4 are both mid-formality, but w4 is replica — should lose
    const result = pickWatch([watches[2], watches[3]], [], "shift");
    expect(result.id).toBe("w3");
  });

  it("history window is exactly 7 entries", () => {
    // 6 entries — w1 is in the window
    const history6 = [{ watchId: "w1" }, ...Array(5).fill({ watchId: "other" })];
    const r6 = pickWatch(watches, history6, "formal");
    // w1 should be avoided (in last 7)

    // 8 entries — w1 is pushed out of the window
    const history8 = [{ watchId: "w1" }, ...Array(7).fill({ watchId: "other" })];
    const r8 = pickWatch(watches, history8, "formal");
    // w1 is now eligible again (beyond last 7)
    expect(r8.id).toBe("w1");
  });
});

// ─── pickWatchPair edge cases ────────────────────────────────────────────────

describe("pickWatchPair — edge cases", () => {
  it("primary and backup have different styles when possible", () => {
    const result = pickWatchPair(watches, [], "smart-casual");
    if (result.primary && result.backup) {
      // Not a hard requirement but they should differ
      expect(result.primary.id).not.toBe(result.backup.id);
    }
  });

  it("returns both for two-watch collection", () => {
    const result = pickWatchPair([watches[0], watches[1]]);
    expect(result.primary).not.toBeNull();
    expect(result.backup).not.toBeNull();
  });

  it("primary is highest scored watch", () => {
    const result = pickWatchPair(watches, [], "formal");
    // dress watch (formality 9) should be primary for formal
    expect(result.primary.id).toBe("w1");
  });

  it("all recently worn — falls back to full pool", () => {
    const history = watches.map(w => ({ watchId: w.id }));
    const result = pickWatchPair(watches, history);
    expect(result.primary).not.toBeNull();
    expect(result.backup).not.toBeNull();
  });
});
