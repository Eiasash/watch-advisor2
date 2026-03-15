import { StrictMode, createElement, Component } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/AppShell.jsx";
import { initDebugLogger } from "./services/debugLogger.js";

// Build stamp — bump to force Netlify to produce a new bundle hash
// when deploy deduplication would otherwise reuse a broken cached build.
export const BUILD_STAMP = "20260315-2";
// Init debug logger before anything else so we capture startup errors
initDebugLogger();

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.error) {
      return createElement("div", {
        style: { padding: 32, fontFamily: "system-ui, sans-serif", color: "#dc2626" }
      },
        createElement("h2", null, "Something went wrong"),
        createElement("pre", { style: { fontSize: 12, whiteSpace: "pre-wrap" } },
          this.state.error?.message ?? String(this.state.error)
        ),
        createElement("button", {
          onClick: () => this.setState({ error: null }),
          style: { marginTop: 16, padding: "8px 16px", cursor: "pointer" }
        }, "Retry")
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  createElement(StrictMode, null,
    createElement(ErrorBoundary, null, createElement(App))
  )
);

// ── Service Worker registration ───────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    // Reload-loop guard: if the page has reloaded more than 3 times
    // within 10 seconds, stop registering the SW to break the cycle.
    const now = Date.now();
    const RL_KEY = "wa2-sw-reloads";
    const RL_WINDOW = 10000;
    const RL_MAX = 3;
    try {
      const hist = JSON.parse(sessionStorage.getItem(RL_KEY) || "[]")
        .filter(t => now - t < RL_WINDOW);
      hist.push(now);
      sessionStorage.setItem(RL_KEY, JSON.stringify(hist));
      if (hist.length > RL_MAX) {
        console.error("[SW] reload loop detected — skipping registration");
        // Unregister all SWs to break the loop
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
        return;
      }
    } catch { /* sessionStorage blocked — proceed normally */ }

    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      if (import.meta.env.DEV) console.log("[SW] registered, scope:", reg.scope);

      // Detect when a new SW is waiting (app updated) — tell it to activate
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
