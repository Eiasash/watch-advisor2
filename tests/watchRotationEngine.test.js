import { describe, it, expect } from "vitest";
import { pickWatch, pickWatchPair } from "../src/engine/watchRotation.js";

const watches = [
  { id: "reverso", formality: 9, style: "dress", replica: false },
  { id: "speedmaster", formality: 5, style: "sport", replica: false },
  { id: "datejust", formality: 7, style: "sport-elegant", replica: false },
];

// ─── pickWatch ──────────────────────────────────────────────────────────────

describe("pickWatch", () => {
  it("returns a watch from the collection", () => {
    const result = pickWatch(watches);
    expect(watches.map(w => w.id)).toContain(result.id);
  });

  it("returns null for empty collection", () => {
    expect(pickWatch([])).toBeNull();
  });

  it("avoids recently worn watches", () => {
    const history = [
      { watchId: "reverso" },
      { watchId: "speedmaster" },
    ];
    const result = pickWatch(watches, history);
    expect(result.id).toBe("datejust");
  });

  it("falls back to all watches when all recently worn", () => {
    const history = watches.map(w => ({ watchId: w.id }));
    const result = pickWatch(watches, history);
    expect(result).not.toBeNull();
  });

  it("considers day profile for scoring", () => {
    const result = pickWatch(watches, [], "formal");
    expect(result.id).toBe("reverso");
  });
});

// ─── pickWatchPair ──────────────────────────────────────────────────────────

describe("pickWatchPair", () => {
  it("returns primary and backup", () => {
    const result = pickWatchPair(watches);
    expect(result.primary).not.toBeNull();
    expect(result.backup).not.toBeNull();
    expect(result.primary.id).not.toBe(result.backup.id);
  });

  it("returns null for empty collection", () => {
    const result = pickWatchPair([]);
    expect(result.primary).toBeNull();
    expect(result.backup).toBeNull();
  });

  it("returns null backup for single watch", () => {
    const result = pickWatchPair([watches[0]]);
    expect(result.primary).not.toBeNull();
    expect(result.backup).toBeNull();
  });

  it("avoids recently worn watches", () => {
    const history = [{ watchId: "reverso" }];
    const result = pickWatchPair(watches, history);
    expect(result.primary.id).not.toBe("reverso");
  });
});
