/**
 * Weekly Backup Service
 *
 * Creates a full snapshot of app state (watches, garments, history, planner)
 * to a separate IDB store. Runs automatically at boot if 7+ days since last backup.
 * Keeps last 4 backups (rolling ~1 month).
 */
import { openDB } from "idb";
import { getCachedState } from "./localCache.js";

const DB_NAME    = "watch-advisor2-backups";
const STORE      = "snapshots";
const DB_VERSION = 1;
const MAX_BACKUPS = 4;
const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE)) {
      db.createObjectStore(STORE, { keyPath: "id" });
    }
  },
});

/** Create a backup snapshot from current IDB state */
export async function createBackup() {
  const state = await getCachedState();
  const db = await dbPromise;
  const id = new Date().toISOString();

  const snapshot = {
    id,
    createdAt: Date.now(),
    garmentCount: (state.garments ?? []).length,
    watchCount: (state.watches ?? []).length,
    historyCount: (state.history ?? []).length,
    data: {
      garments: state.garments ?? [],
      watches: state.watches ?? [],
      history: state.history ?? [],
      weekCtx: state.weekCtx ?? null,
      onCallDates: state.onCallDates ?? null,
      _outfitOverrides: state._outfitOverrides ?? null,
    },
  };

  await db.put(STORE, snapshot);

  // Prune old backups — keep only MAX_BACKUPS most recent
  const all = await db.getAll(STORE);
  if (all.length > MAX_BACKUPS) {
    const sorted = all.sort((a, b) => b.createdAt - a.createdAt);
    const toDelete = sorted.slice(MAX_BACKUPS);
    const tx = db.transaction(STORE, "readwrite");
    for (const old of toDelete) {
      await tx.store.delete(old.id);
    }
    await tx.done;
  }

  console.info(`[backup] created snapshot: ${id} (${snapshot.garmentCount} garments)`);
  return id;
}

/** Check if a backup is due (7+ days since last) */
export async function isBackupDue() {
  const db = await dbPromise;
  const all = await db.getAll(STORE);
  if (!all.length) return true; // never backed up
  const latest = all.sort((a, b) => b.createdAt - a.createdAt)[0];
  return Date.now() - latest.createdAt >= BACKUP_INTERVAL_MS;
}

/** List all backups (metadata only, no data) */
export async function listBackups() {
  const db = await dbPromise;
  const all = await db.getAll(STORE);
  return all
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ id, createdAt, garmentCount, watchCount, historyCount }) => ({
      id, createdAt, garmentCount, watchCount, historyCount,
    }));
}

/** Restore app state from a specific backup */
export async function restoreBackup(backupId) {
  const db = await dbPromise;
  const snapshot = await db.get(STORE, backupId);
  if (!snapshot) throw new Error(`Backup ${backupId} not found`);
  return snapshot.data;
}

/** Run backup check on boot — creates backup if due */
export async function checkAndBackup() {
  try {
    if (await isBackupDue()) {
      await createBackup();
    }
  } catch (err) {
    console.warn("[backup] auto-backup failed:", err.message);
  }
}
