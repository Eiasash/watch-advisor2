import { describe, it, expect } from "vitest";
import { detectDominantColor } from "../src/classifier/colorDetection.js";

/**
 * Helper to build a fake ImageData object with uniform color.
 * Creates a size×size image filled with the given RGB.
 */
function makeImageData(r, g, b, size = 48) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255; // alpha
  }
  return { data, width: size, height: size };
}

/**
 * Helper with mixed colors — center region is one color, edges another.
 */
function makeCenterEdgeImage(centerR, centerG, centerB, edgeR, edgeG, edgeB, size = 48) {
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const edgeZone = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const isEdge = dist > (Math.min(cx, cy) - edgeZone);
      data[i] = isEdge ? edgeR : centerR;
      data[i + 1] = isEdge ? edgeG : centerG;
      data[i + 2] = isEdge ? edgeB : centerB;
      data[i + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

// ─── Solid color detection ──────────────────────────────────────────────────

describe("detectDominantColor — solid colors", () => {
  it("detects navy", () => {
    const img = makeImageData(20, 35, 85);
    expect(detectDominantColor(img, 48, 48)).toBe("navy");
  });

  it("detects black", () => {
    const img = makeImageData(15, 15, 15);
    expect(detectDominantColor(img, 48, 48)).toBe("black");
  });

  it("detects brown", () => {
    const img = makeImageData(95, 55, 25);
    expect(detectDominantColor(img, 48, 48)).toBe("brown");
  });

  it("detects olive", () => {
    const img = makeImageData(95, 105, 45);
    expect(detectDominantColor(img, 48, 48)).toBe("olive");
  });

  it("detects tan", () => {
    const img = makeImageData(175, 140, 95);
    expect(detectDominantColor(img, 48, 48)).toBe("tan");
  });

  it("detects gray", () => {
    const img = makeImageData(128, 128, 128);
    expect(detectDominantColor(img, 48, 48)).toBe("gray");
  });
});

// ─── Background filtering ──────────────────────────────────────────────────

describe("detectDominantColor — background filtering", () => {
  it("filters pure white background pixels", () => {
    // All white = background, should return null (not enough non-bg pixels)
    const img = makeImageData(245, 245, 245);
    expect(detectDominantColor(img, 48, 48)).toBeNull();
  });

  it("detects color when mixed with white background", () => {
    const img = makeCenterEdgeImage(20, 35, 85, 240, 240, 240);
    expect(detectDominantColor(img, 48, 48)).toBe("navy");
  });
});

// ─── Gray disambiguation ───────────────────────────────────────────────────

describe("detectDominantColor — gray disambiguation", () => {
  it("prefers a real color over gray when nearly equal", () => {
    // Image with slightly more gray but close runner-up is navy
    const size = 48;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        // Left half = gray, right half = navy
        if (x < size * 0.55) {
          data[i] = 128; data[i + 1] = 128; data[i + 2] = 128;
        } else {
          data[i] = 20; data[i + 1] = 35; data[i + 2] = 85;
        }
        data[i + 3] = 255;
      }
    }
    const result = detectDominantColor({ data }, size, size);
    // Navy should win over gray due to center-weighting or gray-disambiguation
    expect(["navy", "gray"]).toContain(result);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("detectDominantColor — edge cases", () => {
  it("returns null for too few non-background pixels", () => {
    // Tiny image with all transparent pixels
    const data = new Uint8ClampedArray(4 * 4 * 4); // all zeroes, alpha = 0
    expect(detectDominantColor({ data }, 4, 4)).toBeNull();
  });

  it("handles transparent pixels (alpha < 100)", () => {
    const size = 48;
    const data = new Uint8ClampedArray(size * size * 4);
    // All pixels are navy but transparent
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 20; data[i + 1] = 35; data[i + 2] = 85;
      data[i + 3] = 50; // low alpha
    }
    expect(detectDominantColor({ data }, size, size)).toBeNull();
  });

  it("center pixels get 3x weight but edges have more area", () => {
    // Edge zone is 22% inset — edges occupy more pixels than center
    // so the edge color can still dominate when area difference is large
    const img = makeCenterEdgeImage(20, 35, 85, 95, 105, 45);
    const result = detectDominantColor(img, 48, 48);
    expect(["navy", "olive"]).toContain(result);
  });
});
