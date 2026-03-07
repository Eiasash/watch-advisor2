import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @netlify/blobs
vi.mock("@netlify/blobs", () => ({
  getStore: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    setJSON: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { hashText, cacheGet, cacheSet } from "../netlify/functions/_blobCache.js";
import { getStore } from "@netlify/blobs";

// ─── hashText ───────────────────────────────────────────────────────────────

describe("hashText — FNV hash", () => {
  it("returns an 8-character hex string", () => {
    const result = hashText("hello");
    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it("produces deterministic output", () => {
    expect(hashText("test")).toBe(hashText("test"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashText("abc")).not.toBe(hashText("def"));
  });

  it("handles empty string", () => {
    const result = hashText("");
    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it("handles long strings", () => {
    const long = "a".repeat(10000);
    const result = hashText(long);
    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it("handles unicode characters", () => {
    const result = hashText("café 🎉");
    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ─── cacheGet ───────────────────────────────────────────────────────────────

describe("cacheGet", () => {
  it("returns null when store returns null", async () => {
    const result = await cacheGet("nonexistent-key");
    expect(result).toBeNull();
  });

  it("returns cached value when present", async () => {
    const mockStore = { get: vi.fn().mockResolvedValue({ score: 85 }), setJSON: vi.fn() };
    getStore.mockReturnValue(mockStore);
    const result = await cacheGet("test-key");
    expect(result).toEqual({ score: 85 });
  });

  it("returns null on error", async () => {
    getStore.mockImplementation(() => { throw new Error("fail"); });
    const result = await cacheGet("key");
    expect(result).toBeNull();
  });
});

// ─── cacheSet ───────────────────────────────────────────────────────────────

describe("cacheSet", () => {
  it("calls setJSON on the store", async () => {
    const mockStore = { get: vi.fn(), setJSON: vi.fn().mockResolvedValue(undefined) };
    getStore.mockReturnValue(mockStore);
    await cacheSet("key", { data: 123 });
    expect(mockStore.setJSON).toHaveBeenCalledWith("key", { data: 123 });
  });

  it("does not throw on error", async () => {
    getStore.mockImplementation(() => { throw new Error("fail"); });
    await expect(cacheSet("key", {})).resolves.toBeUndefined();
  });
});
