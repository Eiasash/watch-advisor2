import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock debugStore — capture pushDebugEntry calls
const pushCalls = [];
vi.mock("../src/stores/debugStore.js", () => ({
  pushDebugEntry: vi.fn((entry) => pushCalls.push(entry)),
}));

describe("debugLogger", () => {
  let origOnerror, origConsoleError, origConsoleWarn, origFetch;

  beforeEach(() => {
    pushCalls.length = 0;
    // Save originals (they may have been patched by initDebugLogger)
    origOnerror = window.onerror;
    origConsoleError = console.error;
    origConsoleWarn = console.warn;
    origFetch = window.fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initDebugLogger can be called without throwing", async () => {
    const { initDebugLogger } = await import("../src/services/debugLogger.js");
    expect(() => initDebugLogger()).not.toThrow();
  });

  it("initDebugLogger is idempotent (second call is no-op)", async () => {
    const { initDebugLogger } = await import("../src/services/debugLogger.js");
    initDebugLogger();
    initDebugLogger(); // should not double-patch
    // No error = success
  });
});

describe("debugLogger — tryStringify coverage", () => {
  it("console.error with object argument stringifies it", async () => {
    // initDebugLogger already ran from above, console.error is patched
    const { initDebugLogger } = await import("../src/services/debugLogger.js");
    initDebugLogger();
    // Temporarily suppress actual console output
    const realError = console.error;
    console.error({ key: "value" });
    // pushDebugEntry should have been called with stringified object
    const lastCall = pushCalls[pushCalls.length - 1];
    expect(lastCall).toBeTruthy();
    expect(lastCall.level).toBe("error");
    expect(lastCall.source).toBe("console");
  });

  it("console.warn captures warning entries", async () => {
    const { initDebugLogger } = await import("../src/services/debugLogger.js");
    initDebugLogger();
    console.warn("test warning");
    const lastCall = pushCalls[pushCalls.length - 1];
    expect(lastCall.level).toBe("warn");
    expect(lastCall.msg).toContain("test warning");
  });
});

// ─── window.onerror handler ───────────────────────────────────────────────────

describe("debugLogger — window.onerror handler", () => {
  beforeEach(async () => {
    pushCalls.length = 0;
    vi.resetModules();
    const { initDebugLogger } = await import("../src/services/debugLogger.js");
    initDebugLogger();
    pushCalls.length = 0; // discard any calls from initDebugLogger itself
  });

  it("logs unhandled errors via window.onerror", () => {
    window.onerror("Something went wrong", "bundle.js", 42, 10, new Error("crash"));
    const entry = pushCalls.find(c => c.level === "error" && c.source === "unhandled");
    expect(entry).toBeDefined();
    expect(entry.msg).toBe("Something went wrong");
  });

  it("includes file:line:col in detail when src is provided", () => {
    window.onerror("err", "https://app.com/bundle.js", 10, 5, null);
    const entry = pushCalls[pushCalls.length - 1];
    expect(entry.detail).toBe("bundle.js:10:5");
  });

  it("detail is undefined when src is empty", () => {
    window.onerror("err", "", 1, 1, null);
    const entry = pushCalls[pushCalls.length - 1];
    expect(entry.detail).toBeUndefined();
  });

  it("includes stack trace when error object provided", () => {
    const err = new Error("test crash");
    window.onerror("test crash", "app.js", 1, 1, err);
    const entry = pushCalls[pushCalls.length - 1];
    expect(entry.stack).toBe(err.stack);
  });

  it("stack is undefined when no error object provided", () => {
    window.onerror("error message", "app.js", 1, 1, null);
    const entry = pushCalls[pushCalls.length - 1];
    expect(entry.stack).toBeUndefined();
  });
});

// ─── unhandledrejection handler ───────────────────────────────────────────────

