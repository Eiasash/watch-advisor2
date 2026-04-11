import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Storage mock ──────────────────────────────────────────────────────────

let storageCalls = { upload: [], remove: [], getPublicUrl: [] };
let uploadResult = { error: null };

vi.mock("../src/services/supabaseClient.js", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn((...args) => {
          storageCalls.upload.push(args);
          return Promise.resolve(uploadResult);
        }),
        getPublicUrl: vi.fn((path) => {
          storageCalls.getPublicUrl.push(path);
          return { data: { publicUrl: `https://storage.url/${path}` } };
        }),
        remove: vi.fn((...args) => {
          storageCalls.remove.push(args);
          return Promise.resolve({});
        }),
      })),
    },
  },
}));

// Force IS_PLACEHOLDER to be false
vi.stubEnv("VITE_SUPABASE_URL", "https://real-project.supabase.co");

const { uploadPhoto, uploadAngle, deleteStoragePhoto } = await import("../src/services/supabaseStorage.js");

describe("uploadPhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageCalls = { upload: [], remove: [], getPublicUrl: [] };
    uploadResult = { error: null };
  });

  it("converts base64 data URL to Blob and uploads to correct path", async () => {
    const url = await uploadPhoto("g1", "data:image/jpeg;base64,/9j/4AAQSkZJRg==", "thumbnail");
    expect(url).toContain("storage.url");
    expect(storageCalls.upload).toHaveLength(1);
    const [path, blob, opts] = storageCalls.upload[0];
    expect(path).toBe("garments/g1/thumbnail.jpg");
    expect(blob).toBeInstanceOf(Blob);
    expect(opts.upsert).toBe(true);
    expect(opts.contentType).toBe("image/jpeg");
  });

  it("detects png extension from base64 mime type", async () => {
    await uploadPhoto("g1", "data:image/png;base64,iVBORw0KGgo=", "thumbnail");
    expect(storageCalls.upload[0][0]).toBe("garments/g1/thumbnail.png");
  });

  it("handles File/Blob source directly", async () => {
    const blob = new Blob(["pixels"], { type: "image/png" });
    const url = await uploadPhoto("g1", blob, "original");
    expect(url).toContain("storage.url");
    expect(storageCalls.upload[0][0]).toBe("garments/g1/original.png");
  });

  it("returns null for non-data-URL string source", async () => {
    const url = await uploadPhoto("g1", "just-a-string", "thumbnail");
    expect(url).toBeNull();
    expect(storageCalls.upload).toHaveLength(0);
  });

  it("returns null for numeric source", async () => {
    const url = await uploadPhoto("g1", 42, "thumbnail");
    expect(url).toBeNull();
  });

  it("returns null for null source", async () => {
    const url = await uploadPhoto("g1", null, "thumbnail");
    expect(url).toBeNull();
  });

  it("returns null on storage upload error", async () => {
    uploadResult = { error: { message: "quota exceeded" } };
    const url = await uploadPhoto("g1", "data:image/jpeg;base64,abc", "thumbnail");
    expect(url).toBeNull();
  });

  it("uses 'thumbnail' as default kind", async () => {
    await uploadPhoto("g1", "data:image/jpeg;base64,abc");
    expect(storageCalls.upload[0][0]).toBe("garments/g1/thumbnail.jpg");
  });
});

describe("uploadAngle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageCalls = { upload: [], remove: [], getPublicUrl: [] };
    uploadResult = { error: null };
  });

  it("delegates to uploadPhoto with angle-N kind", async () => {
    const url = await uploadAngle("g1", 2, "data:image/jpeg;base64,abc");
    expect(url).toContain("storage.url");
    expect(storageCalls.upload[0][0]).toBe("garments/g1/angle-2.jpg");
  });

  it("supports angle index 0", async () => {
    await uploadAngle("g1", 0, "data:image/jpeg;base64,abc");
    expect(storageCalls.upload[0][0]).toBe("garments/g1/angle-0.jpg");
  });
});

describe("deleteStoragePhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageCalls = { upload: [], remove: [], getPublicUrl: [] };
  });

  it("removes all thumbnail/original/angle variants (12 paths)", async () => {
    await deleteStoragePhoto("g1");
    expect(storageCalls.remove).toHaveLength(1);
    const paths = storageCalls.remove[0][0];
    expect(paths).toHaveLength(12);
    // Thumbnails
    expect(paths).toContain("garments/g1/thumbnail.jpg");
    expect(paths).toContain("garments/g1/thumbnail.png");
    // Originals
    expect(paths).toContain("garments/g1/original.jpg");
    expect(paths).toContain("garments/g1/original.png");
    // Angles 0-3 (jpg + png each)
    for (let i = 0; i < 4; i++) {
      expect(paths).toContain(`garments/g1/angle-${i}.jpg`);
      expect(paths).toContain(`garments/g1/angle-${i}.png`);
    }
  });

  it("uses correct garment ID in all paths", async () => {
    await deleteStoragePhoto("my-garment-42");
    const paths = storageCalls.remove[0][0];
    expect(paths.every(p => p.includes("my-garment-42"))).toBe(true);
  });

  it("does not throw on storage error", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    supabase.storage.from.mockReturnValueOnce({
      remove: vi.fn().mockRejectedValue(new Error("network")),
    });
    // Should not throw
    await expect(deleteStoragePhoto("g1")).resolves.not.toThrow();
  });
});
