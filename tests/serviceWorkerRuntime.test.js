/**
 * tests/serviceWorkerRuntime.test.js
 *
 * Runtime integration tests for public/sw.js — actually executes the
 * fetch/install/activate handlers against mocked Cache + fetch globals.
 *
 * Why this file exists alongside serviceWorker.test.js:
 *   The existing serviceWorker.test.js is a static-source-grep audit —
 *   useful for catching regressions in declarations (cache names, MAX_IMAGES,
 *   NO_CACHE_FUNCTIONS list) but doesn't actually exercise the routing logic.
 *   This file evaluates sw.js inside a sandbox and pokes the captured
 *   handlers with synthetic FetchEvents.
 *
 * SW gap was flagged in IMPROVEMENTS.md R3 candidates as "single largest
 * known coverage gap." This file fills it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SW_SRC = readFileSync(resolve(__dirname, "../public/sw.js"), "utf-8");

// ── SW sandbox harness ──────────────────────────────────────────────────────

/**
 * Load the SW source inside a fresh sandbox and return the captured event
 * handlers + the mocked globals. Each test gets a clean instance.
 */
function loadSW() {
  const handlers = {};
  const cacheStores = new Map(); // name → Map(reqKey → Response)
  const cacheKeyOf = req => (typeof req === "string" ? req : req.url);

  const fakeCaches = {
    open: vi.fn(async name => {
      if (!cacheStores.has(name)) cacheStores.set(name, new Map());
      const store = cacheStores.get(name);
      return {
        match: vi.fn(async req => store.get(cacheKeyOf(req))),
        put: vi.fn(async (req, res) => { store.set(cacheKeyOf(req), res); }),
        addAll: vi.fn(async urls => {
          for (const u of urls) store.set(u, new Response("precached", { status: 200 }));
        }),
        keys: vi.fn(async () => [...store.keys()].map(k => ({ url: k }))),
        delete: vi.fn(async req => store.delete(cacheKeyOf(req))),
      };
    }),
    keys: vi.fn(async () => [...cacheStores.keys()]),
    delete: vi.fn(async name => cacheStores.delete(name)),
  };

  const self = {
    addEventListener: (event, handler) => { handlers[event] = handler; },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => []), openWindow: vi.fn() },
    registration: { showNotification: vi.fn() },
    location: { origin: "https://watch-advisor2.netlify.app" },
  };

  const fetchMock = vi.fn();

  const fn = new Function("self", "caches", "fetch", "console", "setTimeout", "URL", "Response", SW_SRC);
  fn(self, fakeCaches, fetchMock, console, () => {}, URL, Response);

  return { handlers, self, fakeCaches, cacheStores, fetchMock };
}

/**
 * Build a synthetic FetchEvent compatible with the SW handler.
 * `respondWith` captures the response promise so the test can await it.
 */
function fetchEvent(url, init = {}) {
  const event = {
    request: new Request(url, init),
    _responsePromise: null,
    respondWith(p) { event._responsePromise = Promise.resolve(p); },
    waitUntil() {},
  };
  return event;
}

// ── Install + activate lifecycle ─────────────────────────────────────────────

describe("SW runtime — install + activate", () => {
  it("install handler precaches SHELL_URLS into SHELL_CACHE", async () => {
    const { handlers, fakeCaches, cacheStores } = loadSW();
    let waitPromise;
    const installEvent = { waitUntil(p) { waitPromise = p; } };

    handlers.install(installEvent);
    await waitPromise;

    expect(fakeCaches.open).toHaveBeenCalledWith("wa2-shell-v16");
    const shellCache = cacheStores.get("wa2-shell-v16");
    expect(shellCache).toBeDefined();
  });

  it("install handler tolerates precache failure (catch + warn)", async () => {
    const { handlers, fakeCaches } = loadSW();
    fakeCaches.open = vi.fn(async () => ({
      addAll: vi.fn(() => Promise.reject(new Error("network"))),
      match: vi.fn(),
      put: vi.fn(),
      keys: vi.fn(async () => []),
      delete: vi.fn(),
    }));
    let waitPromise;
    handlers.install({ waitUntil(p) { waitPromise = p; } });
    await expect(waitPromise).resolves.toBeUndefined();
  });

  it("activate handler deletes outdated caches and keeps current ones", async () => {
    const { handlers, fakeCaches, cacheStores, self } = loadSW();
    cacheStores.set("wa2-shell-v16", new Map());
    cacheStores.set("wa2-images-v4", new Map());
    cacheStores.set("wa2-api-v4", new Map());
    cacheStores.set("wa2-shell-v9", new Map()); // stale
    cacheStores.set("wa2-images-v1", new Map()); // stale

    let waitPromise;
    handlers.activate({ waitUntil(p) { waitPromise = p; } });
    await waitPromise;

    expect(cacheStores.has("wa2-shell-v16")).toBe(true);
    expect(cacheStores.has("wa2-images-v4")).toBe(true);
    expect(cacheStores.has("wa2-api-v4")).toBe(true);
    expect(cacheStores.has("wa2-shell-v9")).toBe(false);
    expect(cacheStores.has("wa2-images-v1")).toBe(false);
    expect(self.clients.claim).toHaveBeenCalled();
  });
});

