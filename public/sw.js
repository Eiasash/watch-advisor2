/**
 * Watch Advisor 2 — Service Worker
 * Strategy:
 *   - App shell (HTML, JS, CSS, fonts, icons): Cache-First
 *   - Netlify functions (/.netlify/functions/*): Network-First, fallback to stale
 *   - Images (Supabase Storage): Cache-First, cache up to 200 items
 *   - Push notifications: same as before
 */

const SHELL_CACHE  = "wa2-shell-v10";
const IMAGE_CACHE  = "wa2-images-v4";
const API_CACHE    = "wa2-api-v4";
const MAX_IMAGES   = 200;

// Functions whose responses are per-user / non-deterministic — never cache.
// Caching Claude responses cross-session can leak recommendations between
// users on a shared browser, and for a single user, serving yesterday's
// "today outfit" from cache while offline is worse UX than an honest error.
const NO_CACHE_FUNCTIONS = new Set([
  "claude-stylist","wardrobe-chat","style-dna","bulk-tag","classify-image",
  "ai-audit","occasion-planner","selfie-check","detect-duplicate","extract-outfit",
  "relabel-garment","verify-garment-photo","watch-id","watch-value",
  "generate-embedding","daily-pick","monthly-report","push-brief","seasonal-audit",
  "skill-snapshot","github-pat","run-migrations","push-subscribe",
]);
function isUncachedFunction(pathname){
  const m = pathname.match(/^\/\.netlify\/functions\/([^/?]+)/);
  return m ? NO_CACHE_FUNCTIONS.has(m[1]) : false;
}

const SHELL_URLS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// ── Lifecycle ─────────────────────────────────────────────────────────────────
self.addEventListener("install", e => {
  // Do NOT call self.skipWaiting() here — let the UpdateBanner detect the
  // waiting SW and prompt the user. The user taps "Update Now" which sends
  // SKIP_WAITING via postMessage (handled at bottom of file).
  // Safety net: auto-activate after 30s if user never taps the banner
  // (e.g. banner not visible, app in background tab, stale page).
  setTimeout(() => self.skipWaiting(), 30000);
  e.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_URLS)).catch(err => {
      console.warn("[SW] shell precache failed:", err);
    })
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => ![SHELL_CACHE, IMAGE_CACHE, API_CACHE].includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", e => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin non-storage requests
  if (request.method !== "GET") return;

  // Supabase Storage images → Cache-First (long-lived CDN)
  if (url.hostname.endsWith("supabase.co") && url.pathname.includes("/storage/")) {
    e.respondWith(cacheFirst(request, IMAGE_CACHE, MAX_IMAGES));
    return;
  }

  // Netlify functions → Network-First (always fresh), stale fallback
  if (url.pathname.startsWith("/.netlify/functions/")) {
    if (isUncachedFunction(url.pathname)) {
      // Pass through without caching — per-user / non-deterministic responses
      // (Claude, push-subscribe, GitHub PAT, migrations). Offline returns an
      // explicit error instead of a stale cross-session response.
      e.respondWith(fetch(request).catch(() => new Response(
        JSON.stringify({ error: "Offline", code: "NO_CACHE_FUNCTION" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )));
      return;
    }
    e.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // App shell — all same-origin requests use network-first.
  // Hashed JS/CSS bundles LOOK immutable but broken builds can get stuck in cache
  // if a bad version was cached before the fix was deployed. Network-first ensures
  // the browser always checks for a fresh copy; fallback to cache if offline.
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }
});

// ── Strategies ────────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      if (maxItems) await pruneCache(cache, maxItems - 1);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached ?? new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached ?? new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function pruneCache(cache, maxItems) {
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await Promise.all(keys.slice(0, keys.length - maxItems).map(k => cache.delete(k)));
  }
}

// ── Push received ─────────────────────────────────────────────────────────────
self.addEventListener("push", e => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch { return; }

  const { title = "Watch Advisor", body = "", icon = "/icon-192.png", badge = "/icon-96.png", data = {} } = payload;

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data,
      vibrate: [100, 50, 100],
      requireInteraction: false,
      tag: "morning-brief",
      renotify: true,
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = e.notification.data?.url ?? "https://watch-advisor2.netlify.app/";

  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes("watch-advisor2.netlify.app"));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

// ── Update on demand ──────────────────────────────────────────────────────────
self.addEventListener("message", e => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
