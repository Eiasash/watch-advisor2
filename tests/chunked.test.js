import { describe, it, expect, vi } from "vitest";
import { chunked } from "../src/utils/chunked.js";

describe("chunked", () => {
  it("processes every item exactly once", async () => {
    const items = [10, 20, 30, 40, 50];
    const seen  = [];
    await chunked(items, 2, async (x) => { seen.push(x); });
    expect(seen.sort()).toEqual([10, 20, 30, 40, 50]);
  });

  it("never exceeds the concurrency cap", async () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    let inFlight = 0;
    let maxInFlight = 0;
    const N = 4;
    await chunked(items, N, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
    });
    expect(maxInFlight).toBeLessThanOrEqual(N);
    expect(maxInFlight).toBeGreaterThan(1); // proves it actually parallelized
  });

  it("achieves real parallelism (faster than serial)", async () => {
    // 8 items × 30 ms each: serial = 240 ms, concurrency 4 ≈ 60-80 ms
    const items = Array.from({ length: 8 }, (_, i) => i);
    const start = Date.now();
    await chunked(items, 4, async () => { await new Promise(r => setTimeout(r, 30)); });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(150); // generous floor; serial would be ≥240
  });

  it("preserves cursor: each item handed out exactly once even with overlapping work", async () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const indexes = [];
    await chunked(items, 5, async (item, i) => {
      indexes.push(i);
      // Random jitter so workers finish out of order
      await new Promise(r => setTimeout(r, Math.random() * 10));
    });
    expect(indexes.sort((a, b) => a - b)).toEqual(items);
  });

  it("handles empty list without spawning workers", async () => {
    const fn = vi.fn();
    await chunked([], 4, fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it("clamps worker count to items.length when n > items.length", async () => {
    const items = [1, 2];
    let inFlight = 0;
    let maxInFlight = 0;
    await chunked(items, 10, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
    });
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it("propagates a worker error and rejects the chunked promise", async () => {
    const items = [1, 2, 3, 4];
    await expect(chunked(items, 2, async (x) => {
      if (x === 3) throw new Error("boom");
    })).rejects.toThrow("boom");
  });
});
