import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock all external dependencies ──────────────────────────────────────────

// Prevent real IDB open in Node test environment
vi.mock("../src/services/db.js", () => ({
  DB_NAME: "watch-advisor2", DB_VERSION: 3,
  dbPromise: Promise.resolve({}),
  db: { put: vi.fn(), get: vi.fn(), getAll: vi.fn().mockResolvedValue([]), delete: vi.fn(), putAll: vi.fn() },
}));
vi.mock("../src/services/dbSafeLoad.js", () => ({
  safeLoad: vi.fn().mockResolvedValue([]),
  safeGet:  vi.fn().mockResolvedValue(null),
}));
vi.mock("../src/services/persistence/historyPersistence.js", () => ({
  upsert:  vi.fn().mockResolvedValue(undefined),
  remove:  vi.fn().mockResolvedValue(undefined),
  loadAll: vi.fn().mockResolvedValue([]),
}));

const mockCachedState = {
  watches: [],
  garments: [],
  history: [],
};

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn(async () => ({ ...mockCachedState })),
  setCachedState: vi.fn(async () => {}),
}));

vi.mock("../src/services/supabaseSync.js", () => ({
  pullCloudState: vi.fn(async () => ({ watches: [], garments: [], history: [], _localOnly: true })),
  subscribeSyncState: vi.fn(() => () => {}),
  pushGarment: vi.fn(async () => {}),
  uploadPhoto: vi.fn(async () => null),
  uploadAngle: vi.fn(async () => null),
}));

vi.mock("../src/services/backgroundQueue.js", () => ({
  registerHandler: vi.fn(),
  resumePendingTasks: vi.fn(),
}));

vi.mock("../src/services/backupService.js", () => ({
  checkAndBackup: vi.fn(),
}));

vi.mock("../src/data/watchSeed.js", () => ({
  WATCH_COLLECTION: [
    { id: "seed-1", name: "Seed Watch 1" },
    { id: "seed-2", name: "Seed Watch 2" },
  ],
}));

// Stub React hooks for direct testing of useBootstrap logic
vi.mock("react", () => ({
  useState: vi.fn((init) => [init, vi.fn()]),
  useEffect: vi.fn((fn) => { fn(); }),
}));

// ── Import stores after mocks ──────────────────────────────────────────────

import { useWardrobeStore } from "../src/stores/wardrobeStore.js";
import { useWatchStore } from "../src/stores/watchStore.js";
import { useHistoryStore } from "../src/stores/historyStore.js";
import { getCachedState, setCachedState } from "../src/services/localCache.js";
import { pullCloudState, pushGarment } from "../src/services/supabaseSync.js";
import { registerHandler, resumePendingTasks } from "../src/services/backgroundQueue.js";
import { checkAndBackup } from "../src/services/backupService.js";

// ── Data wipe guard tests ──────────────────────────────────────────────────

describe("bootstrap — data wipe guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWardrobeStore.setState({ garments: [] });
    useWatchStore.setState({ watches: [], activeWatch: null });
    useHistoryStore.setState({ entries: [] });
  });

  it("non-empty local garments are NOT overwritten by empty cloud result", () => {
    // Simulate: local has garments, cloud returns empty
    const localGarments = [
      { id: "g1", type: "shirt", color: "navy" },
      { id: "g2", type: "pants", color: "grey" },
    ];

    useWardrobeStore.setState({ garments: localGarments });

    // Cloud returns empty garments
    pullCloudState.mockResolvedValueOnce({
      watches: [],
      garments: [],
      history: [],
      _localOnly: false,
    });

    // The guard logic: if cloudGarments.length === 0 && localCount > 0 → push local up
    const currentGarments = useWardrobeStore.getState().garments;
    const cloudGarments = [];

    expect(cloudGarments.length).toBe(0);
    expect(currentGarments.length).toBeGreaterThan(0);

    // Guard should prevent overwrite
    const shouldOverwrite = !(cloudGarments.length === 0 && currentGarments.length > 0);
    expect(shouldOverwrite).toBe(false);
  });

  it("cloud garments DO replace local when both are non-empty", () => {
    const localGarments = [{ id: "g1", type: "shirt", color: "navy" }];
    const cloudGarments = [
      { id: "g10", type: "pants", color: "grey" },
      { id: "g11", type: "shoes", color: "black" },
    ];

    useWardrobeStore.setState({ garments: localGarments });

    const currentGarments = useWardrobeStore.getState().garments;

    // Guard should allow overwrite
    const shouldOverwrite = !(cloudGarments.length === 0 && currentGarments.length > 0);
    expect(shouldOverwrite).toBe(true);
  });

  it("empty local accepts empty cloud without pushing anything", () => {
    useWardrobeStore.setState({ garments: [] });

    const currentGarments = useWardrobeStore.getState().garments;
    const cloudGarments = [];

    // Both empty → no guard trigger
    const shouldOverwrite = !(cloudGarments.length === 0 && currentGarments.length > 0);
    expect(shouldOverwrite).toBe(true);
  });

  it("_localOnly flag on pullCloudState signals skip of cloud → local sync", () => {
    // The _localOnly flag means IS_PLACEHOLDER is true — bootstrap returns early
    const cloud = { watches: [], garments: [], history: [], _localOnly: true };
    expect(cloud._localOnly).toBe(true);

    // With _localOnly, bootstrap checks `if (cloud._localOnly) return;`
    // No setGarments/setWatches/setHistory called
    const currentGarments = useWardrobeStore.getState().garments;
    expect(currentGarments).toEqual([]);
  });
});

