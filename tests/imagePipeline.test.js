import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock browser APIs before importing module
const mockDrawImage = vi.fn();
const mockGetImageData = vi.fn(() => ({
  data: new Uint8Array(9 * 8 * 4).fill(128), // 9x8 RGBA pixels
}));
const mockToDataURL = vi.fn(() => "data:image/jpeg;base64,fakeThumb");
const mockGetContext = vi.fn(() => ({
  drawImage: mockDrawImage,
  getImageData: mockGetImageData,
}));

// Mock document.createElement for canvas
vi.stubGlobal("document", {
  createElement: vi.fn(() => ({
    width: 0,
    height: 0,
    getContext: mockGetContext,
    toDataURL: mockToDataURL,
  })),
});

// Mock FileReader
class MockFileReader {
  readAsDataURL() {
    setTimeout(() => this.onload?.(), 0);
  }
  get result() { return "data:image/jpeg;base64,abc123"; }
}
vi.stubGlobal("FileReader", MockFileReader);

// Mock Image
class MockImage {
  set src(_) {
    setTimeout(() => this.onload?.(), 0);
  }
  get naturalWidth() { return 800; }
  get naturalHeight() { return 600; }
}
vi.stubGlobal("Image", MockImage);

// Keep real URL constructor but add createObjectURL
if (typeof URL !== "undefined") {
  URL.createObjectURL = vi.fn(() => "blob:mock");
}

// Must import after mocks
const { processImage, generateThumbnail, computeHash } = await import("../src/services/imagePipeline.js");

const mockFile = { name: "test-shoe.jpg", type: "image/jpeg", size: 5000 };

describe("imagePipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("processImage", () => {
    it("returns thumbnail and hash", async () => {
      const result = await processImage(mockFile);
      expect(result).toHaveProperty("thumbnail");
      expect(result).toHaveProperty("hash");
      expect(result.thumbnail).toBe("data:image/jpeg;base64,fakeThumb");
    });

    it("returns 64-char hash (8x8 dHash)", async () => {
      const result = await processImage(mockFile);
      expect(result.hash).toHaveLength(64);
      expect(result.hash).toMatch(/^[01]+$/);
    });

    it("creates 240x240 thumbnail canvas", async () => {
      await processImage(mockFile);
      const canvasCallArgs = document.createElement.mock.calls;
      expect(canvasCallArgs.some(c => c[0] === "canvas")).toBe(true);
    });

    it("creates 9x8 hash canvas", async () => {
      await processImage(mockFile);
      expect(mockGetImageData).toHaveBeenCalledWith(0, 0, 9, 8);
    });

    it("returns null thumbnail on FileReader failure", async () => {
      const origFR = globalThis.FileReader;
      globalThis.FileReader = class {
        readAsDataURL() {
          setTimeout(() => this.onerror?.(new Error("fail")), 0);
        }
      };
      const result = await processImage(mockFile);
      expect(result.thumbnail).toBeNull();
      expect(result.hash).toBe("");
      globalThis.FileReader = origFR;
    });

    it("returns null thumbnail on Image load failure", async () => {
      const origImg = globalThis.Image;
      globalThis.Image = class {
        set src(_) {
          setTimeout(() => this.onerror?.(new Error("fail")), 0);
        }
      };
      const result = await processImage(mockFile);
      expect(result.thumbnail).toBeNull();
      expect(result.hash).toBe("");
      globalThis.Image = origImg;
    });
  });

  describe("generateThumbnail", () => {
    it("returns just the thumbnail string", async () => {
      const thumb = await generateThumbnail(mockFile);
      expect(thumb).toBe("data:image/jpeg;base64,fakeThumb");
    });
  });

  describe("computeHash", () => {
    it("returns just the hash string", async () => {
      const hash = await computeHash(mockFile);
      expect(hash).toHaveLength(64);
    });
  });

  describe("dHash computation", () => {
    it("uniform pixels produce all-zero hash", async () => {
      // All pixels same value (128) → no pixel is strictly greater than next
      const result = await processImage(mockFile);
      expect(result.hash).toBe("0".repeat(64));
    });

    it("hash is always 64 bits (8x8 grid)", async () => {
      const result = await processImage(mockFile);
      expect(result.hash).toMatch(/^[01]{64}$/);
    });
  });
});
