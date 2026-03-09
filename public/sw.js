/**
 * Watch Advisor 2 — Service Worker
 * Handles push notifications and notification click routing.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

// ── Push received ────────────────────────────────────────────────────────────
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
      tag: "morning-brief",          // replaces any previous brief notification
      renotify: true,
    })
  );
});

// ── Notification click ───────────────────────────────────────────────────────
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
