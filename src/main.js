import { StrictMode, createElement } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/AppShell.jsx";
import { initDebugLogger } from "./services/debugLogger.js";

// Init debug logger before anything else so we capture startup errors
initDebugLogger();

createRoot(document.getElementById("root")).render(
  createElement(StrictMode, null, createElement(App))
);

// ── Service Worker registration ───────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      if (import.meta.env.DEV) console.log("[SW] registered, scope:", reg.scope);

      // Detect when a new SW is waiting (app updated) — reload to activate it
      reg.addEventListener("updatefound", () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener("statechange", () => {
          if (incoming.state === "installed" && navigator.serviceWorker.controller) {
            // New SW is ready — tell it to skip waiting, then reload
            incoming.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });

      // When SW controller changes (new SW took over), reload once
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) { refreshing = true; window.location.reload(); }
      });

    } catch (err) {
      console.warn("[SW] registration failed:", err);
    }
  });
}
