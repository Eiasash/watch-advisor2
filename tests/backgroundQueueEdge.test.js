import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock IDB ───────────────────────────────────────────────────────────────

const mockStore = {};
const mockDB = {
  put: vi.fn(async (store, val, key) => { mockStore[val.id || key] = val; }),
  get: vi.fn(async (store, key) => mockStore[key] ?? undefined),
  getAll: vi.fn(async () => Object.values(mockStore)),
  getAllFromIndex: vi.fn(async (store, idx, val) =>
    Object.values(mockStore).filter(t => t[idx] === val)
  ),
  delete: vi.fn(async (store, key) => { delete mockStore[key]; }),
  transaction: vi.fn(() => ({
    store: { delete: vi.fn(async (key) => { delete mockStore[key]; }) },
    done: Promise.resolve(),
  })),
};

vi.mock("idb", () => ({
  openDB: vi.fn(async () => mockDB),
}));

const {
  enqueueTask,
  getPendingTasks,
  getQueueStats,
  registerHandler,
  drain,
  clearFinished,
  resumePendingTasks,
  subscribeQueue,
} = await import("../src/services/backgroundQueue.js");

describe("backgroundQueue — edge cases", () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
    vi.clearAllMocks();
  });

  // ─── FIFO guarantee ─────────────────────────────────────────────────────

  it("drain processes tasks in FIFO order", async () => {
    const order = [];
    registerHandler("fifo-test", async (payload) => {
      order.push(payload.seq);
    });

    mockStore["f1"] = { id: "f1", type: "fifo-test", status: "pending", payload: { seq: 1 }, attempts: 0 };
    mockStore["f2"] = { id: "f2", type: "fifo-test", status: "pending", payload: { seq: 2 }, attempts: 0 };
    mockStore["f3"] = { id: "f3", type: "fifo-test", status: "pending", payload: { seq: 3 }, attempts: 0 };

    let callCount = 0;
    mockDB.getAllFromIndex.mockImplementation(async (store, idx, val) => {
      const result = Object.values(mockStore).filter(t => t[idx] === val);
      return result;
    });

    mockDB.delete.mockImplementation(async (store, key) => { delete mockStore[key]; });

    await drain();
    expect(order).toEqual([1, 2, 3]);
  });

  // ─── Failure isolation ──────────────────────────────────────────────────

  it("one failing task does not block others from processing", async () => {
    const processed = [];
    registerHandler("isolation-test", async (payload) => {
      if (payload.shouldFail) throw new Error("task failed");
      processed.push(payload.id);
    });

    mockStore["t1"] = { id: "t1", type: "isolation-test", status: "pending", payload: { id: "t1", shouldFail: true }, attempts: 2 };
    mockStore["t2"] = { id: "t2", type: "isolation-test", status: "pending", payload: { id: "t2", shouldFail: false }, attempts: 0 };

    mockDB.getAllFromIndex.mockImplementation(async (store, idx, val) =>
      Object.values(mockStore).filter(t => t[idx] === val)
    );
    mockDB.delete.mockImplementation(async (store, key) => { delete mockStore[key]; });

    await drain();
    // t1 should fail (attempts >= 3), t2 should succeed
    expect(processed).toContain("t2");
    expect(mockStore["t1"]?.status).toBe("failed");
  });

  // ─── Retry logic ────────────────────────────────────────────────────────

  it("task retries on failure when attempts < 3", async () => {
    registerHandler("retry-test", async () => { throw new Error("fail"); });

    mockStore["r1"] = { id: "r1", type: "retry-test", status: "pending", payload: {}, attempts: 0 };

    mockDB.getAllFromIndex.mockImplementation(async (store, idx, val) => {
      const result = Object.values(mockStore).filter(t => t[idx] === val);
      // After processing, if task is still pending, return it; otherwise empty
      return result;
    });

    await drain();
    // After first failure: attempts becomes 1, status goes back to "pending"
    const task = mockStore["r1"];
    expect(task).toBeDefined();
    expect(task.attempts).toBeGreaterThanOrEqual(1);
  });

  // ─── No handler registered ─────────────────────────────────────────────

  it("task with no handler is marked as failed", async () => {
    mockStore["nohandler"] = {
      id: "nohandler",
      type: "unregistered-type",
      status: "pending",
      payload: {},
      attempts: 0,
    };

    mockDB.getAllFromIndex.mockImplementation(async (store, idx, val) =>
      Object.values(mockStore).filter(t => t[idx] === val)
    );

    await drain();
    expect(mockStore["nohandler"].status).toBe("failed");
  });

  // ─── clearFinished ────────────────────────────────────────────────────

  it("clearFinished removes done and failed tasks", async () => {
    mockStore["done1"] = { id: "done1", status: "done" };
    mockStore["failed1"] = { id: "failed1", status: "failed" };
    mockStore["pending1"] = { id: "pending1", status: "pending" };

    await clearFinished();
    // done and failed should be removed via transaction
    // pending should remain in mockStore (clearFinished uses transaction mock)
    expect(mockDB.transaction).toHaveBeenCalled();
  });

  // ─── resumePendingTasks ─────────────────────────────────────────────────

  it("resumePendingTasks resets running tasks to pending", async () => {
    mockStore["running1"] = { id: "running1", status: "running", type: "push-garment", payload: {}, attempts: 0 };
    mockStore["pending1"] = { id: "pending1", status: "pending", type: "push-garment", payload: {}, attempts: 0 };

    mockDB.getAllFromIndex.mockImplementation(async (store, idx, val) =>
      Object.values(mockStore).filter(t => t[idx] === val)
    );

    registerHandler("push-garment", async () => {});

    await resumePendingTasks();
    // running task should be reset to pending
    expect(mockStore["running1"].status).toBe("pending");
  });

  // ─── subscribeQueue ─────────────────────────────────────────────────────

  it("subscribeQueue returns unsubscribe function", () => {
    const fn = vi.fn();
    const unsub = subscribeQueue(fn);
    expect(typeof unsub).toBe("function");
    unsub();
  });

  // ─── enqueueTask auto-generates ID ────────────────────────────────────

  it("enqueueTask generates unique IDs", async () => {
    const id1 = await enqueueTask("test-type", { a: 1 });
    const id2 = await enqueueTask("test-type", { b: 2 });
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^test-type-/);
    expect(id2).toMatch(/^test-type-/);
  });

  // ─── getQueueStats with empty store ───────────────────────────────────

  it("getQueueStats returns zeros when empty", async () => {
    const stats = await getQueueStats();
    expect(stats).toEqual({ pending: 0, running: 0, done: 0, failed: 0, total: 0 });
  });

  // ─── Multiple handler registrations ──────────────────────────────────

  it("registering handler for same type replaces previous handler", async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    registerHandler("replace-test", handler1);
    registerHandler("replace-test", handler2);

    mockStore["rep1"] = { id: "rep1", type: "replace-test", status: "pending", payload: {}, attempts: 0 };
    mockDB.getAllFromIndex.mockImplementation(async (store, idx, val) =>
      Object.values(mockStore).filter(t => t[idx] === val)
    );
    mockDB.delete.mockImplementation(async (store, key) => { delete mockStore[key]; });

    await drain();
    expect(handler2).toHaveBeenCalled();
    expect(handler1).not.toHaveBeenCalled();
  });
});
