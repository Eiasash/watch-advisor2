import { StrictMode, createElement, Component } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/AppShell.jsx";
import { initDebugLogger } from "./services/debugLogger.js";
import { pushDebugEntry } from "./stores/debugStore.js";

// Build stamp — survives tree-shaking by writing to window (side-effect).
// Bump to force Netlify to produce a new bundle hash.
window.__WA2_BUILD = "20260614-1";
// Init debug logger before anything else so we capture startup errors
initDebugLogger();

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    // Bypass the patched console.error path entirely. JSON.stringify produces
    // "{}" for Error instances (name/message/stack are non-enumerable), and
    // before v1.13.19 that was the only logging path — the 2026-05-07 debug
    // bundle showed two identical `[ErrorBoundary] {}` lines per boot with
    // zero diagnostic content beyond the (minified) component stack. Now we
    // unpack the Error explicitly and push directly to debugStore.
    const errFields = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { rawType: typeof error, raw: String(error) };
    pushDebugEntry({
      level:   "error",
      source:  "react",
      msg:     `[ErrorBoundary] ${errFields.name ?? "non-Error throw"}: ${errFields.message ?? errFields.raw ?? "(no message)"}`,
      stack:   errFields.stack,
      detail:  info?.componentStack ?? undefined,
    });
    // Also log to the real console (NOT the patched one) so prod debugging
    // tools still see something readable.
    if (typeof window !== "undefined" && window.console) {
      // eslint-disable-next-line no-console
      window.console.error("[ErrorBoundary]", errFields, info?.componentStack);
    }
  }
  render() {
    if (this.state.error) {
      const reloadApp = () => window.location.reload();
      const resetAppShell = async () => {
        try {
          if ("serviceWorker" in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
          }
          if ("caches" in window) {
            const names = await caches.keys();
            await Promise.all(names.map(name => caches.delete(name)));
          }
          sessionStorage.removeItem("wa2-sw-reloads");
          sessionStorage.removeItem("wa2-nuke-reload");
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[ErrorBoundary] app-shell reset failed", err);
        } finally {
          window.location.reload();
        }
      };
      return createElement("div", {
        role: "alert",
        style: {
          minHeight: "100vh",
          padding: 28,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#fecaca",
          background: "#0f1117",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
        }
      },
        createElement("div", {
          style: {
            width: "100%",
            maxWidth: 460,
            border: "1px solid #7f1d1d",
            borderRadius: 14,
            padding: 18,
            background: "#171a21",
          }
        },
          createElement("h2", { style: { margin: "0 0 8px", color: "#fca5a5", fontSize: 22 } }, "Watch Advisor needs a refresh"),
          createElement("p", { style: { margin: "0 0 14px", color: "#cbd5e1", lineHeight: 1.5, fontSize: 14 } },
            "The app shell crashed. Your wardrobe data is not touched by these recovery buttons."
          ),
          createElement("pre", { style: {
            margin: "0 0 16px",
            padding: 10,
            borderRadius: 10,
            background: "#0f131a",
            color: "#fca5a5",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            overflowX: "auto",
          } },
            this.state.error?.message ?? String(this.state.error)
          ),
          createElement("div", { style: { display: "grid", gap: 8 } },
            createElement("button", {
              onClick: () => this.setState({ error: null }),
              style: {
                minHeight: 44,
                padding: "10px 16px",
                cursor: "pointer",
                border: "none",
                borderRadius: 10,
                background: "#2563eb",
                color: "#fff",
                fontWeight: 800,
              }
            }, "Retry"),
            createElement("button", {
              onClick: reloadApp,
              style: {
                minHeight: 44,
                padding: "10px 16px",
                cursor: "pointer",
                border: "1px solid #334155",
                borderRadius: 10,
                background: "transparent",
                color: "#e2e8f0",
                fontWeight: 700,
              }
            }, "Reload app"),
            createElement("button", {
              onClick: resetAppShell,
              style: {
                minHeight: 44,
                padding: "10px 16px",
                cursor: "pointer",
                border: "1px solid #7f1d1d",
                borderRadius: 10,
                background: "#2a0c0c",
                color: "#fecaca",
                fontWeight: 700,
              }
            }, "Clear app shell cache")
          )
        )
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
      // If the tab boots with no controller, the FIRST controllerchange will
      // be the SW gaining control of this page — a first install, no reload
      // needed (page already rendered correctly from network). But a LATER
      // controllerchange in the same long-lived tab comes from a real update
      // (UpdateBanner polling, 30s safety net) and DOES need a reload so the
      // user picks up the new bundle.
      //
      // Track this as a one-shot "skip" flag. Codex P2 on #225 caught the
      // earlier "stays false forever" version which regressed the update
      // path for sessions first-installed in the same tab.
      let pendingFirstInstallSkip = !navigator.serviceWorker.controller;

      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      if (import.meta.env.DEV) console.log("[SW] registered, scope:", reg.scope);

      // Detect when a new SW is waiting (app updated) — it already called skipWaiting()
      // in its install event, so controllerchange will fire automatically.
      // Keep this listener for logging/debugging only.
      reg.addEventListener("updatefound", () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener("statechange", () => {
          if (import.meta.env.DEV && incoming.state === "installed") {
            if (import.meta.env.DEV) console.log("[SW] new SW installed, skipWaiting already called");
          }
        });
      });

      // When SW controller changes, reload — but consume the first-install
      // event (no reload needed on initial uncontrolled→controlled transition).
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (pendingFirstInstallSkip) {
          pendingFirstInstallSkip = false; // consume — future events reload
          return;
        }
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });

    } catch (err) {
      console.warn("[SW] registration failed:", err);
    }
  });
}
