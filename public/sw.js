/**
 * Watch Advisor 2 — Service Worker
 * Strategy:
 *   - App shell (HTML, JS, CSS, fonts, icons): Cache-First
 *   - Netlify functions (/.netlify/functions/*): Network-First, fallback to stale
 *   - Images (Supabase Storage): Cache-First, cache up to 200 items
 *   - Push notifications: same as before
 */

const SHELL_CACHE  = "wa2-shell-v2";
const IMAGE_CACHE  = "wa2-images-v2";
const API_CACHE    = "wa2-api-v2";
const MAX_IMAGES   = 200;

const SHELL_URLS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// ── Lifecycle ─────────────────────────────────────────────────────────────────
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_URLS)).catch(() => {})
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
    e.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // App shell / assets → Cache-First
  if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(request, SHELL_CACHE));
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
