import { create } from "zustand";
import { pushHistoryEntry, deleteHistoryEntry } from "../services/supabaseSync.js";
import { toArray } from "../utils/toArray.js";

/** Sanitise a history entry so garmentIds is always an array */
function sanitiseEntry(e) {
  if (!e) return e;
  const gids = e.garmentIds;
  if (gids !== undefined && !Array.isArray(gids)) {
    return { ...e, garmentIds: [] };
  }
  return e;
}

// historyPersistence is NOT imported statically here.
// A static import recreates the historyStore ↔ historyPersistence cycle in
// Rollup's module graph, causing a TDZ crash in the minified bundle
// ("Cannot access 'k' before initialization").
//
// Fix: cache the dynamic import promise so the module is only loaded once,
// then all fire-and-forget IDB writes go through the resolved module.
//
// Critical contract: Zustand state is updated SYNCHRONOUSLY inside each
// action (tests and UI depend on this). IDB writes are async fire-and-forget.
let _persistencePromise = null;
function getPersistence() {
  if (!_persistencePromise) {
    _persistencePromise = import("../services/persistence/historyPersistence.js");
  }
  return _persistencePromise;
}

export const useHistoryStore = create((set, get) => ({
  entries: [],
  setEntries: entries => set({ entries: toArray(entries).map(sanitiseEntry) }),

  addEntry: entry => {
    // Stamp payload version for schema evolution
    const stamped = entry.payload && !entry.payload.payload_version
      ? { ...entry, payload: { ...entry.payload, payload_version: "v1" } }
      : entry;
    // 1. Zustand — synchronous, UI sees it immediately
    set(state => ({ entries: [...state.entries, stamped] }));
    // 2. IDB — async, fire-and-forget
    getPersistence().then(m => m.upsert(stamped)).catch(() => {});
    // 3. Cloud — fire-and-forget
    pushHistoryEntry(stamped).catch(() => {});
  },

  upsertEntry: entry => {
    // Stamp payload version for schema evolution
    const stamped = entry.payload && !entry.payload.payload_version
      ? { ...entry, payload: { ...entry.payload, payload_version: "v1" } }
      : entry;
    // 1. Zustand — synchronous
    set(state => {
      const idx = state.entries.findIndex(e => e.id === stamped.id);
      const next = idx >= 0
        ? state.entries.map((e, i) => i === idx ? { ...e, ...stamped } : e)
        : [...state.entries, stamped];
      return { entries: next };
    });
    // 2. IDB — async, fire-and-forget
    getPersistence().then(m => m.upsert(stamped)).catch(() => {});
    // 3. Cloud — fire-and-forget
    pushHistoryEntry(stamped).catch(() => {});
  },

  removeEntry: id => {
    // 1. Zustand — synchronous
    set(state => ({ entries: state.entries.filter(e => e.id !== id) }));
    // 2. IDB — async, fire-and-forget
    getPersistence().then(m => m.remove(id)).catch(() => {});
    // 3. Cloud — fire-and-forget
    deleteHistoryEntry(id).catch(() => {});
  },
}));
