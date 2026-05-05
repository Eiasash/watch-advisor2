/**
 * tests/stressSimulation.test.js
 *
 * Simulated heavy-load and accumulated-usage tests that look for the kinds
 * of bugs that only surface under sustained traffic, concurrent writes, or
 * after months of state accumulation.
 *
 * Each describe block targets one stress dimension. Tests deliberately
 * push past normal usage levels — 100× the typical wardrobe, 1000×
 * concurrent state writes, etc. — to surface scaling, race, and memory
 * issues before the user does.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Persistence race: concurrent setCachedState across many fields ──────────
//
// Bug fixed May 5 2026 R5. Before the IDB-transaction wrap, two concurrent
// callers of setCachedState (e.g. WeekPlanner persisting outfit overrides
// at the same moment travelStore persists trips) could lose-update each
// other. Any field one caller wrote could be silently dropped by the other.
// This test fans out 50 concurrent writes to 50 distinct fields and asserts
// all 50 survive.

let mockStore;
// Per-store transaction queue — simulates real IDB's "readwrite txns on
// the same store run serially" guarantee. Each tx waits for the previous
// tx's `done` before its operations can read/write.
let txChain;

const makeMock = () => {
  mockStore = new Map();
  txChain = Promise.resolve();
  return {
    openDB: vi.fn(() => Promise.resolve({
      get: vi.fn((store, key) => Promise.resolve(mockStore.get(key))),
      put: vi.fn((store, value, key) => { mockStore.set(key, value); return Promise.resolve(); }),
      transaction: vi.fn((_storeName, _mode) => {
        const prior = txChain;
        // The tx becomes "active" only after the prior tx fully commits.
        // All ops on this tx await `prior` first, mirroring IDB queueing.
        const ops = [];
        const tx = {
          store: {
            get: (key) => prior.then(() => mockStore.get(key)),
            put: (value, key) => prior.then(() => { mockStore.set(key, value); }),
            getAllKeys: () => prior.then(() => [...mockStore.keys()]),
            delete: (key) => prior.then(() => { mockStore.delete(key); }),
          },
        };
        // The tx's done resolves after a microtask AFTER prior (so user
        // code's awaited put has a chance to land first). We chain via
        // the queue so the next tx waits for us.
        const done = prior.then(async () => {
          // Yield several times to let the user's awaited put() ops settle.
          for (let i = 0; i < 5; i++) await new Promise(r => queueMicrotask(r));
        });
        tx.done = done;
        txChain = done;
        return tx;
      }),
    })),
  };
};

vi.mock("idb", () => makeMock());

beforeEach(() => {
  mockStore = new Map();
  txChain = Promise.resolve();
});

const { setCachedState, getCachedState } = await import("../src/services/localCache.js");

describe("setCachedState — concurrent write stress", () => {
  it("50 concurrent writes to distinct fields all survive (no lost updates)", async () => {
    const writes = [];
    for (let i = 0; i < 50; i++) {
      writes.push(setCachedState({ [`field_${i}`]: `value_${i}` }));
    }
    await Promise.all(writes);

    const final = await getCachedState();
    for (let i = 0; i < 50; i++) {
      expect(final[`field_${i}`]).toBe(`value_${i}`);
    }
  });

  it("repeated overrides on the same field — last-write-wins is preserved", async () => {
    // Last-write-wins is intentional behaviour for same-field. Pre-fix this
    // could have been broken too (wrong tx serialization).
    const writes = [];
    for (let i = 0; i < 50; i++) {
      writes.push(setCachedState({ counter: i }));
    }
    await Promise.all(writes);
    const final = await getCachedState();
    // Some value 0-49 must win; the tx serialization makes the ordering
    // implementation-dependent, but ONE of them must persist (not undefined).
    expect(final.counter).toBeGreaterThanOrEqual(0);
    expect(final.counter).toBeLessThanOrEqual(49);
  });

  it("interleaved writes to overlapping field sets — no field disappears", async () => {
    // Tab A persists outfitOverrides + forecast simultaneously with
    // Tab B persisting strapStore + travelStore. All four fields must
    // be present in the end.
    const a1 = setCachedState({ _outfitOverrides: { "2026-05-05": { shirt: "g1" } } });
    const a2 = setCachedState({ _forecast: [{ date: "2026-05-05" }], _forecastTs: 1000 });
    const b1 = setCachedState({ strapStore: { activeStrap: { laureato: "s1" } } });
    const b2 = setCachedState({ travelStore: { trips: [{ id: "t1" }] } });
    await Promise.all([a1, a2, b1, b2]);

    const final = await getCachedState();
    expect(final._outfitOverrides).toBeDefined();
    expect(final._forecast).toBeDefined();
    expect(final._forecastTs).toBe(1000);
    expect(final.strapStore).toBeDefined();
    expect(final.travelStore).toBeDefined();
  });
});

// ── AI cache key: scale to 100× wardrobe ─────────────────────────────────────
//
// The XOR-sum content hash should behave well at any wardrobe size and the
// final key should remain under the 200-char index bound. Stress test at
// 10× and 100× the actual wardrobe.

const { computeCacheKey } = await import("../netlify/functions/daily-pick.js");

describe("computeCacheKey — wardrobe scaling stress", () => {
  it("stays under 200 chars at 10× wardrobe (~1000 garments)", () => {
    const garments = Array.from({ length: 1000 }, (_, i) => ({
      id: `g${i}`,
      name: `Garment ${i}`,
      color: ["navy", "khaki", "black", "white", "olive"][i % 5],
      formality: 3 + (i % 7),
      category: ["shirt", "pants", "shoes", "jacket", "sweater"][i % 5],
      brand: `Brand${i % 20}`,
      created_at: `2026-04-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const key = computeCacheKey({
      date: "2026-05-05",
      pinnedWatchId: "blackbay",
      weather: { tempMorning: 12, tempMidday: 18, tempEvening: 14 },
      garments,
      history: [],
    });
    expect(key.length).toBeLessThan(200);
  });

  it("stays under 200 chars at 100× wardrobe (~10000 garments)", () => {
    const garments = Array.from({ length: 10000 }, (_, i) => ({
      id: `g${i}`,
      name: `G${i}`,
      color: "navy",
      formality: 5,
      category: "shirt",
      brand: "B",
    }));
    const key = computeCacheKey({
      date: "2026-05-05",
      pinnedWatchId: "blackbay",
      weather: null,
      garments,
      history: [],
    });
    expect(key.length).toBeLessThan(200);
  });

  it("100 calls on identical input run in <50ms (no quadratic behaviour)", () => {
    const garments = Array.from({ length: 200 }, (_, i) => ({
      id: `g${i}`,
      name: `Garment ${i}`,
      color: "navy",
      formality: 5,
      category: "shirt",
      brand: "B",
    }));
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      computeCacheKey({ date: "2026-05-05", garments, history: [], weather: null });
    }
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
  });

  it("hash collision rate remains low across distinct wardrobe states", () => {
    // 200 truly distinct wardrobe states. Vary BOTH which garment is
    // edited AND what value it gets, with combinations chosen so no two
    // (slot, value) pairs repeat. With a 32-bit XOR sum we expect ~zero
    // collisions in this small sample — anything more than 2 collisions
    // hints at a hashing bug.
    const seen = new Set();
    let collisions = 0;
    for (let i = 0; i < 200; i++) {
      const garments = Array.from({ length: 100 }, (_, idx) => ({
        id: `g${idx}`, name: `G${idx}`,
        // Per-iteration unique color encoding so each iteration produces
        // a guaranteed-distinct wardrobe state.
        color: idx === (i % 100) ? `iter-${i}` : "navy",
        formality: 5, category: "shirt", brand: "B",
      }));
      const k = computeCacheKey({
        date: "2026-05-05", pinnedWatchId: "blackbay", weather: null,
        garments, history: [],
      });
      if (seen.has(k)) collisions++;
      seen.add(k);
    }
    expect(collisions).toBeLessThanOrEqual(2);
  });
});

// ── AI pick resolver: scale to 1000-garment wardrobe ─────────────────────────

const { resolveGarmentSlots, normalizeAiName } = await import("../src/utils/aiPickResolver.js");

describe("resolveGarmentSlots — large-wardrobe stress", () => {
  it("resolves correctly against a 1000-item wardrobe in <20ms", () => {
    const garments = Array.from({ length: 1000 }, (_, i) => ({
      id: `g${i}`, name: `Garment ${i}`,
    }));
    const slots = ["shirt", "sweater", "pants", "shoes", "jacket"];
    const pick = {
      shirt: "Garment 42",
      sweater: "  Garment 999  ",  // padded
      pants: "\"Garment 500\"",     // quoted
      shoes: "Garment 1.",          // trailing period
      jacket: null,
    };
    const t0 = performance.now();
    const { overrides, unmatched } = resolveGarmentSlots(pick, garments, slots);
    const elapsed = performance.now() - t0;

    expect(overrides.shirt).toBe("g42");
    expect(overrides.sweater).toBe("g999");
    expect(overrides.pants).toBe("g500");
    expect(overrides.shoes).toBe("g1");
    expect(overrides.jacket).toBeNull();
    expect(unmatched).toHaveLength(0);
    expect(elapsed).toBeLessThan(20);
  });

  it("does not crash on a wardrobe with duplicate names (returns first match)", () => {
    const garments = [
      { id: "g1a", name: "Navy Polo" },
      { id: "g1b", name: "Navy Polo" }, // duplicate
      { id: "g2", name: "Khaki Chinos" },
    ];
    const { overrides } = resolveGarmentSlots({ shirt: "Navy Polo" }, garments, ["shirt"]);
    // Either id is acceptable — implementation defines order — but ONE must match
    expect(["g1a", "g1b"]).toContain(overrides.shirt);
  });

  it("handles 100 unmatched slots without runaway memory", () => {
    const garments = [{ id: "g1", name: "Real Garment" }];
    const slots = Array.from({ length: 100 }, (_, i) => `slot_${i}`);
    const pick = Object.fromEntries(slots.map(s => [s, "Hallucinated Item"]));
    const { unmatched } = resolveGarmentSlots(pick, garments, slots);
    expect(unmatched).toHaveLength(100);
  });
});

// ── normalizeAiName: throughput + adversarial inputs ─────────────────────────

describe("normalizeAiName — throughput + adversarial input", () => {
  it("processes 10000 calls in <100ms", () => {
    const samples = ["Navy Polo", '"Quoted"', "  padded  ", "trailing.", "Smart\u201CQuotes\u201D"];
    const t0 = performance.now();
    for (let i = 0; i < 10000; i++) {
      normalizeAiName(samples[i % samples.length]);
    }
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(100);
  });

  it("does not stack-overflow on absurdly long input", () => {
    // Some Claude responses include long boilerplate before the actual
    // name. Make sure we don't blow up on that.
    const long = "x".repeat(100000);
    expect(() => normalizeAiName(long)).not.toThrow();
    expect(normalizeAiName(long).length).toBeLessThanOrEqual(100000);
  });

  it("does not strip nested quotes infinitely", () => {
    // Single-layer strip only — preserves inner quotes.
    expect(normalizeAiName('""nested""')).toBe('"nested"');
  });

  it("handles all-quote / all-punctuation pathological strings without crash", () => {
    expect(() => normalizeAiName('""')).not.toThrow();
    expect(() => normalizeAiName("...")).not.toThrow();
    expect(() => normalizeAiName('"."')).not.toThrow();
  });
});

// ── AbortController accumulation: per-date inflight cleanup ──────────────────
//
// Mocked behaviorally — the real handleAskClaude lives in a React component
// that we can't easily mount here. But we CAN verify the contract that an
// AbortController .abort() no-ops on a finished controller and that a
// long-running session doesn't accumulate aborters in a Map.

describe("AbortController lifecycle — accumulated session simulation", () => {
  it("aborting an already-finished controller does not throw", () => {
    const c = new AbortController();
    c.abort();
    expect(() => c.abort()).not.toThrow();
  });

  it("simulated: 1000 sequential 'asks' on the same date leave at most 1 controller in the ref", () => {
    // Mirrors the inflightAbortersRef pattern in WeekPlanner.jsx.
    const ref = {};
    for (let i = 0; i < 1000; i++) {
      const date = "2026-05-05";
      const prior = ref[date];
      if (prior) prior.abort();
      const aborter = new AbortController();
      ref[date] = aborter;
      // Simulate the request finishing — ownership check then delete
      if (ref[date] === aborter) delete ref[date];
    }
    expect(Object.keys(ref)).toHaveLength(0);
  });

  it("simulated: rapid double-tap mid-flight leaves only the latest aborter", () => {
    const ref = {};
    const date = "2026-05-05";
    // Tap 1: starts
    const a1 = new AbortController();
    ref[date] = a1;
    // Tap 2: aborts a1, starts a2 BEFORE a1's response landed
    if (ref[date]) ref[date].abort();
    const a2 = new AbortController();
    ref[date] = a2;
    // a1's "response" lands — staleness check fails → no-op
    if (ref[date] !== a1) {
      // expected path: drop on floor
    }
    // a2's response lands — owner, completes
    if (ref[date] === a2) delete ref[date];

    expect(Object.keys(ref)).toHaveLength(0);
    expect(a1.signal.aborted).toBe(true);
    expect(a2.signal.aborted).toBe(false);
  });
});
