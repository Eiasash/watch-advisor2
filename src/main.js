import { StrictMode, createElement, Component } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/AppShell.jsx";
import { initDebugLogger } from "./services/debugLogger.js";

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
