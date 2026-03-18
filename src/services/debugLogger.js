/**
 * debugLogger — install once at app startup.
 * Patches window.onerror, unhandledrejection, console.error/warn,
 * and fetch (to capture Netlify function failures).
 *
 * Call initDebugLogger() from main.jsx before rendering.
 */
import { pushDebugEntry } from "../stores/debugStore.js";

let _installed = false;

export function initDebugLogger() {
  if (_installed) return;
  _installed = true;

  // ── Global JS errors ──────────────────────────────────────────────────────
  const _origError = window.onerror;
  window.onerror = (msg, src, line, col, err) => {
    pushDebugEntry({
      level:   "error",
      source:  "unhandled",
      msg:     String(msg),
      detail:  src ? `${src?.split("/").pop()}:${line}:${col}` : undefined,
      stack:   err?.stack ?? undefined,
    });
    return _origError ? _origError(msg, src, line, col, err) : false;
  };

  // ── Unhandled promise rejections ──────────────────────────────────────────
  window.addEventListener("unhandledrejection", e => {
    const reason = e.reason;
    const msg = reason?.message ?? String(reason);
    // Suppress fetch network errors that Netlify RUM fires for weather API
    // failures. These are already caught and logged as console.warn.
    if (
      msg === "Failed to fetch" ||
      msg === "Load failed" ||
      msg === "NetworkError when attempting to fetch resource." ||
      msg === "weather timeout" ||
      (reason instanceof TypeError && msg.toLowerCase().includes("fetch"))
    ) return;
    pushDebugEntry({
      level:   "error",
      source:  "unhandled",
      msg,
      stack:   reason?.stack ?? undefined,
    });
  });

  // ── console.error / console.warn ──────────────────────────────────────────
  const _origConsoleError = console.error.bind(console);
  console.error = (...args) => {
    _origConsoleError(...args);
    pushDebugEntry({
      level:  "error",
      source: "console",
      msg:    args.map(a => (typeof a === "object" ? tryStringify(a) : String(a))).join(" "),
    });
  };

  const _origConsoleWarn = console.warn.bind(console);
  console.warn = (...args) => {
    _origConsoleWarn(...args);
    pushDebugEntry({
      level:  "warn",
      source: "console",
      msg:    args.map(a => (typeof a === "object" ? tryStringify(a) : String(a))).join(" "),
    });
  };

  // ── Fetch interceptor — Netlify function failures only ───────────────────
  const _origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    const isNetlify = url.includes("/.netlify/functions/");

    const res = await _origFetch(input, init);

    if (isNetlify && !res.ok) {
      // Clone so the caller can still read body
      const clone = res.clone();
      clone.text().then(body => {
        const fn = url.split("/").pop()?.split("?")[0] ?? url;
        pushDebugEntry({
          level:  "error",
          source: "network",
          msg:    `[${fn}] HTTP ${res.status}`,
          detail: body.slice(0, 300) || undefined,
          url,
          status: res.status,
        });
      }).catch(() => {});
    }

    return res;
  };
}

function tryStringify(obj) {
  try { return JSON.stringify(obj); } catch { return String(obj); }
}
