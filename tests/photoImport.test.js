import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies
vi.mock("../src/services/imagePipeline.js", () => ({
  processImage: vi.fn(() => Promise.resolve({
    thumbnail: "data:image/jpeg;base64,fakeThumb",
    hash: "1010101010101010101010101010101010101010101010101010101010101010",
  })),
}));

vi.mock("../src/services/photoQueue.js", () => ({
  enqueueOriginalCache: vi.fn(),
}));

vi.mock("../src/features/wardrobe/classifier.js", () => ({
  classify: vi.fn(() => Promise.resolve({
    type: "shirt",
    color: "blue",
    formality: 5,
    needsReview: false,
    _typeSource: "filename",
  })),
}));

vi.mock("../src/features/wardrobe/isOutfitPhoto.js", () => ({
  isOutfitPhoto: vi.fn(name => /selfie|mirror|ootd|outfit/i.test(name)),
}));

vi.mock("../src/features/wardrobe/normalizeType.js", () => ({
  normalizeType: vi.fn(t => t ?? "accessory"),
}));

// Mock URL.createObjectURL
vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock-url") });

// Mock fetch for Claude fallback
vi.stubGlobal("fetch", vi.fn());

import { runPhotoImport } from "../src/features/wardrobe/photoImport.js";
import { processImage } from "../src/services/imagePipeline.js";
import { enqueueOriginalCache } from "../src/services/photoQueue.js";
import { classify } from "../src/features/wardrobe/classifier.js";
import { isOutfitPhoto } from "../src/features/wardrobe/isOutfitPhoto.js";
import { normalizeType } from "../src/features/wardrobe/normalizeType.js";

