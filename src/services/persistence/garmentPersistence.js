/**
 * garmentPersistence — IDB-first garment writes.
 *
 * Write order: IDB → Zustand (same contract as historyPersistence).
 *
 * Garments are large (thumbnails inline) so individual puts are kept
 * synchronous-feeling by not awaiting the full wardrobe re-sync.
 * The existing setCachedState blob is also updated for backward compat
 * with the cloud pull path that reads from the blob.
 */

import { db } from "../db.js";
import { useWardrobeStore } from "../../stores/wardrobeStore.js";

// Per-id mutex map: serializes concurrent patch() calls on the same garment so
// the read-modify-write sequence can't be raced. (F-a-2 fix.) Two simultaneous
// patches with disjoint `fields` previously read the same `existing`, so the
// second writer's put dropped the first writer's persisted fields. Now they
// run sequentially per id; in flight chain is held in this Map and cleared
// when the last awaiter resolves.
const _patchLocks = new Map();

const STORE = "garments_items";

// ── Read ─────────────────────────────────────────────────────────────────────

export async function loadAll() {
  try {
    const conn = await import("../db.js").then(m => m.dbPromise);
    return await conn.getAll(STORE);
  } catch {
    return [];
  }
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Upsert a garment.
 * IDB first, then Zustand.
 */
export async function upsert(garment) {
  // 1. IDB
  await db.put(STORE, garment);

  // 2. Zustand
  useWardrobeStore.setState(state => {
    const idx = state.garments.findIndex(g => g.id === garment.id);
    const next = idx >= 0
      ? state.garments.map((g, i) => i === idx ? { ...g, ...garment } : g)
      : [...state.garments, garment];
    return { garments: next };
  });
}

/**
 * Update specific fields on a garment by id.
 * Per-id mutex serializes concurrent patches so two simultaneous calls on the
 * same garment can't drop each other's fields. (F-a-2 fix.)
 */
export async function patch(id, fields) {
  const prev = _patchLocks.get(id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const existing = await db.get(STORE, id);
    const merged = existing ? { ...existing, ...fields } : { id, ...fields };
    await db.put(STORE, merged);
  });
  _patchLocks.set(id, next);
  try {
    await next;
  } finally {
    if (_patchLocks.get(id) === next) _patchLocks.delete(id);
  }

  // Zustand
  useWardrobeStore.setState(state => ({
    garments: state.garments.map(g => g.id === id ? { ...g, ...fields } : g),
  }));
}

/**
 * Remove a garment by id.
 * IDB first, then Zustand.
 */
export async function remove(id) {
  // 1. IDB
  await db.delete(STORE, id);

  // 2. Zustand
  useWardrobeStore.setState(state => ({
    garments: state.garments.filter(g => g.id !== id),
  }));
}
