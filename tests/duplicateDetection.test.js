import { describe, it, expect } from "vitest";
import { hammingDistance, findDuplicate } from "../src/classifier/duplicateDetection.js";

// ─── hammingDistance ─────────────────────────────────────────────────────────

describe("hammingDistance", () => {
  it("identical hashes → 0", () => {
    expect(hammingDistance("10101010", "10101010")).toBe(0);
  });

  it("completely different hashes → full length", () => {
    expect(hammingDistance("0000", "1111")).toBe(4);
  });

  it("single-bit difference → 1", () => {
    expect(hammingDistance("10101010", "10101011")).toBe(1);
  });

  it("returns 999 for null first arg", () => {
    expect(hammingDistance(null, "10101010")).toBe(999);
  });

  it("returns 999 for null second arg", () => {
    expect(hammingDistance("10101010", null)).toBe(999);
  });

  it("returns 999 for undefined args", () => {
    expect(hammingDistance(undefined, undefined)).toBe(999);
  });

  it("returns 999 for empty strings", () => {
    expect(hammingDistance("", "")).toBe(999);
  });

  it("returns 999 for mismatched lengths", () => {
    expect(hammingDistance("1010", "10101010")).toBe(999);
  });

  it("handles 64-char dHash strings", () => {
    const h1 = "1".repeat(64);
    const h2 = "1".repeat(60) + "0000";
    expect(hammingDistance(h1, h2)).toBe(4);
  });
});

// ─── findDuplicate ───────────────────────────────────────────────────────────

describe("findDuplicate", () => {
  const garments = [
    { id: "g1", hash: "1010101010101010" },
    { id: "g2", hash: "0000000011111111" },
    { id: "g3", hash: "1111111100000000" },
  ];

  it("finds exact duplicate (distance 0)", () => {
    expect(findDuplicate("1010101010101010", garments)).toBe("g1");
  });

  it("finds near-duplicate within threshold", () => {
    // 2 bits different from g1
    expect(findDuplicate("1010101010101000", garments)).toBe("g1");
  });

  it("returns null when no match within threshold", () => {
    expect(findDuplicate("1111111111111111", garments)).toBe(null);
  });

  it("returns null for null hash", () => {
    expect(findDuplicate(null, garments)).toBe(null);
  });

  it("returns null for short hash (<8 chars)", () => {
    expect(findDuplicate("1010", garments)).toBe(null);
  });

  it("returns null for empty garments array", () => {
    expect(findDuplicate("1010101010101010", [])).toBe(null);
  });

  it("skips garments without hash", () => {
    const partial = [{ id: "g1" }, { id: "g2", hash: "1010101010101010" }];
    expect(findDuplicate("1010101010101010", partial)).toBe("g2");
  });

  it("respects custom threshold", () => {
    // "1010101010100000" differs from g1 "1010101010101010" by 3 chars (positions 12,14 differ: 1→0, 1→0; pos 13: 0→0 same; pos 15: 0→0 same)
    // Actually count: pos 12: 1→0, pos 13: 0→0, pos 14: 1→0, pos 15: 0→0 → distance=2
    // threshold=1 → no match
    expect(findDuplicate("1010101010100000", garments, 1)).toBe(null);
    // threshold=2 → match
    expect(findDuplicate("1010101010100000", garments, 2)).toBe("g1");
  });

  it("returns first match when multiple qualify", () => {
    const similar = [
      { id: "a", hash: "1010101010101010" },
      { id: "b", hash: "1010101010101010" },
    ];
    expect(findDuplicate("1010101010101010", similar)).toBe("a");
  });
});
