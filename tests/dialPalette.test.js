import { describe, it, expect } from "vitest";
import { paletteForWatch, composeWhy } from "../src/features/editorial/dialPalette.js";

describe("dialPalette", () => {
  describe("paletteForWatch", () => {
    it("returns fallback for null watch", () => {
      const p = paletteForWatch(null);
      expect(p.bg).toBeDefined();
      expect(p.accent).toBeDefined();
      expect(p.ink).toBeDefined();
    });

    it("returns palette by dial color", () => {
      const p = paletteForWatch({ dial: "green" });
      expect(p.mood).toBe("verdant");
    });

    it("uses sideA for dual-dial watches (Reverso)", () => {
      const p = paletteForWatch({
        dial: "navy",
        dualDial: { sideA: "green", sideB: "white" },
      });
      expect(p.mood).toBe("verdant"); // green sideA
    });

    it("falls back when dial unknown", () => {
      const p = paletteForWatch({ dial: "fuchsia-glitter" });
      expect(p.mood).toBe("classic");
    });

    it("uses dialColor as fallback to dial", () => {
      const p = paletteForWatch({ dialColor: "navy" });
      expect(p.mood).toBe("midnight");
    });

    it("returns hex colors", () => {
      const p = paletteForWatch({ dial: "blue" });
      expect(p.bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.ink).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe("composeWhy", () => {
    it("returns generic copy for null watch", () => {
      const s = composeWhy(null);
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(0);
    });

    it("uses cold opener under 8°C", () => {
      const s = composeWhy({ style: "dress" }, { tempC: 2 });
      expect(s.toLowerCase()).toMatch(/cold/);
    });

    it("uses warm opener over 22°C", () => {
      const s = composeWhy({ style: "sport" }, { tempC: 27 });
      expect(s.toLowerCase()).toMatch(/warm/);
    });

    it("uses bright sun copy over 28°C", () => {
      const s = composeWhy({ style: "sport" }, { tempC: 32 });
      expect(s.toLowerCase()).toMatch(/sun/);
    });

    it("mentions rain when description includes rain", () => {
      const s = composeWhy({ style: "sport" }, { tempC: 12, description: "Light rain" });
      expect(s.toLowerCase()).toMatch(/rain/);
    });

    it("style-led middle clause for dress watch", () => {
      const s = composeWhy({ style: "dress" }, { tempC: 18 });
      expect(s.toLowerCase()).toMatch(/dress code/);
    });

    it("style-led middle clause for sport watch", () => {
      const s = composeWhy({ style: "sport" }, { tempC: 18 });
      expect(s.toLowerCase()).toMatch(/tool/);
    });

    it("appends formal context tail", () => {
      const s = composeWhy({ style: "dress" }, { tempC: 18 }, "formal");
      expect(s.toLowerCase()).toMatch(/formal hours/);
    });

    it("appends clinic context tail", () => {
      const s = composeWhy({ style: "dress-sport" }, { tempC: 18 }, "clinic");
      expect(s.toLowerCase()).toMatch(/clinic-ready/);
    });

    it("handles missing weather gracefully", () => {
      const s = composeWhy({ style: "sport" });
      expect(s.toLowerCase()).toMatch(/today/);
    });
  });
});
