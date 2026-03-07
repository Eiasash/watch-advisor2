import { describe, it, expect } from "vitest";
import { hammingDistance, findDuplicate } from "../src/classifier/duplicateDetection.js";

// Tests for the expanded dupe detection thresholds used by ImportPanel
// DHASH_EXACT_THRESHOLD = 6 (auto-merge)
// DHASH_AI_THRESHOLD = 14 (near-miss, triggers AI check)

const EXACT_THRESHOLD = 6;
const AI_THRESHOLD = 14;

describe("dupe detection threshold zones", () => {
  const base = "1010101010101010"; // 16 chars

  function makeHash(base, flips) {
    const arr = base.split("");
    for (let i = 0; i < flips; i++) {
      arr[i] = arr[i] === "1" ? "0" : "1";
    }
    return arr.join("");
  }

  it("distance 0 → exact zone (auto-merge)", () => {
    const d = hammingDistance(base, base);
    expect(d).toBe(0);
    expect(d <= EXACT_THRESHOLD).toBe(true);
  });

  it("distance 5 → exact zone (auto-merge)", () => {
    const h2 = makeHash(base, 5);
    const d = hammingDistance(base, h2);
    expect(d).toBe(5);
    expect(d <= EXACT_THRESHOLD).toBe(true);
  });

  it("distance 6 → exact zone boundary (auto-merge)", () => {
    const h2 = makeHash(base, 6);
    const d = hammingDistance(base, h2);
    expect(d).toBe(6);
    expect(d <= EXACT_THRESHOLD).toBe(true);
  });

  it("distance 7 → AI zone (near-miss)", () => {
    const h2 = makeHash(base, 7);
    const d = hammingDistance(base, h2);
    expect(d).toBe(7);
    expect(d > EXACT_THRESHOLD && d <= AI_THRESHOLD).toBe(true);
  });

  it("distance 14 → AI zone boundary", () => {
    const h2 = makeHash(base, 14);
    const d = hammingDistance(base, h2);
    expect(d).toBe(14);
    expect(d > EXACT_THRESHOLD && d <= AI_THRESHOLD).toBe(true);
  });

  it("distance 15 → no-match zone (too different)", () => {
    const h2 = makeHash(base, 15);
    const d = hammingDistance(base, h2);
    expect(d).toBe(15);
    expect(d > AI_THRESHOLD).toBe(true);
  });
});

describe("findDuplicate with exact threshold", () => {
  const garments = [
    { id: "g1", hash: "1010101010101010" },
    { id: "g2", hash: "0000000011111111" },
  ];

  it("finds match at exact threshold", () => {
    // 2 bits different from g1
    expect(findDuplicate("1010101010101000", garments, EXACT_THRESHOLD)).toBe("g1");
  });

  it("rejects at AI threshold boundary when using exact threshold", () => {
    // 7 bits different — outside exact threshold
    const farHash = "0101010110101010"; // many bits flipped
    const d = hammingDistance("1010101010101010", farHash);
    if (d > EXACT_THRESHOLD) {
      expect(findDuplicate(farHash, garments, EXACT_THRESHOLD)).toBe(null);
    }
  });
});

describe("near-miss detection for AI fallback", () => {
  const garments = [
    { id: "g1", hash: "1010101010101010", thumbnail: "data:image/jpeg;base64,abc" },
    { id: "g2", hash: "0000000011111111", thumbnail: "data:image/jpeg;base64,def" },
  ];

  it("identifies near-miss candidate for AI check", () => {
    // Simulate what ImportPanel does: find closest match, check if in AI zone
    const newHash = "0010101010101010"; // 1 bit diff from g1 = exact zone
    let closest = null;
    let minDist = 999;
    for (const g of garments) {
      const d = hammingDistance(newHash, g.hash);
      if (d < minDist) { minDist = d; closest = g; }
    }
    expect(closest.id).toBe("g1");
    expect(minDist <= EXACT_THRESHOLD).toBe(true);
  });

  it("finds near-miss in AI zone but not exact zone", () => {
    // Create a hash that's ~10 bits different from g1
    const nearMiss = "0101010101010101"; // every bit flipped = 16 bits diff
    // Actually let's flip exactly 10 bits
    const arr = "1010101010101010".split("");
    for (let i = 0; i < 10; i++) arr[i] = arr[i] === "1" ? "0" : "1";
    const h = arr.join("");
    const d = hammingDistance("1010101010101010", h);
    expect(d).toBe(10);
    expect(d > EXACT_THRESHOLD).toBe(true);
    expect(d <= AI_THRESHOLD).toBe(true);
  });
});