describe("runPhotoImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeType.mockImplementation(t => t ?? "accessory");
    classify.mockResolvedValue({
      type: "shirt",
      color: "blue",
      formality: 5,
      needsReview: false,
      _typeSource: "filename",
    });
  });

  // ── Outfit/selfie detection ──────────────────────────────────────────────

  it("detects outfit photos and marks excludeFromWardrobe", async () => {
    const file = { name: "mirror-selfie.jpg", type: "image/jpeg", size: 1000 };
    const result = await runPhotoImport(file);
    expect(result.photoType).toBe("outfit-shot");
    expect(result.excludeFromWardrobe).toBe(true);
    expect(result.thumbnail).toBeNull();
  });

  it("detects OOTD photos", async () => {
    const file = { name: "ootd-casual.jpg", type: "image/jpeg", size: 1000 };
    const result = await runPhotoImport(file);
    expect(result.photoType).toBe("outfit-shot");
    expect(result.excludeFromWardrobe).toBe(true);
  });

  it("strips extension and cleans name for outfit photos", async () => {
    const file = { name: "mirror-selfie-2024.jpg", type: "image/jpeg", size: 1000 };
    const result = await runPhotoImport(file);
    expect(result.name).toBe("mirror selfie 2024");
  });

  // ── Normal garment import ────────────────────────────────────────────────

  it("imports a normal garment with type, color, thumbnail, hash", async () => {
    const file = { name: "blue-shirt.jpg", type: "image/jpeg", size: 5000 };
    const result = await runPhotoImport(file);
    expect(result.type).toBe("shirt");
    expect(result.color).toBe("blue");
    expect(result.thumbnail).toBe("data:image/jpeg;base64,fakeThumb");
    expect(result.hash).toHaveLength(64);
    expect(result.id).toMatch(/^g_/);
    expect(result.photoUrl).toBe("blob:mock-url");
  });

  it("calls processImage for thumbnail and hash", async () => {
    const file = { name: "pants.jpg", type: "image/jpeg", size: 5000 };
    await runPhotoImport(file);
    expect(processImage).toHaveBeenCalledWith(file);
  });

  it("calls classify with filename, thumbnail, hash, and existing garments", async () => {
    const file = { name: "shoes.jpg", type: "image/jpeg", size: 5000 };
    const existing = [{ id: "g1", type: "shirt" }];
    await runPhotoImport(file, existing);
    expect(classify).toHaveBeenCalledWith(
      "shoes.jpg",
      "data:image/jpeg;base64,fakeThumb",
      expect.any(String),
      existing
    );
  });

  it("enqueues original file for caching", async () => {
    const file = { name: "belt.jpg", type: "image/jpeg", size: 5000 };
    await runPhotoImport(file);
    expect(enqueueOriginalCache).toHaveBeenCalledWith(expect.stringMatching(/^g_/), file);
  });

  it("normalizes the garment type", async () => {
    classify.mockResolvedValue({ type: "tee", color: "white", formality: 3, _typeSource: "filename", needsReview: false });
    normalizeType.mockImplementation(() => "shirt");
    const file = { name: "tee.jpg", type: "image/jpeg", size: 5000 };
    const result = await runPhotoImport(file);
    expect(result.type).toBe("shirt");
    expect(normalizeType).toHaveBeenCalledWith("tee");
  });

  it("sets name from filename with cleaned separators", async () => {
    const file = { name: "navy-dress-shirt.jpg", type: "image/jpeg", size: 5000 };
    const result = await runPhotoImport(file);
    expect(result.name).toBe("navy dress shirt");
  });

  it("uses fallback name for empty filename base", async () => {
    const file = { name: ".jpg", type: "image/jpeg", size: 5000 };
    const result = await runPhotoImport(file);
    expect(result.name).toBe("Imported Garment");
  });

  it("includes duplicateOf when classifier detects duplicate", async () => {
    classify.mockResolvedValue({ type: "shirt", color: "blue", formality: 5, _typeSource: "filename", needsReview: false, duplicateOf: "g_existing" });
    const file = { name: "shirt.jpg", type: "image/jpeg", size: 5000 };
    const result = await runPhotoImport(file);
    expect(result.duplicateOf).toBe("g_existing");
  });

  it("does not include duplicateOf when no duplicate", async () => {
    const file = { name: "unique-jacket.jpg", type: "image/jpeg", size: 5000 };
    const result = await runPhotoImport(file);
    expect(result).not.toHaveProperty("duplicateOf");
  });

  // ── Claude Vision fallback ───────────────────────────────────────────────

  it("calls Claude Vision fallback when classifier has low confidence (blind source)", async () => {
    classify.mockResolvedValue({ type: "accessory", color: null, formality: 5, _typeSource: "blind", needsReview: true });
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ type: "belt", color: "brown", formality: 4, confidence: 0.92 }),
    });
    normalizeType.mockImplementation(t => t);
    const file = { name: "IMG_0042.jpg", type: "image/jpeg", size: 5000 };
    const result = await runPhotoImport(file);
    expect(fetch).toHaveBeenCalledWith("/.netlify/functions/classify-image", expect.any(Object));
    expect(result.type).toBe("belt");
    expect(result.color).toBe("brown");
  });

  it("calls Claude Vision fallback for ambiguous source", async () => {
    classify.mockResolvedValue({ type: "accessory", color: null, formality: 5, _typeSource: "ambiguous", needsReview: true });
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ type: "sunglasses", color: "black", formality: 5, confidence: 0.88 }),
    });
    normalizeType.mockImplementation(t => t);
    const file = { name: "item.jpg", type: "image/jpeg", size: 5000 };
    const result = await runPhotoImport(file);
    expect(result.type).toBe("sunglasses");
  });

  it("skips Claude fallback when confidence is high", async () => {
    classify.mockResolvedValue({ type: "shoes", color: "brown", formality: 6, _typeSource: "filename", needsReview: false });
    const file = { name: "brown-shoes.jpg", type: "image/jpeg", size: 5000 };
    await runPhotoImport(file);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("handles Claude Vision fallback failure gracefully", async () => {
    classify.mockResolvedValue({ type: "accessory", color: null, formality: 5, _typeSource: "blind", needsReview: true });
    fetch.mockRejectedValue(new Error("Network error"));
    const file = { name: "IMG_0099.jpg", type: "image/jpeg", size: 5000 };
    const result = await runPhotoImport(file);
    // Should still return a garment with original classifier values
    expect(result.type).toBe("accessory");
    expect(result.needsReview).toBe(true);
  });

  it("handles null thumbnail — skips Claude fallback", async () => {
    processImage.mockResolvedValue({ thumbnail: null, hash: "" });
    classify.mockResolvedValue({ type: "accessory", color: null, formality: 5, _typeSource: "default", needsReview: true });
    const file = { name: "IMG_0050.jpg", type: "image/jpeg", size: 5000 };
    const result = await runPhotoImport(file);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.thumbnail).toBeNull();
  });
});
