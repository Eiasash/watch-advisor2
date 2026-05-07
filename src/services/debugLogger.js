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
      // serializeForLog handles Error, plain object, and primitive uniformly.
      // Falls back to msg for the human-readable summary.
      msg:     msg && msg !== "[object Object]" ? msg : serializeForLog(reason),
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
      msg:    args.map(a => (typeof a === "object" ? serializeForLog(a) : String(a))).join(" "),
    });
  };

  const _origConsoleWarn = console.warn.bind(console);
  console.warn = (...args) => {
    _origConsoleWarn(...args);
    pushDebugEntry({
      level:  "warn",
      source: "console",
      msg:    args.map(a => (typeof a === "object" ? serializeForLog(a) : String(a))).join(" "),
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

/**
 * Serialize an arbitrary value into a string suitable for the debug log.
 *
 * The naive `JSON.stringify` produces "{}" for Error instances because
 * `name`, `message`, and `stack` are non-enumerable in the spec. This was
 * the root cause of the 2026-05-07 mystery: every boot logged
 * `[ErrorBoundary] {} {"componentStack":"..."}` and we could see WHERE the
 * throw happened (the React component stack) but not WHAT the error was.
 *
 * Now:
 *   - Error → { name, message, stack, cause? } as a JSON string
 *   - Other objects → JSON.stringify with a defensive fallback to String()
 *   - Primitives → String()
 *
 * @param {unknown} obj
 * @returns {string}
 */
export function serializeForLog(obj) {
  if (obj instanceof Error) {
    const out = {
      name:    obj.name,
      message: obj.message,
      stack:   obj.stack,
    };
    // Some libs throw with a `.cause` chain; preserve one level of it
    if (obj.cause !== undefined) {
      out.cause = obj.cause instanceof Error
        ? { name: obj.cause.name, message: obj.cause.message }
        : obj.cause;
    }
    // Walk own enumerable keys to surface custom fields like .status, .code
    for (const k of Object.keys(obj)) {
      if (!(k in out)) out[k] = obj[k];
    }
    try { return JSON.stringify(out); } catch { return obj.message ?? String(obj); }
  }
  if (obj === null || obj === undefined) return String(obj);
  if (typeof obj === "object") {
    try {
      const s = JSON.stringify(obj);
      // An object that JSON-stringifies to "{}" is likely a host object or
      // has only non-enumerable props — fall back to `[object Tag]` form so
      // the log at least preserves the constructor name.
      if (s === "{}" && obj.constructor && obj.constructor !== Object) {
        return `[object ${obj.constructor.name}]`;
      }
      return s;
    } catch {
      return String(obj);
    }
  }
  return String(obj);
}
