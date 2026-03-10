/**
 * Background Task Queue — persists pending work to IDB so tasks survive
 * tab close / app backgrounding. On resume, pending tasks are drained.
 *
 * Task types: "upload-photo", "push-garment", "verify-photo"
 */
import { openDB } from "idb";

const DB_NAME = "watch-advisor2-tasks";
const STORE   = "tasks";
const DB_VERSION = 1;

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE)) {
      const store = db.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("status", "status");
      store.createIndex("type", "type");
    }
  },
});

let _draining = false;
const _handlers = {};
const _listeners = new Set();

function emit(state) { _listeners.forEach(fn => fn(state)); }

/** Subscribe to queue state changes: { pending, running, type } */
export function subscribeQueue(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Register a handler for a task type. handler(payload) → Promise<result> */
export function registerHandler(type, handler) {
  _handlers[type] = handler;
}

/** Enqueue a task. Returns the task ID. */
export async function enqueueTask(type, payload, id) {
  const db = await dbPromise;
  const task = {
    id: id || `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    status: "pending",
    createdAt: Date.now(),
    attempts: 0,
  };
  await db.put(STORE, task);
  drain(); // fire-and-forget
  return task.id;
}

/** Get all pending tasks, optionally filtered by type */
export async function getPendingTasks(type) {
  const db = await dbPromise;
  const all = await db.getAllFromIndex(STORE, "status", "pending");
  return type ? all.filter(t => t.type === type) : all;
}

/** Get counts by status */
export async function getQueueStats() {
  const db = await dbPromise;
  const all = await db.getAll(STORE);
  const pending = all.filter(t => t.status === "pending").length;
  const running = all.filter(t => t.status === "running").length;
  const done    = all.filter(t => t.status === "done").length;
  const failed  = all.filter(t => t.status === "failed").length;
  return { pending, running, done, failed, total: all.length };
}

/** Mark a task as done and remove it */
async function completeTask(id) {
  const db = await dbPromise;
  await db.delete(STORE, id);
}

/** Mark a task as failed (keeps it for retry, max 3 attempts) */
async function failTask(id) {
  const db = await dbPromise;
  const task = await db.get(STORE, id);
  if (!task) return;
  task.attempts = (task.attempts ?? 0) + 1;
  if (task.attempts >= 3) {
    task.status = "failed";
  } else {
    task.status = "pending"; // retry
  }
  await db.put(STORE, task);
}

/** Drain all pending tasks sequentially */
export async function drain() {
  if (_draining) return;
  _draining = true;

  try {
    const db = await dbPromise;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const pending = await db.getAllFromIndex(STORE, "status", "pending");
      if (!pending.length) break;

      const task = pending[0];
      const handler = _handlers[task.type];
      if (!handler) {
        // No handler registered — skip (will process when handler is registered)
        task.status = "failed";
        await db.put(STORE, task);
        continue;
      }

      // Mark running
      task.status = "running";
      await db.put(STORE, task);
      emit({ pending: pending.length - 1, running: 1, type: task.type });

      try {
        await handler(task.payload);
        await completeTask(task.id);
      } catch (err) {
        console.warn(`[backgroundQueue] task ${task.type} failed:`, err.message);
        await failTask(task.id);
      }
    }
  } finally {
    _draining = false;
    emit({ pending: 0, running: 0, type: null });
  }
}

/** Clear all completed/failed tasks */
export async function clearFinished() {
  const db = await dbPromise;
  const all = await db.getAll(STORE);
  const tx = db.transaction(STORE, "readwrite");
  for (const t of all) {
    if (t.status === "done" || t.status === "failed") {
      await tx.store.delete(t.id);
    }
  }
  await tx.done;
}

/** Flush all tasks of a given type (pending, running, failed). Used after cloud pull
 *  to prevent stale push-garment tasks from re-uploading deleted data. */
export async function flushTasksByType(type) {
  const db = await dbPromise;
  const all = await db.getAll(STORE);
  const tx = db.transaction(STORE, "readwrite");
  let flushed = 0;
  for (const t of all) {
    if (t.type === type) {
      await tx.store.delete(t.id);
      flushed++;
    }
  }
  await tx.done;
  if (flushed) console.info(`[backgroundQueue] flushed ${flushed} stale ${type} tasks`);
  return flushed;
}

/** Resume pending tasks on app start — call from bootstrap */
export async function resumePendingTasks() {
  const stats = await getQueueStats();
  if (stats.pending > 0 || stats.running > 0) {
    // Reset any "running" tasks back to pending (they died mid-flight)
    const db = await dbPromise;
    const running = await db.getAllFromIndex(STORE, "status", "running");
    for (const t of running) {
      t.status = "pending";
      await db.put(STORE, t);
    }
    console.info(`[backgroundQueue] resuming ${stats.pending + running.length} pending tasks`);
    drain();
  }
}
