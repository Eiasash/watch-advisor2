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

  it("passes the exact file blob to saveImage", async () => {
    const file = new Blob(["specific-content"], { type: "image/jpeg" });
    enqueueOriginalCache("exact-test", file);
    await new Promise(r => setTimeout(r, 10));
    expect(mockSaveImage).toHaveBeenCalledWith("exact-test", file);
    expect(mockSaveImage.mock.calls[0][1]).toBe(file); // same reference
  });

  it("handles rapid sequential enqueues without dropping items", async () => {
    const saved = [];
    mockSaveImage.mockImplementation(async (id) => { saved.push(id); });
    for (let i = 0; i < 10; i++) {
      enqueueOriginalCache(`rapid-${i}`, new Blob([`${i}`]));
    }
    await new Promise(r => setTimeout(r, 100));
    expect(saved).toHaveLength(10);
    expect(saved).toEqual(Array.from({ length: 10 }, (_, i) => `rapid-${i}`));
  });

  it("handles all items failing without crashing", async () => {
    mockSaveImage.mockRejectedValue(new Error("disk full"));
    enqueueOriginalCache("fail1", new Blob(["1"]));
    enqueueOriginalCache("fail2", new Blob(["2"]));
    enqueueOriginalCache("fail3", new Blob(["3"]));
    await new Promise(r => setTimeout(r, 50));
    expect(mockSaveImage).toHaveBeenCalledTimes(3);
  });

  it("processes items added during drain", async () => {
    const saved = [];
    let callCount = 0;
    mockSaveImage.mockImplementation(async (id) => {
      saved.push(id);
      callCount++;
      if (callCount === 1) {
        // Enqueue during processing of first item
        enqueueOriginalCache("during-drain", new Blob(["extra"]));
      }
    });
    enqueueOriginalCache("first", new Blob(["1"]));
    await new Promise(r => setTimeout(r, 100));
    expect(saved).toContain("first");
    expect(saved).toContain("during-drain");
  });

  it("preserves FIFO order", async () => {
    const order = [];
    mockSaveImage.mockImplementation(async (id) => {
      // Add small delay to simulate async I/O
      await new Promise(r => setTimeout(r, 5));
      order.push(id);
    });
    enqueueOriginalCache("first", new Blob(["1"]));
    enqueueOriginalCache("second", new Blob(["2"]));
    enqueueOriginalCache("third", new Blob(["3"]));
    await new Promise(r => setTimeout(r, 100));
    expect(order).toEqual(["first", "second", "third"]);
  });
});
