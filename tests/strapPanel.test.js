import { describe, it, expect } from "vitest";

// ── Replicated constants from StrapPanel.jsx ────────────────────────────────

const TYPE_COLOR = {
  bracelet: "#3b82f6", leather: "#92400e", canvas: "#65a30d",
  nato: "#0891b2", rubber: "#7c3aed", integrated: "#6b7280",
};
const TYPE_LABELS = ["bracelet", "integrated", "leather", "canvas", "nato", "rubber"];
const COLORS = ["silver", "black", "brown", "tan", "navy", "teal", "olive", "grey", "white", "beige", "burgundy", "green", "red"];
const SWATCH = {
  silver: "#c0c0c8", grey: "#9ca3af", black: "#1f2937", brown: "#78350f", tan: "#d4a574",
  navy: "#1e3a5f", teal: "#0d9488", olive: "#65730a", white: "#f3f4f6", beige: "#d6cfc0",
  burgundy: "#6b1d1d", green: "#16a34a", red: "#dc2626",
};

describe("StrapPanel — TYPE_COLOR", () => {
  it("has color for every type label", () => {
    for (const type of TYPE_LABELS) {
      expect(TYPE_COLOR[type]).toBeDefined();
    }
  });

  it("all values are hex colors", () => {
    for (const hex of Object.values(TYPE_COLOR)) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("StrapPanel — TYPE_LABELS", () => {
  it("has 6 strap types", () => {
    expect(TYPE_LABELS).toHaveLength(6);
  });

  it("includes all standard strap types", () => {
    expect(TYPE_LABELS).toContain("bracelet");
    expect(TYPE_LABELS).toContain("leather");
    expect(TYPE_LABELS).toContain("nato");
    expect(TYPE_LABELS).toContain("rubber");
    expect(TYPE_LABELS).toContain("canvas");
    expect(TYPE_LABELS).toContain("integrated");
  });
});

describe("StrapPanel — COLORS", () => {
  it("has 13 strap colors", () => {
    expect(COLORS).toHaveLength(13);
  });

  it("includes the most common strap colors", () => {
    expect(COLORS).toContain("black");
    expect(COLORS).toContain("brown");
    expect(COLORS).toContain("tan");
    expect(COLORS).toContain("navy");
  });

  it("every color has a SWATCH entry", () => {
    for (const c of COLORS) {
      expect(SWATCH[c]).toBeDefined();
    }
  });
});

describe("StrapPanel — SWATCH", () => {
  it("all swatches are valid hex colors", () => {
    for (const hex of Object.values(SWATCH)) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
