import { describe, it, expect } from "vitest";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

describe("watchSeed data integrity", () => {
  it("contains exactly 31 watches (14 active genuine + 1 pending + 11 replica + 5 retired)", () => {
    expect(WATCH_COLLECTION).toHaveLength(31);
  });

  it("has 14 active genuine watches (excludes pending)", () => {
    // `perception` (Atelier Wen N°25/50) received in hand 2026-06-03 → now active.
    // Fears Brunswick remains the only pending genuine piece.
    // Only "ready to wear" genuine pieces count as active.
    const genuine = WATCH_COLLECTION.filter(w => !w.replica && !w.retired && !w.perception && !w.pending);
    expect(genuine).toHaveLength(14);
  });

  it("has 11 replica watches", () => {
    const replicas = WATCH_COLLECTION.filter(w => w.replica);
    expect(replicas).toHaveLength(11);
  });

  it("has 5 retired watches", () => {
    const retired = WATCH_COLLECTION.filter(w => w.retired);
    expect(retired).toHaveLength(5);
  });

  it("all watches have unique IDs", () => {
    const ids = WATCH_COLLECTION.map(w => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all watches have required fields", () => {
    for (const watch of WATCH_COLLECTION) {
      expect(watch.id).toBeTruthy();
      expect(watch.brand).toBeTruthy();
      expect(watch.model).toBeTruthy();
      expect(watch.dial).toBeTruthy();
      expect(watch.strap).toBeTruthy();
      expect(typeof watch.formality).toBe("number");
      expect(watch.style).toBeTruthy();
    }
  });

  it("formality values are within range [1–10]", () => {
    for (const watch of WATCH_COLLECTION) {
      expect(watch.formality).toBeGreaterThanOrEqual(1);
      expect(watch.formality).toBeLessThanOrEqual(10);
    }
  });

  it("all watches have valid style values", () => {
    const validStyles = ["dress", "dress-sport", "sport", "sport-elegant", "diver", "field", "pilot"];
    for (const watch of WATCH_COLLECTION) {
      expect(validStyles).toContain(watch.style);
    }
  });

  it("all replica watches have ref: 'rep'", () => {
    const replicas = WATCH_COLLECTION.filter(w => w.replica);
    for (const watch of replicas) {
      expect(watch.ref).toBe("rep");
    }
  });

  it("watches with straps have valid strap entries", () => {
    const withStraps = WATCH_COLLECTION.filter(w => w.straps?.length);
    for (const watch of withStraps) {
      for (const strap of watch.straps) {
        expect(strap.id).toBeTruthy();
        expect(strap.label).toBeTruthy();
        expect(strap.color).toBeTruthy();
        expect(strap.type).toBeTruthy();
      }
    }
  });

  it("known watches exist: snowflake, reverso, speedmaster", () => {
    expect(WATCH_COLLECTION.find(w => w.id === "snowflake")).toBeDefined();
    expect(WATCH_COLLECTION.find(w => w.id === "reverso")).toBeDefined();
    expect(WATCH_COLLECTION.find(w => w.id === "speedmaster")).toBeDefined();
  });

  it("all strap IDs are unique across entire collection", () => {
    const strapIds = [];
    for (const watch of WATCH_COLLECTION) {
      if (watch.straps) {
        for (const s of watch.straps) strapIds.push(s.id);
      }
    }
    expect(new Set(strapIds).size).toBe(strapIds.length);
  });
});
