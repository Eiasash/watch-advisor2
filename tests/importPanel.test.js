import { describe, it, expect } from "vitest";

// ── Replicated pure functions from ImportPanel.jsx ──────────────────────────

const MAX_ANGLES = 4;
const DHASH_EXACT_THRESHOLD = 6;
const DHASH_AI_THRESHOLD = 14;

/** dHash Hamming distance — compare two 64-bit hex strings */
function hammingDist(a, b) {
  if (!a || !b || a.length !== b.length) return 999;
  let dist = 0;
  for (let i = 0; i < a.length; i += 2) {
    const diff = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    for (let x = diff; x; x &= x - 1) dist++;
  }
  return dist;
}

/** Group batch items: if Hamming ≤ 8, second is angle of first primary */
function groupByAngles(items) {
  const groups = [];
  const assigned = new Set();
  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;
    const group = { primary: items[i], angles: [] };
    assigned.add(i);
    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;
      if (hammingDist(items[i].hash, items[j].hash) <= 8) {
        group.angles.push(items[j]);
        assigned.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

// ── hammingDist tests ─────────────────────────────────────────────────────────

describe("ImportPanel — hammingDist", () => {
  it("returns 0 for identical hashes", () => {
    expect(hammingDist("ff00ff00", "ff00ff00")).toBe(0);
  });

  it("returns correct distance for 1-bit difference", () => {
    expect(hammingDist("ff00ff00", "ff00ff01")).toBe(1);
  });

  it("returns correct distance for all-different bytes", () => {
    // 0x00 vs 0xff = 8 bits per byte, 4 bytes = 32 bits
    expect(hammingDist("00000000", "ffffffff")).toBe(32);
  });

  it("returns 999 for null/undefined inputs", () => {
    expect(hammingDist(null, "ff00")).toBe(999);
    expect(hammingDist("ff00", null)).toBe(999);
    expect(hammingDist(null, null)).toBe(999);
    expect(hammingDist(undefined, "ff00")).toBe(999);
  });

  it("returns 999 for empty strings", () => {
    expect(hammingDist("", "")).toBe(999);
    expect(hammingDist("ff", "")).toBe(999);
  });

  it("returns 999 for mismatched lengths", () => {
    expect(hammingDist("ff00", "ff00ff00")).toBe(999);
  });

  it("handles 64-bit (16 hex char) hashes", () => {
    const a = "0000000000000000";
    const b = "0000000000000001"; // 1 bit
    expect(hammingDist(a, b)).toBe(1);
  });

  it("boundary: distance exactly at DHASH_EXACT_THRESHOLD (6)", () => {
    // Build two hashes that differ by exactly 6 bits
    // 0x3f = 00111111 → 6 bits set, 0x00 padded
    const a = "00000000";
    const b = "3f000000"; // 6 bits in first byte
    expect(hammingDist(a, b)).toBe(6);
    expect(hammingDist(a, b) <= DHASH_EXACT_THRESHOLD).toBe(true);
  });
});

// ── groupByAngles tests ───────────────────────────────────────────────────────

describe("ImportPanel — groupByAngles", () => {
  it("returns empty array for empty input", () => {
    expect(groupByAngles([])).toEqual([]);
  });

  it("single item → one group with no angles", () => {
    const items = [{ id: "a", hash: "ff00ff00" }];
    const groups = groupByAngles(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].primary.id).toBe("a");
    expect(groups[0].angles).toHaveLength(0);
  });

  it("two identical hashes → grouped as primary + angle", () => {
    const items = [
      { id: "a", hash: "ff00ff00" },
      { id: "b", hash: "ff00ff00" },
    ];
    const groups = groupByAngles(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].primary.id).toBe("a");
    expect(groups[0].angles).toHaveLength(1);
    expect(groups[0].angles[0].id).toBe("b");
  });

  it("very different hashes → separate groups", () => {
    const items = [
      { id: "a", hash: "00000000" },
      { id: "b", hash: "ffffffff" }, // distance 32
    ];
    const groups = groupByAngles(items);
    expect(groups).toHaveLength(2);
  });

  it("three items: two similar + one different", () => {
    const items = [
      { id: "a", hash: "ff00ff00" },
      { id: "b", hash: "ff00ff01" }, // dist 1 from a → same group
      { id: "c", hash: "00ff00ff" }, // very different
    ];
    const groups = groupByAngles(items);
    expect(groups).toHaveLength(2);
    expect(groups[0].angles).toHaveLength(1);
    expect(groups[1].angles).toHaveLength(0);
  });

  it("items without hashes remain as separate groups", () => {
    const items = [
      { id: "a", hash: null },
      { id: "b", hash: null },
    ];
    const groups = groupByAngles(items);
    // hammingDist(null, null) = 999 > 8, so no grouping
    expect(groups).toHaveLength(2);
  });

  it("grouping threshold is 8 (distance > 8 → separate)", () => {
    // 0x01ff = 0000 0001 1111 1111 → 9 bits set
    const items = [
      { id: "a", hash: "00000000" },
      { id: "b", hash: "ff010000" }, // distance = 9 > 8
    ];
    const groups = groupByAngles(items);
    expect(groups).toHaveLength(2);
  });
});

// ── Constants tests ───────────────────────────────────────────────────────────

describe("ImportPanel — constants", () => {
  it("MAX_ANGLES is 4", () => {
    expect(MAX_ANGLES).toBe(4);
  });

  it("DHASH_EXACT_THRESHOLD is 6", () => {
    expect(DHASH_EXACT_THRESHOLD).toBe(6);
  });

  it("DHASH_AI_THRESHOLD is 14", () => {
    expect(DHASH_AI_THRESHOLD).toBe(14);
  });

  it("AI threshold > exact threshold (near-miss range exists)", () => {
    expect(DHASH_AI_THRESHOLD).toBeGreaterThan(DHASH_EXACT_THRESHOLD);
  });
});