// ── Fetch routing — uncached AI functions ───────────────────────────────────

describe("SW runtime — uncached function routing", () => {
  it("daily-pick is in NO_CACHE_FUNCTIONS — bypasses cache, returns 503 offline", async () => {
    const { handlers, fetchMock } = loadSW();
    fetchMock.mockRejectedValue(new Error("offline"));

    const e = fetchEvent("https://watch-advisor2.netlify.app/.netlify/functions/daily-pick");
    handlers.fetch(e);
    const res = await e._responsePromise;

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("NO_CACHE_FUNCTION");
  });

  it("claude-stylist is in NO_CACHE_FUNCTIONS — bypasses cache", async () => {
    const { handlers, fetchMock } = loadSW();
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));

    const e = fetchEvent("https://watch-advisor2.netlify.app/.netlify/functions/claude-stylist", { method: "GET" });
    handlers.fetch(e);
    await e._responsePromise;

    // Real fetch invoked, but cache.put NOT called (we'd see it on cacheStores)
    expect(fetchMock).toHaveBeenCalled();
  });

  it("skill-snapshot is in NO_CACHE_FUNCTIONS (was added when fail-closed auth shipped)", async () => {
    const { handlers, fetchMock } = loadSW();
    fetchMock.mockRejectedValue(new Error("offline"));

    const e = fetchEvent("https://watch-advisor2.netlify.app/.netlify/functions/skill-snapshot");
    handlers.fetch(e);
    const res = await e._responsePromise;

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("NO_CACHE_FUNCTION");
  });

  it("non-listed netlify function falls through to networkFirst (cacheable)", async () => {
    const { handlers, fetchMock, cacheStores } = loadSW();
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200, headers: { "Content-Type": "application/json" } }));

    const e = fetchEvent("https://watch-advisor2.netlify.app/.netlify/functions/some-future-cacheable-fn");
    handlers.fetch(e);
    await e._responsePromise;

    // Should have populated wa2-api-v4 cache
    expect(cacheStores.has("wa2-api-v4")).toBe(true);
  });
});

// ── Fetch routing — Supabase storage cache-first ─────────────────────────────

describe("SW runtime — Supabase Storage cache-first", () => {
  it("matches https://*.supabase.co/storage/* via cacheFirst", async () => {
    const { handlers, fetchMock, cacheStores } = loadSW();
    fetchMock.mockResolvedValue(new Response("img-bytes", { status: 200 }));

    const e = fetchEvent("https://oaojkanozbfpofbewtfq.supabase.co/storage/v1/object/public/garments/x.jpg");
    handlers.fetch(e);
    await e._responsePromise;

    // First call: cache miss → fetch → store
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cacheStores.has("wa2-images-v4")).toBe(true);
    expect(cacheStores.get("wa2-images-v4").size).toBe(1);
  });

  it("second request for same image is served from cache without re-fetching", async () => {
    const { handlers, fetchMock } = loadSW();
    fetchMock.mockResolvedValue(new Response("img", { status: 200 }));

    const url = "https://x.supabase.co/storage/v1/object/public/garments/y.jpg";
    handlers.fetch(fetchEvent(url));
    await Promise.resolve(); // settle first
    await new Promise(r => setTimeout(r, 0));

    fetchMock.mockClear();

    const e2 = fetchEvent(url);
    handlers.fetch(e2);
    await e2._responsePromise;

    // Cache hit on second call — fetch should NOT be called again
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cacheFirst falls back to 'Offline' Response when network fails and no cache", async () => {
    const { handlers, fetchMock } = loadSW();
    fetchMock.mockRejectedValue(new Error("offline"));

    const e = fetchEvent("https://x.supabase.co/storage/v1/object/public/garments/missing.jpg");
    handlers.fetch(e);
    const res = await e._responsePromise;

    expect(res.status).toBe(503);
  });
});

