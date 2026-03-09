/**
 * Client-side push notification service.
 * Handles SW registration, permission, subscribe/unsubscribe.
 */

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

  // Save to server
  const res = await fetch("/.netlify/functions/push-subscribe", {
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

  await fetch("/.netlify/functions/push-subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });

  await sub.unsubscribe();
}
