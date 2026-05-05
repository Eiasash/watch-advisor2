/**
 * settingsPersistence — IDB-first settings writes (weekCtx, onCallDates, straps).
 *
 * Settings are stored as a single keyed object in the "state" blob store
 * (backward compat with localCache). Write order: IDB → Zustand.
 */

import { db } from "../db.js";
import { useWardrobeStore } from "../../stores/wardrobeStore.js";
import { useStrapStore }    from "../../stores/strapStore.js";

const STORE  = "state";
const BLOB_KEY = "app";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readBlob() {
  return (await db.get(STORE, BLOB_KEY)) ?? {};
}

/**
 * Atomic read-modify-write of the state/app blob — wraps both ops in a
 * single IDB transaction so concurrent callers don't lose each other's
 * fields. Same race as setCachedState (settings persistence and
 * localCache.setCachedState write to the same blob); without a tx,
 * saveWeekCtx + saveOnCallDates firing in quick succession could drop
 * one of the two writes. See localCache.setCachedState comment for the
 * full failure mode.
 */
async function patchBlob(fields) {
  const tx = db.transaction(STORE, "readwrite");
  const existing = (await tx.store.get(BLOB_KEY)) ?? {};
  await tx.store.put({ ...existing, ...fields }, BLOB_KEY);
  await tx.done;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Persist weekCtx: IDB first, then Zustand.
 */
export async function saveWeekCtx(weekCtx) {
  await patchBlob({ weekCtx });
  useWardrobeStore.setState({ weekCtx });
}

/**
 * Persist onCallDates: IDB first, then Zustand.
 */
export async function saveOnCallDates(dates) {
  await patchBlob({ onCallDates: dates });
  useWardrobeStore.setState({ onCallDates: dates });
}

/**
 * Persist active strap selection: IDB first, then Zustand.
 */
export async function saveActiveStrap(watchId, strapId) {
  const existing = await readBlob();
  const strapStore = existing.strapStore ?? {};
  const next = { ...strapStore, activeStrap: { ...(strapStore.activeStrap ?? {}), [watchId]: strapId } };
  await patchBlob({ strapStore: next });
  useStrapStore.setState(state => ({
    activeStrap: { ...state.activeStrap, [watchId]: strapId },
  }));
}

/**
 * Persist full planner overrides blob: IDB first.
 * (No Zustand sync needed — this is set via wardrobeStore.setState directly.)
 */
export async function saveOutfitOverrides(overrides) {
  await patchBlob({ _outfitOverrides: overrides });
}