describe("debugLogger — unhandledrejection handler", () => {
  beforeEach(async () => {
    pushCalls.length = 0;
    vi.resetModules();
    const { initDebugLogger } = await import("../src/services/debugLogger.js");
    initDebugLogger();
    pushCalls.length = 0;
  });

  it("logs unhandled promise rejections", () => {
    const evt = new Event("unhandledrejection");
    evt.reason = new Error("async operation failed");
    window.dispatchEvent(evt);
    const entry = pushCalls.find(c => c.level === "error" && c.source === "unhandled");
    expect(entry).toBeDefined();
    expect(entry.msg).toBe("async operation failed");
  });

  it("suppresses 'Failed to fetch' rejections", () => {
    const evt = new Event("unhandledrejection");
    evt.reason = { message: "Failed to fetch" };
    window.dispatchEvent(evt);
    expect(pushCalls.filter(c => c.source === "unhandled")).toHaveLength(0);
  });

  it("suppresses 'Load failed' rejections", () => {
    const evt = new Event("unhandledrejection");
    evt.reason = { message: "Load failed" };
    window.dispatchEvent(evt);
    expect(pushCalls.filter(c => c.source === "unhandled")).toHaveLength(0);
  });

  it("suppresses 'weather timeout' rejections", () => {
    const evt = new Event("unhandledrejection");
    evt.reason = { message: "weather timeout" };
    window.dispatchEvent(evt);
    expect(pushCalls.filter(c => c.source === "unhandled")).toHaveLength(0);
  });

  it("suppresses TypeError fetch errors", () => {
    const evt = new Event("unhandledrejection");
    evt.reason = new TypeError("fetch failed due to network");
    window.dispatchEvent(evt);
    expect(pushCalls.filter(c => c.source === "unhandled")).toHaveLength(0);
  });

  it("includes stack trace for Error rejections", () => {
    const err = new Error("deep async error");
    const evt = new Event("unhandledrejection");
    evt.reason = err;
    window.dispatchEvent(evt);
    expect(pushCalls[0].stack).toBe(err.stack);
  });

  it("handles rejection with non-object reason (string)", () => {
    const evt = new Event("unhandledrejection");
    evt.reason = "raw string rejection";
    window.dispatchEvent(evt);
    const entry = pushCalls.find(c => c.source === "unhandled");
    expect(entry).toBeDefined();
    expect(entry.msg).toBe("raw string rejection");
  });
});

// ─── fetch interceptor ────────────────────────────────────────────────────────

describe("debugLogger — fetch interceptor", () => {
  let origFetch;

  beforeEach(async () => {
    pushCalls.length = 0;
    origFetch = window.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    window.fetch = origFetch;
  });

  it("logs Netlify function failures (non-2xx)", async () => {
    window.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      clone: () => ({ text: () => Promise.resolve("Internal Server Error") }),
    });
    const { initDebugLogger } = await import("../src/services/debugLogger.js");
    initDebugLogger();
    pushCalls.length = 0;

    await window.fetch("/.netlify/functions/my-function");
    await new Promise(r => setTimeout(r, 20));

    const entry = pushCalls.find(c => c.source === "network");
    expect(entry).toBeDefined();
    expect(entry.status).toBe(500);
    expect(entry.msg).toContain("my-function");
  });

  it("does not log successful Netlify calls", async () => {
    window.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const { initDebugLogger } = await import("../src/services/debugLogger.js");
    initDebugLogger();
    pushCalls.length = 0;

    const res = await window.fetch("/.netlify/functions/daily-pick");
    await new Promise(r => setTimeout(r, 10));

    expect(res.ok).toBe(true);
    expect(pushCalls.filter(c => c.source === "network")).toHaveLength(0);
  });

  it("does not log non-Netlify URL failures", async () => {
    window.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const { initDebugLogger } = await import("../src/services/debugLogger.js");
    initDebugLogger();
    pushCalls.length = 0;

    await window.fetch("https://api.openweathermap.org/data/2.5/weather");
    await new Promise(r => setTimeout(r, 10));

    expect(pushCalls.filter(c => c.source === "network")).toHaveLength(0);
  });

  it("accepts Request-like object as input", async () => {
    window.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const { initDebugLogger } = await import("../src/services/debugLogger.js");
    initDebugLogger();
    pushCalls.length = 0;

    // Input is an object with a url property (Request-like)
    await window.fetch({ url: "/.netlify/functions/test" });
    await new Promise(r => setTimeout(r, 10));

    expect(pushCalls.filter(c => c.source === "network")).toHaveLength(0); // ok=true
  });

  it("logs body snippet in detail for failed calls", async () => {
    window.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      clone: () => ({ text: () => Promise.resolve("Validation failed: field required") }),
    });
    const { initDebugLogger } = await import("../src/services/debugLogger.js");
    initDebugLogger();
    pushCalls.length = 0;

    await window.fetch("/.netlify/functions/validate");
    await new Promise(r => setTimeout(r, 20));

    const entry = pushCalls.find(c => c.source === "network");
    expect(entry).toBeDefined();
    expect(entry.detail).toContain("Validation failed");
  });
});
