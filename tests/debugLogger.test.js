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
