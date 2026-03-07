import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock idb
const mockStore = {};
const mockDB = {
  put: vi.fn(async (store, val, key) => { mockStore[val.id || key] = val; }),
  get: vi.fn(async (store, key) => mockStore[key] ?? undefined),
  getAll: vi.fn(async () => Object.values(mockStore)),
  getAllFromIndex: vi.fn(async (store, idx, val) => Object.values(mockStore).filter(t => t[idx] === val)),
  delete: vi.fn(async (store, key) => { delete mockStore[key]; }),
  transaction: vi.fn(() => ({
    store: { delete: vi.fn(async (key) => { delete mockStore[key]; }) },
    done: Promise.resolve(),
  })),
};

vi.mock("idb", () => ({
  openDB: vi.fn(async () => mockDB),
}));

const { enqueueTask, getPendingTasks, getQueueStats, registerHandler, drain, clearFinished } = await import("../src/services/backgroundQueue.js");

describe("backgroundQueue", () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
    vi.clearAllMocks();
  });

  it("enqueues a task with pending status", async () => {
    const id = await enqueueTask("push-garment", { garment: { id: "g1" } }, "test-1");
    expect(id).toBe("test-1");
    expect(mockDB.put).toHaveBeenCalled();
    const putArg = mockDB.put.mock.calls[0][1];
    expect(putArg.status).toBe("pending");
    expect(putArg.type).toBe("push-garment");
  });

  it("generates an ID when none provided", async () => {
    const id = await enqueueTask("upload-photo", { garmentId: "g1" });
    expect(id).toMatch(/^upload-photo-/);
  });

  it("getPendingTasks filters by type", async () => {
    mockStore["t1"] = { id: "t1", type: "push-garment", status: "pending" };
    mockStore["t2"] = { id: "t2", type: "upload-photo", status: "pending" };
    mockStore["t3"] = { id: "t3", type: "push-garment", status: "done" };

    mockDB.getAllFromIndex.mockImplementation(async (store, idx, val) =>
      Object.values(mockStore).filter(t => t[idx] === val)
    );

    const tasks = await getPendingTasks("push-garment");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("t1");
  });

  it("getQueueStats counts by status", async () => {
    mockStore["t1"] = { id: "t1", status: "pending" };
    mockStore["t2"] = { id: "t2", status: "running" };
    mockStore["t3"] = { id: "t3", status: "done" };
    mockStore["t4"] = { id: "t4", status: "failed" };

    const stats = await getQueueStats();
    expect(stats.pending).toBe(1);
    expect(stats.running).toBe(1);
    expect(stats.done).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.total).toBe(4);
  });

  it("registerHandler stores handler for type", () => {
    const fn = vi.fn();
    registerHandler("test-type", fn);
    // Handler is stored internally — tested via drain
  });

  it("drain processes pending tasks with registered handler", async () => {
    const handler = vi.fn(async () => {});
    registerHandler("drain-test", handler);

    mockStore["dt1"] = { id: "dt1", type: "drain-test", status: "pending", payload: { x: 1 }, attempts: 0 };
    mockDB.getAllFromIndex.mockImplementation(async (store, idx, val) => {
      const result = Object.values(mockStore).filter(t => t[idx] === val);
      return result;
    });

    // After drain processes, the task should be deleted (completed)
    mockDB.delete.mockImplementation(async (store, key) => { delete mockStore[key]; });

    await drain();
    expect(handler).toHaveBeenCalledWith({ x: 1 });
  });

  it("drain marks task as failed after handler error (max 3 attempts)", async () => {
    const handler = vi.fn(async () => { throw new Error("fail"); });
    registerHandler("fail-test", handler);

    mockStore["ft1"] = { id: "ft1", type: "fail-test", status: "pending", payload: {}, attempts: 2 };
    mockDB.getAllFromIndex.mockImplementation(async (store, idx, val) => {
      const result = Object.values(mockStore).filter(t => t[idx] === val);
      // After marking as failed, next call returns empty
      if (result.length && result[0].status === "failed") return [];
      return result;
    });

    await drain();
    expect(handler).toHaveBeenCalled();
    // After 3 attempts, status should be "failed"
    const task = mockStore["ft1"];
    expect(task.status).toBe("failed");
  });

  it("task has createdAt timestamp", async () => {
    const before = Date.now();
    await enqueueTask("push-garment", {}, "ts-test");
    const putArg = mockDB.put.mock.calls.find(c => c[1]?.id === "ts-test")?.[1];
    expect(putArg.createdAt).toBeGreaterThanOrEqual(before);
    expect(putArg.createdAt).toBeLessThanOrEqual(Date.now());
  });
});
