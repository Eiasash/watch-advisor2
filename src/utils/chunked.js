/**
 * Run `fn(item, i)` over `items` with up to `n` workers in flight.
 * The worker `fn` is responsible for its own error handling and progress
 * reporting — `chunked` just hands out work and waits for all to finish.
 *
 * Concurrency is bounded by `n` (or `items.length`, whichever is smaller).
 * If `fn` throws, that promise rejects and the chain unwinds — wrap in
 * try/catch inside `fn` if you want errors to be non-fatal.
 */
export async function chunked(items, n, fn) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}
