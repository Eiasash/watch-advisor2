import { describe, it, expect, vi, beforeEach } from "vitest";

// Reset module state between tests by reimporting
let setSyncState, getSyncState, subscribeSyncState, emit;

// Dynamic import to get fresh module (the state is module-scoped)
beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../src/services/supabaseSyncState.js");
  setSyncState = mod.setSyncState;
  getSyncState = mod.getSyncState;
  subscribeSyncState = mod.subscribeSyncState;
  emit = mod.emit;
});

describe("supabaseSyncState", () => {
  it("getSyncState returns default idle state", () => {
    const state = getSyncState();
    expect(state.status).toBe("idle");
    expect(state.queued).toBe(0);
  });

  it("setSyncState patches status", () => {
    setSyncState({ status: "pulling" });
    expect(getSyncState().status).toBe("pulling");
    expect(getSyncState().queued).toBe(0);
  });

  it("setSyncState patches queued counter", () => {
    setSyncState({ queued: 3 });
    expect(getSyncState().queued).toBe(3);
    expect(getSyncState().status).toBe("idle");
  });

  it("setSyncState merges without clobbering other fields", () => {
    setSyncState({ status: "pulling" });
    setSyncState({ queued: 2 });
    const state = getSyncState();
    expect(state.status).toBe("pulling");
    expect(state.queued).toBe(2);
  });

  it("subscribeSyncState calls listener immediately with current state", () => {
    const listener = vi.fn();
    subscribeSyncState(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: "idle", queued: 0 }));
  });

  it("subscribeSyncState listener is called on setSyncState", () => {
    const listener = vi.fn();
    subscribeSyncState(listener);
    listener.mockClear();
    setSyncState({ status: "error" });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
  });

  it("unsubscribe stops listener from being called", () => {
    const listener = vi.fn();
    const unsub = subscribeSyncState(listener);
    listener.mockClear();
    unsub();
    setSyncState({ status: "pulling" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("multiple listeners all receive updates", () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    subscribeSyncState(l1);
    subscribeSyncState(l2);
    l1.mockClear();
    l2.mockClear();
    setSyncState({ status: "error" });
    expect(l1).toHaveBeenCalled();
    expect(l2).toHaveBeenCalled();
  });

  it("emit sends current state snapshot (not reference)", () => {
    const states = [];
    subscribeSyncState(s => states.push(s));
    setSyncState({ queued: 1 });
    setSyncState({ queued: 2 });
    // First call is from subscribe itself, then 2 from setSyncState
    expect(states.length).toBe(3);
    expect(states[1].queued).toBe(1);
    expect(states[2].queued).toBe(2);
    // Mutating returned object should not affect internal state
    states[2].queued = 999;
    expect(getSyncState().queued).toBe(2);
  });
});
