/**
 * Client-side push notification service.
 * Handles SW registration, permission, subscribe/unsubscribe.
 */

import { authedFetch } from "./authedFetch.js";

const VAPID_PUBLIC_KEY = "BBWi0RnrKdXH-CBLPn_KLUrX7prcp_mP8GrbV_MeOW4IG1ZX4SxZN9Kh4tXYDZy-GwibkLwD5Y3Ou5YUd8ObMGc";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getSubscriptionStatus() {
  if (!(await isPushSupported())) return "unsupported";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return "unsubscribed";
  const perm = Notification.permission;
  return perm === "granted" ? "subscribed" : "denied";
}

export async function subscribePush(deviceName) {
  const reg = await navigator.serviceWorker.ready;

  // Request permission
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permission denied");

  // Subscribe via PushManager
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  // Save to server (POST is auth-gated since v1.13.16 — must send JWT)
  const res = await authedFetch("/.netlify/functions/push-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), deviceName }),
  });
  if (!res.ok) throw new Error("Server save failed");
  return sub;
}

export async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const res = await fetch("/.netlify/functions/push-subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  // Don't proceed to local unsubscribe if the server delete failed — we'd
  // leave an orphan push_subscriptions row that the push-brief cron keeps
  // targeting. 404 = already gone server-side, treat as success. (F-b-2 fix.)
  if (!res.ok && res.status !== 404) {
    throw new Error(`Server unsubscribe failed: ${res.status}`);
  }

  await sub.unsubscribe();
}
