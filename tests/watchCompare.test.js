import { describe, it, expect } from "vitest";

// ── Replicated constants from WatchCompare.jsx ──────────────────────────────

const DIAL_SWATCH = {
  "silver-white": "#e8e8e0", "green": "#3d6b45", "grey": "#8a8a8a",
  "blue": "#2d5fa0", "navy": "#1e2f5e", "white": "#f0ede8",
  "black-red": "#1a1a1a", "black": "#1a1a1a", "white-teal": "#4da89c",
};

const FIELDS = [
  { key: "brand", label: "Brand" },
  { key: "model", label: "Model" },
  { key: "ref", label: "Reference" },
  { key: "dial", label: "Dial" },
  { key: "strap", label: "Strap" },
  { key: "style", label: "Style" },
  { key: "formality", label: "Formality", fmt: v => `${v}/10` },
  { key: "size", label: "Case Size", fmt: v => v ? `${v}mm` : "\u2014" },
  { key: "lug", label: "Lug-to-Lug", fmt: v => v ? `${v}mm` : "\u2014" },
];

// ── DIAL_SWATCH ─────────────────────────────────────────────────────────────

describe("WatchCompare — DIAL_SWATCH", () => {
  it("contains all expected dial colors", () => {
    const keys = Object.keys(DIAL_SWATCH);
    expect(keys).toContain("silver-white");
    expect(keys).toContain("green");
    expect(keys).toContain("grey");
    expect(keys).toContain("blue");
    expect(keys).toContain("navy");
    expect(keys).toContain("white");
    expect(keys).toContain("black-red");
    expect(keys).toContain("black");
    expect(keys).toContain("white-teal");
  });

  it("all values are valid hex color strings", () => {
    for (const [, hex] of Object.entries(DIAL_SWATCH)) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

// ── FIELDS ──────────────────────────────────────────────────────────────────

describe("WatchCompare — FIELDS", () => {
  it("has 9 comparison fields", () => {
    expect(FIELDS).toHaveLength(9);
  });

  it("includes all expected field keys", () => {
    const keys = FIELDS.map(f => f.key);
    expect(keys).toEqual(["brand", "model", "ref", "dial", "strap", "style", "formality", "size", "lug"]);
  });

  it("formality fmt formats correctly", () => {
    const formality = FIELDS.find(f => f.key === "formality");
    expect(formality.fmt(7)).toBe("7/10");
    expect(formality.fmt(10)).toBe("10/10");
  });

  it("size fmt formats with mm suffix", () => {
    const size = FIELDS.find(f => f.key === "size");
    expect(size.fmt(42)).toBe("42mm");
    expect(size.fmt(null)).toBe("\u2014");
    expect(size.fmt(0)).toBe("\u2014");
  });

  it("lug fmt formats with mm suffix", () => {
    const lug = FIELDS.find(f => f.key === "lug");
    expect(lug.fmt(48)).toBe("48mm");
    expect(lug.fmt(null)).toBe("\u2014");
    expect(lug.fmt(0)).toBe("\u2014");
  });

  it("fields without fmt use raw value", () => {
    const brand = FIELDS.find(f => f.key === "brand");
    expect(brand.fmt).toBeUndefined();
  });
});
