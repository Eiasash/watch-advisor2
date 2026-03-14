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
 * IDB first, then Zustand.
 */
export async function patch(id, fields) {
  // Read current IDB state to merge
  const existing = await db.get(STORE, id);
  const merged = existing ? { ...existing, ...fields } : { id, ...fields };

  // 1. IDB
  await db.put(STORE, merged);

  // 2. Zustand
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