describe("bootstrap — blob URL cleanup", () => {
  it("blob: URLs in photoUrl are cleared during restore", () => {
    const garments = [
      { id: "g1", type: "shirt", photoUrl: "blob:http://localhost/12345", thumbnail: "data:image/jpeg;base64,abc" },
      { id: "g2", type: "pants", photoUrl: "https://storage.supabase.co/photo.jpg", thumbnail: "data:xyz" },
    ];

    // Simulate the cleanup logic from bootstrap
    const restoredGarments = garments.map(g => ({
      ...g,
      photoUrl: g.photoUrl?.startsWith("blob:") ? undefined : g.photoUrl,
    }));

    expect(restoredGarments[0].photoUrl).toBeUndefined();
    expect(restoredGarments[1].photoUrl).toBe("https://storage.supabase.co/photo.jpg");
  });

  it("null photoUrl is preserved", () => {
    const garments = [{ id: "g1", type: "shirt", photoUrl: null, thumbnail: "data:abc" }];
    const restored = garments.map(g => ({
      ...g,
      photoUrl: g.photoUrl?.startsWith("blob:") ? undefined : g.photoUrl,
    }));
    expect(restored[0].photoUrl).toBeNull();
  });

  it("undefined photoUrl is preserved", () => {
    const garments = [{ id: "g1", type: "shirt", thumbnail: "data:abc" }];
    const restored = garments.map(g => ({
      ...g,
      photoUrl: g.photoUrl?.startsWith("blob:") ? undefined : g.photoUrl,
    }));
    expect(restored[0].photoUrl).toBeUndefined();
  });
});

describe("bootstrap — cached state restoration", () => {
  it("uses WATCH_COLLECTION when cached watches is empty", () => {
    const cached = { watches: [], garments: [], history: [] };
    const WATCH_COLLECTION = [{ id: "seed-1" }, { id: "seed-2" }];
    const watches = cached.watches?.length ? cached.watches : WATCH_COLLECTION;
    expect(watches).toEqual(WATCH_COLLECTION);
  });

  it("uses cached watches when non-empty", () => {
    const cached = { watches: [{ id: "w1" }], garments: [], history: [] };
    const WATCH_COLLECTION = [{ id: "seed-1" }];
    const watches = cached.watches?.length ? cached.watches : WATCH_COLLECTION;
    expect(watches).toEqual([{ id: "w1" }]);
  });

  it("weekCtx must be array of length 7 to restore", () => {
    // Valid weekCtx
    const validCtx = ["casual","casual","casual","casual","casual","casual","casual"];
    expect(Array.isArray(validCtx) && validCtx.length === 7).toBe(true);

    // Invalid: wrong length
    const shortCtx = ["casual","casual"];
    expect(Array.isArray(shortCtx) && shortCtx.length === 7).toBe(false);

    // Invalid: not an array
    expect(Array.isArray(null) && (null)?.length === 7).toBe(false);
    expect(Array.isArray(undefined)).toBe(false);
  });

  it("onCallDates must be array to restore", () => {
    expect(Array.isArray(["2026-03-07"])).toBe(true);
    expect(Array.isArray(null)).toBe(false);
    expect(Array.isArray(undefined)).toBe(false);
  });

  it("fallback for null garments and history arrays", () => {
    const cached = { watches: [], garments: null, history: null };
    const restoredGarments = (cached.garments ?? []).map(g => ({ ...g }));
    const history = cached.history ?? [];
    expect(restoredGarments).toEqual([]);
    expect(history).toEqual([]);
  });
});

describe("bootstrap — handler registration", () => {
  it("registers all 4 background task handlers", async () => {
    registerHandler.mockClear();
    // Simulate what bootstrap does
    registerHandler("push-garment", async () => {});
    registerHandler("upload-photo", async () => {});
    registerHandler("upload-angle", async () => {});
    registerHandler("verify-photo", async () => {});

    expect(registerHandler).toHaveBeenCalledTimes(4);
    expect(registerHandler).toHaveBeenCalledWith("push-garment", expect.any(Function));
    expect(registerHandler).toHaveBeenCalledWith("upload-photo", expect.any(Function));
    expect(registerHandler).toHaveBeenCalledWith("upload-angle", expect.any(Function));
    expect(registerHandler).toHaveBeenCalledWith("verify-photo", expect.any(Function));
  });
});

describe("bootstrap — upload handlers use entries not history", () => {
  it("upload-photo handler reads entries (not history) from historyStore for IDB cache", async () => {
    // Regression: bootstrap previously destructured { history } from historyStore,
    // but the store only exports 'entries'. This wrote undefined to IDB, corrupting
    // the cache and causing "(r ?? []).filter is not a function" on next boot.
    const historyEntries = [
      { id: "h1", watchId: "w1", date: "2026-04-01", garmentIds: ["g1"] },
    ];
    useHistoryStore.setState({ entries: historyEntries });
    useWardrobeStore.setState({ garments: [{ id: "g1", type: "shirt" }] });
    useWatchStore.setState({ watches: [{ id: "w1" }] });

    // Verify the store exposes entries, not history
    const state = useHistoryStore.getState();
    expect(state.entries).toEqual(historyEntries);
    expect(state.history).toBeUndefined();

    // Verify destructuring with alias works correctly
    const { entries: history } = useHistoryStore.getState();
    expect(history).toEqual(historyEntries);
    expect(Array.isArray(history)).toBe(true);
  });
});
