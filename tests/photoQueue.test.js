import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSaveImage = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/services/localCache.js", () => ({
  saveImage: (...args) => mockSaveImage(...args),
  getCachedState: vi.fn().mockResolvedValue({}),
  setCachedState: vi.fn().mockResolvedValue(undefined),
  getImage: vi.fn().mockResolvedValue(undefined),
}));

import { enqueueOriginalCache } from "../src/services/photoQueue.js";

describe("photoQueue", () => {
  beforeEach(() => {
    mockSaveImage.mockClear();
    mockSaveImage.mockResolvedValue(undefined);
  });

  it("enqueues and saves a single item", async () => {
    const file = new Blob(["photo"]);
    enqueueOriginalCache("img1", file);
    // Allow microtask queue to drain
    await new Promise(r => setTimeout(r, 10));
    expect(mockSaveImage).toHaveBeenCalledWith("img1", file);
  });

  it("processes multiple items sequentially", async () => {
    const order = [];
    mockSaveImage.mockImplementation(async (id) => {
      order.push(id);
    });
    enqueueOriginalCache("a", new Blob(["1"]));
    enqueueOriginalCache("b", new Blob(["2"]));
    enqueueOriginalCache("c", new Blob(["3"]));
    await new Promise(r => setTimeout(r, 50));
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("continues processing when one item fails", async () => {
    const saved = [];
    mockSaveImage.mockImplementation(async (id) => {
      if (id === "bad") throw new Error("fail");
      saved.push(id);
    });
    enqueueOriginalCache("good1", new Blob(["1"]));
    enqueueOriginalCache("bad", new Blob(["2"]));
    enqueueOriginalCache("good2", new Blob(["3"]));
    await new Promise(r => setTimeout(r, 50));
    expect(saved).toEqual(["good1", "good2"]);
  });
});
