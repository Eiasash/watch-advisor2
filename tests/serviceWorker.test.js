import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const SW_PATH = resolve(__dirname, "../public/sw.js");
const sw = readFileSync(SW_PATH, "utf-8");

// ── Cache Configuration ──────────────────────────────────────────────────────

describe("serviceWorker — cache configuration", () => {
  it("defines three separate caches", () => {
    expect(sw).toMatch(/SHELL_CACHE\s*=\s*["']wa2-shell-v\d+["']/);
    expect(sw).toMatch(/IMAGE_CACHE\s*=\s*["']wa2-images-v\d+["']/);
    expect(sw).toMatch(/API_CACHE\s*=\s*["']wa2-api-v\d+["']/);
  });

  it("limits image cache to MAX_IMAGES items", () => {
    const match = sw.match(/MAX_IMAGES\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBe(200);
  });

  it("defines SHELL_URLS with required assets", () => {
    expect(sw).toContain("/manifest.json");
    expect(sw).toContain("/icon-192.png");
    expect(sw).toContain("/icon-512.png");
  });

  it("all precached shell files exist on disk", () => {
    const publicDir = resolve(__dirname, "../public");
    const files = ["manifest.json", "icon-192.png", "icon-512.png"];
    for (const file of files) {
      expect(
        existsSync(resolve(publicDir, file)),
        `Expected ${file} to exist in public/`,
      ).toBe(true);
    }
  });
});

// ── Install Event ────────────────────────────────────────────────────────────

describe("serviceWorker — install event", () => {
  it("listens for install event", () => {
    expect(sw).toMatch(/addEventListener\s*\(\s*["']install["']/);
  });

  it("does NOT call skipWaiting immediately (user-triggered update)", () => {
    // skipWaiting is deferred, not in the install handler directly
    // Instead it uses a setTimeout safety net
    expect(sw).toContain("setTimeout(() => self.skipWaiting()");
  });

  it("has 30-second safety net for auto-activation", () => {
    expect(sw).toContain("30000");
  });

  it("opens SHELL_CACHE and precaches SHELL_URLS", () => {
    expect(sw).toContain("caches.open(SHELL_CACHE)");
    expect(sw).toContain("c.addAll(SHELL_URLS)");
  });
});

// ── Activate Event ───────────────────────────────────────────────────────────

describe("serviceWorker — activate event", () => {
  it("listens for activate event", () => {
    expect(sw).toMatch(/addEventListener\s*\(\s*["']activate["']/);
  });

  it("deletes old caches not in the allowed set", () => {
    expect(sw).toContain("caches.keys()");
    expect(sw).toContain("caches.delete");
    // Checks that all three caches are preserved
    expect(sw).toContain("SHELL_CACHE");
    expect(sw).toContain("IMAGE_CACHE");
    expect(sw).toContain("API_CACHE");
  });

  it("claims clients after activation", () => {
    expect(sw).toContain("self.clients.claim()");
  });
});

// ── Fetch Event — Routing ────────────────────────────────────────────────────

describe("serviceWorker — fetch routing", () => {
  it("listens for fetch event", () => {
    expect(sw).toMatch(/addEventListener\s*\(\s*["']fetch["']/);
  });

  it("ignores non-GET requests", () => {
    expect(sw).toContain('request.method !== "GET"');
  });

  it("routes Supabase storage images to cache-first", () => {
    expect(sw).toContain("supabase.co");
    expect(sw).toContain("/storage/");
    expect(sw).toContain("cacheFirst(request, IMAGE_CACHE, MAX_IMAGES)");
  });

  it("routes Netlify functions to network-first", () => {
    expect(sw).toContain("/.netlify/functions/");
    expect(sw).toContain("networkFirst(request, API_CACHE)");
  });

  it("routes same-origin requests to network-first with shell cache", () => {
    expect(sw).toContain("url.origin === self.location.origin");
    expect(sw).toContain("networkFirst(request, SHELL_CACHE)");
  });
});

// ── Cache Strategies ─────────────────────────────────────────────────────────

describe("serviceWorker — cache strategies", () => {
  it("defines cacheFirst async function", () => {
    expect(sw).toMatch(/async\s+function\s+cacheFirst/);
  });

  it("cacheFirst returns cached response if available", () => {
    expect(sw).toContain("cache.match(request)");
    expect(sw).toContain("if (cached) return cached");
  });

  it("cacheFirst prunes cache before adding new items", () => {
    expect(sw).toContain("pruneCache(cache, maxItems");
  });

  it("defines networkFirst async function", () => {
    expect(sw).toMatch(/async\s+function\s+networkFirst/);
  });

  it("networkFirst caches successful responses", () => {
    expect(sw).toContain("response.ok");
    expect(sw).toContain("cache.put(request, response.clone())");
  });

  it("networkFirst returns offline JSON when both network and cache fail", () => {
    expect(sw).toContain('{ error: "Offline" }');
    expect(sw).toContain("503");
  });
});

// ── Cache Pruning (LRU) ─────────────────────────────────────────────────────

describe("serviceWorker — cache pruning", () => {
  it("defines pruneCache async function", () => {
    expect(sw).toMatch(/async\s+function\s+pruneCache/);
  });

  it("gets all cache keys", () => {
    expect(sw).toContain("cache.keys()");
  });

  it("removes oldest entries when over maxItems", () => {
    expect(sw).toContain("keys.length > maxItems");
    expect(sw).toContain("keys.slice(0, keys.length - maxItems)");
    expect(sw).toContain("cache.delete");
  });
});

// ── Push Notifications ───────────────────────────────────────────────────────

describe("serviceWorker — push notifications", () => {
  it("listens for push events", () => {
    expect(sw).toMatch(/addEventListener\s*\(\s*["']push["']/);
  });

  it("parses push data as JSON", () => {
    expect(sw).toContain("e.data.json()");
  });

  it("shows notification with defaults", () => {
    expect(sw).toContain("Watch Advisor");
    expect(sw).toContain("self.registration.showNotification");
  });

  it("uses morning-brief tag", () => {
    expect(sw).toContain("morning-brief");
  });

  it("uses vibrate pattern", () => {
    expect(sw).toContain("[100, 50, 100]");
  });
});

// ── Notification Click ───────────────────────────────────────────────────────

describe("serviceWorker — notification click", () => {
  it("listens for notificationclick event", () => {
    expect(sw).toMatch(/addEventListener\s*\(\s*["']notificationclick["']/);
  });

  it("closes notification on click", () => {
    expect(sw).toContain("e.notification.close()");
  });

  it("focuses existing watch-advisor2 window", () => {
    expect(sw).toContain("watch-advisor2.netlify.app");
    expect(sw).toContain("existing.focus()");
  });

  it("opens new window if no existing window found", () => {
    expect(sw).toContain("self.clients.openWindow");
  });
});

// ── Message Handling ─────────────────────────────────────────────────────────

describe("serviceWorker — message handling", () => {
  it("listens for message events", () => {
    expect(sw).toMatch(/addEventListener\s*\(\s*["']message["']/);
  });

  it("handles SKIP_WAITING message", () => {
    expect(sw).toContain("SKIP_WAITING");
    expect(sw).toContain("self.skipWaiting()");
  });
});

// ── Overall Structure ────────────────────────────────────────────────────────

describe("serviceWorker — overall structure", () => {
  it("has all 5 required event listeners", () => {
    const events = ["install", "activate", "fetch", "push", "notificationclick", "message"];
    for (const event of events) {
      expect(
        sw,
        `Expected event listener for '${event}'`,
      ).toMatch(new RegExp(`addEventListener\\s*\\(\\s*["']${event}["']`));
    }
  });

  it("does not use eval()", () => {
    // Skip eval in regex contexts by checking for standalone eval(
    expect(sw).not.toMatch(/[^a-zA-Z]eval\s*\(/);
  });

  it("does not use importScripts with external URLs", () => {
    expect(sw).not.toContain("importScripts");
  });
});
