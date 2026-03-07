import { describe, it, expect } from "vitest";
import { buildGarmentName } from "../src/features/wardrobe/garmentNamer.js";

// ─── Descriptive filenames pass through ──────────────────────────────────────

describe("buildGarmentName — descriptive filenames", () => {
  it("returns humanized name for descriptive filename", () => {
    expect(buildGarmentName("navy-polo-shirt.jpg", "shirt", "navy")).toBe("navy polo shirt");
  });

  it("replaces underscores with spaces", () => {
    expect(buildGarmentName("brown_leather_boots.jpg", "shoes", "brown")).toBe("brown leather boots");
  });

  it("does not pass through very short names (<=2 chars)", () => {
    const result = buildGarmentName("ab.jpg", "shirt", "blue");
    expect(result).not.toBe("ab");
  });

  it("does not pass through very long names (>=60 chars)", () => {
    const longName = "a".repeat(61) + ".jpg";
    const result = buildGarmentName(longName, "shirt", "blue");
    // Should generate from classification, not pass through
    expect(result.length).toBeLessThan(61);
  });
});

// ─── Camera roll filenames → generated names ────────────────────────────────

describe("buildGarmentName — camera roll patterns", () => {
  it("IMG_1234 → builds from type and color", () => {
    expect(buildGarmentName("IMG_1234.jpg", "shirt", "navy")).toBe("Navy shirt");
  });

  it("DSC_5678 → builds from type and color", () => {
    expect(buildGarmentName("DSC_5678.jpg", "pants", "grey")).toBe("Pants");
  });

  it("PXL_20260101 → builds from type and color", () => {
    expect(buildGarmentName("PXL_20260101.jpg", "shoes", "brown")).toBe("Brown shoes");
  });

  it("PHOTO_999 → builds from type", () => {
    expect(buildGarmentName("PHOTO_999.jpg", "jacket", "black")).toBe("Black jacket");
  });

  it("screenshot_12345 → builds from type", () => {
    expect(buildGarmentName("screenshot_12345.png", "sweater", "olive")).toBe("Olive sweater");
  });

  it("cam1234 → camera pattern detected", () => {
    expect(buildGarmentName("cam1234.jpg", "shirt", "white")).toBe("White shirt");
  });
});

// ─── Grey color is excluded ─────────────────────────────────────────────────

describe("buildGarmentName — grey suppression", () => {
  it("grey color is excluded from name", () => {
    expect(buildGarmentName("IMG_1234.jpg", "pants", "grey")).toBe("Pants");
  });
});

// ─── Subtype detection from filename ────────────────────────────────────────

describe("buildGarmentName — subtype from filename", () => {
  it("detects sneakers subtype", () => {
    expect(buildGarmentName("IMG_1234_sneakers.jpg", "shoes", "white")).toBe("White sneakers");
  });

  it("detects chinos subtype", () => {
    expect(buildGarmentName("IMG_1234_chino.jpg", "pants", "khaki")).toBe("Khaki chinos");
  });

  it("detects blazer subtype", () => {
    expect(buildGarmentName("IMG_1234_blazer.jpg", "jacket", "navy")).toBe("Navy blazer");
  });

  it("detects polo subtype", () => {
    expect(buildGarmentName("IMG_1234_polo.jpg", "shirt", "blue")).toBe("Blue polo");
  });

  it("detects boots subtype", () => {
    expect(buildGarmentName("IMG_1234_boots.jpg", "shoes", "brown")).toBe("Brown boots");
  });

  it("detects jeans subtype", () => {
    expect(buildGarmentName("IMG_1234_jeans.jpg", "pants", "blue")).toBe("Blue jeans");
  });

  it("detects hoodie subtype", () => {
    expect(buildGarmentName("IMG_1234_hoodie.jpg", "jacket", "grey")).toBe("Hoodie");
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("buildGarmentName — edge cases", () => {
  it("null color → type only", () => {
    expect(buildGarmentName("IMG_1234.jpg", "shirt", null)).toBe("Shirt");
  });

  it("empty color → type only", () => {
    expect(buildGarmentName("IMG_1234.jpg", "shoes", "")).toBe("Shoes");
  });

  it("unknown type → garment fallback", () => {
    expect(buildGarmentName("IMG_1234.jpg", undefined, "blue")).toBe("Blue garment");
  });

  it("no type no color → Garment", () => {
    expect(buildGarmentName("IMG_1234.jpg", undefined, null)).toBe("Garment");
  });

  it("capitalises first letter", () => {
    const result = buildGarmentName("IMG_1234.jpg", "shirt", "navy");
    expect(result[0]).toBe("N");
  });
});