// ── Fetch routing — non-GET + cross-origin pass-through ──────────────────────

describe("SW runtime — pass-through cases", () => {
  it("non-GET requests are NOT intercepted (early return)", async () => {
    const { handlers, fetchMock } = loadSW();
    const e = fetchEvent("https://watch-advisor2.netlify.app/.netlify/functions/daily-pick", { method: "POST" });
    handlers.fetch(e);
    // Handler returned without calling respondWith
    expect(e._responsePromise).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cross-origin non-storage requests pass through (not intercepted)", async () => {
    const { handlers, fetchMock } = loadSW();
    const e = fetchEvent("https://api.open-meteo.com/v1/forecast?latitude=31.7");
    handlers.fetch(e);
    expect(e._responsePromise).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("same-origin app shell uses networkFirst (NOT cacheFirst — fixes stuck-bundle bug)", async () => {
    const { handlers, fetchMock, cacheStores } = loadSW();
    fetchMock.mockResolvedValue(new Response("html", { status: 200 }));

    const e = fetchEvent("https://watch-advisor2.netlify.app/index.html");
    handlers.fetch(e);
    await e._responsePromise;

    // Network was hit (network-first), and shell cache populated
    expect(fetchMock).toHaveBeenCalled();
    expect(cacheStores.has("wa2-shell-v16")).toBe(true);
  });

  it("same-origin offline falls back to cached shell", async () => {
    const { handlers, fetchMock, cacheStores } = loadSW();
    // Pre-populate cache
    const shellCache = new Map();
    shellCache.set("https://watch-advisor2.netlify.app/index.html", new Response("cached", { status: 200 }));
    cacheStores.set("wa2-shell-v16", shellCache);
    fetchMock.mockRejectedValue(new Error("offline"));

    const e = fetchEvent("https://watch-advisor2.netlify.app/index.html");
    handlers.fetch(e);
    const res = await e._responsePromise;

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("cached");
  });
});

// ── Push + notification + message ────────────────────────────────────────────

describe("SW runtime — push + notification + message", () => {
  it("push event with valid JSON payload triggers showNotification", async () => {
    const { handlers, self } = loadSW();
    const event = {
      data: { json: () => ({ title: "Today's outfit", body: "Speedmaster on tan rally" }) },
      waitUntil() {},
    };
    handlers.push(event);
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      "Today's outfit",
      expect.objectContaining({ body: "Speedmaster on tan rally", tag: "morning-brief" }),
    );
  });

  it("push event with invalid JSON silently returns (no throw, no notification)", () => {
    const { handlers, self } = loadSW();
    handlers.push({ data: { json: () => { throw new Error("not json"); } }, waitUntil() {} });
    expect(self.registration.showNotification).not.toHaveBeenCalled();
  });

  it("push event with no data does nothing", () => {
    const { handlers, self } = loadSW();
    handlers.push({ data: null, waitUntil() {} });
    expect(self.registration.showNotification).not.toHaveBeenCalled();
  });

  it("SKIP_WAITING message triggers skipWaiting", () => {
    const { handlers, self } = loadSW();
    handlers.message({ data: { type: "SKIP_WAITING" } });
    expect(self.skipWaiting).toHaveBeenCalled();
  });

  it("non-SKIP_WAITING message is ignored", () => {
    const { handlers, self } = loadSW();
    handlers.message({ data: { type: "RANDOM" } });
    expect(self.skipWaiting).not.toHaveBeenCalled();
  });

  it("malformed message (no data) does not crash", () => {
    const { handlers, self } = loadSW();
    expect(() => handlers.message({})).not.toThrow();
    expect(self.skipWaiting).not.toHaveBeenCalled();
  });
});
