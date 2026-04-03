import { describe, it, expect, vi } from "vitest";

// Mock dependencies that pipeline.js imports but we don't need
vi.mock("../src/features/wardrobe/classifier.js", () => ({
  classify: vi.fn(),
  analyzeImageContent: vi.fn(),
}));
vi.mock("../src/services/imagePipeline.js", () => ({ processImage: vi.fn() }));
vi.mock("../src/services/photoQueue.js", () => ({ enqueueOriginalCache: vi.fn() }));
vi.mock("../src/classifier/normalizeType.js", () => ({ normalizeType: vi.fn(t => t) }));
vi.mock("../src/classifier/duplicateDetection.js", () => ({ findDuplicate: vi.fn() }));
vi.mock("../src/classifier/personFilter.js", () => ({ shouldExcludeAsOutfitPhoto: vi.fn() }));
vi.mock("../src/features/wardrobe/garmentNamer.js", () => ({ buildGarmentName: vi.fn() }));

import { normalizeAIColor } from "../src/classifier/pipeline.js";

describe("normalizeAIColor", () => {
  // ── Null / empty handling ────────────────────────────────────────────────

  it("returns null for null input", () => {
    expect(normalizeAIColor(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeAIColor(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeAIColor("")).toBeNull();
  });

  // ── Direct mappings ──────────────────────────────────────────────────────

  it("maps 'gray' → 'grey'", () => {
    expect(normalizeAIColor("gray")).toBe("grey");
  });

  it("maps 'dark brown' → 'brown'", () => {
    expect(normalizeAIColor("dark brown")).toBe("brown");
  });

  it("maps 'dark green' → 'olive'", () => {
    expect(normalizeAIColor("dark green")).toBe("olive");
  });

  it("maps 'dark navy' → 'navy'", () => {
    expect(normalizeAIColor("dark navy")).toBe("navy");
  });

  it("maps 'denim' → 'blue'", () => {
    expect(normalizeAIColor("denim")).toBe("blue");
  });

  it("maps 'light blue' → 'blue'", () => {
    expect(normalizeAIColor("light blue")).toBe("blue");
  });

  it("maps 'ecru' → 'cream'", () => {
    expect(normalizeAIColor("ecru")).toBe("cream");
  });

  it("maps 'ivory' → 'cream'", () => {
    expect(normalizeAIColor("ivory")).toBe("cream");
  });

  it("maps 'camel' → 'tan'", () => {
    expect(normalizeAIColor("camel")).toBe("tan");
  });

  it("maps 'sand' → 'tan'", () => {
    expect(normalizeAIColor("sand")).toBe("tan");
  });

  it("maps 'taupe' → 'tan'", () => {
    expect(normalizeAIColor("taupe")).toBe("tan");
  });

  it("maps 'cognac' → 'brown'", () => {
    expect(normalizeAIColor("cognac")).toBe("brown");
  });

  it("maps 'rust' → 'brown'", () => {
    expect(normalizeAIColor("rust")).toBe("brown");
  });

  it("maps 'maroon' → 'burgundy'", () => {
    expect(normalizeAIColor("maroon")).toBe("burgundy");
  });

  it("maps 'wine' → 'burgundy'", () => {
    expect(normalizeAIColor("wine")).toBe("burgundy");
  });

  it("maps 'sage' → 'olive'", () => {
    expect(normalizeAIColor("sage")).toBe("olive");
  });

  it("maps 'mint' → 'green'", () => {
    expect(normalizeAIColor("mint")).toBe("green");
  });

  it("maps 'gold' → 'tan'", () => {
    expect(normalizeAIColor("gold")).toBe("tan");
  });

  it("maps 'silver' → 'grey'", () => {
    expect(normalizeAIColor("silver")).toBe("grey");
  });

  it("maps 'coral' → 'red'", () => {
    expect(normalizeAIColor("coral")).toBe("red");
  });

  it("maps 'pink' → 'red'", () => {
    expect(normalizeAIColor("pink")).toBe("red");
  });

  it("maps 'orange' → 'red'", () => {
    expect(normalizeAIColor("orange")).toBe("red");
  });

  it("maps 'lavender' → 'grey'", () => {
    expect(normalizeAIColor("lavender")).toBe("grey");
  });

  it("maps 'yellow' → 'cream'", () => {
    expect(normalizeAIColor("yellow")).toBe("cream");
  });

  it("maps 'multicolor' → 'grey'", () => {
    expect(normalizeAIColor("multicolor")).toBe("grey");
  });

  // ── Canonical pass-through ───────────────────────────────────────────────

  it("passes through 'black' as-is", () => {
    expect(normalizeAIColor("black")).toBe("black");
  });

  it("passes through 'white' as-is", () => {
    expect(normalizeAIColor("white")).toBe("white");
  });

  it("passes through 'navy' as-is", () => {
    expect(normalizeAIColor("navy")).toBe("navy");
  });

  it("passes through 'brown' as-is", () => {
    expect(normalizeAIColor("brown")).toBe("brown");
  });

  it("passes through 'olive' as-is", () => {
    expect(normalizeAIColor("olive")).toBe("olive");
  });

  it("passes through 'burgundy' as-is", () => {
    expect(normalizeAIColor("burgundy")).toBe("burgundy");
  });

  it("passes through 'teal' as-is", () => {
    expect(normalizeAIColor("teal")).toBe("teal");
  });

  it("passes through 'khaki' as-is", () => {
    expect(normalizeAIColor("khaki")).toBe("khaki");
  });

  // ── Case insensitivity ───────────────────────────────────────────────────

  it("handles uppercase input", () => {
    expect(normalizeAIColor("GRAY")).toBe("grey");
  });

  it("handles mixed case input", () => {
    expect(normalizeAIColor("Dark Brown")).toBe("brown");
  });

  it("handles input with leading/trailing whitespace", () => {
    expect(normalizeAIColor("  sage  ")).toBe("olive");
  });

  // ── Unknown colors pass through as lowercase ─────────────────────────────

  it("passes through unknown color as lowercase", () => {
    expect(normalizeAIColor("chartreuse")).toBe("chartreuse");
  });

  it("passes through unrecognized color preserving lowercase", () => {
    expect(normalizeAIColor("NEON GREEN")).toBe("neon green");
  });
});
