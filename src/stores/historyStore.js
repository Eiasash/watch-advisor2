import { create } from "zustand";
import { pushHistoryEntry, deleteHistoryEntry } from "../services/supabaseSync.js";

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
  setEntries: entries => set({ entries }),

  addEntry: entry => {
    // 1. Zustand — synchronous, UI sees it immediately
    set(state => ({ entries: [...state.entries, entry] }));
    // 2. IDB — async, fire-and-forget
    getPersistence().then(m => m.upsert(entry)).catch(() => {});
    // 3. Cloud — fire-and-forget
    pushHistoryEntry(entry).catch(() => {});
  },

  upsertEntry: entry => {
    // 1. Zustand — synchronous
    set(state => {
      const idx = state.entries.findIndex(e => e.id === entry.id);
      const next = idx >= 0
        ? state.entries.map((e, i) => i === idx ? { ...e, ...entry } : e)
        : [...state.entries, entry];
      return { entries: next };
    });
    // 2. IDB — async, fire-and-forget
    getPersistence().then(m => m.upsert(entry)).catch(() => {});
    // 3. Cloud — fire-and-forget
    pushHistoryEntry(entry).catch(() => {});
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
