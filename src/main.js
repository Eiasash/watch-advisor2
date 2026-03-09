import { StrictMode, createElement } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/AppShell.jsx";

createRoot(document.getElementById("root")).render(
  createElement(StrictMode, null, createElement(App))
);

// ── Service Worker registration ───────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then(reg => console.log("[SW] registered, scope:", reg.scope))
      .catch(err => console.warn("[SW] registration failed:", err));
  });
}
