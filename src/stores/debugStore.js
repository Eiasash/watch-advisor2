/**
 * debugStore — global error/warning ring buffer.
 * Captures: JS errors, unhandled rejections, console.error/warn,
 * and Netlify function HTTP failures.
 * Max 200 entries (oldest dropped).
 */
import { create } from "zustand";

const MAX = 200;

let _seq = 0;

export const useDebugStore = create((set, get) => ({
  entries: [],

  push(entry) {
    const e = {
      id:    ++_seq,
      ts:    Date.now(),
      level: "error",   // error | warn | info | network
      source: "app",    // app | network | console | unhandled
      ...entry,
    };
    set(s => {
      const next = [e, ...s.entries];
      return { entries: next.length > MAX ? next.slice(0, MAX) : next };
    });
  },

  clear() { set({ entries: [] }); },

  exportJSON() {
    const { entries } = get();
    const blob = new Blob(
      [JSON.stringify({ _exported: new Date().toISOString(), entries }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href    = url;
    a.download = `wa2-debug-${new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
}));

// Standalone push helper usable outside React (from the logger)
export function pushDebugEntry(entry) {
  useDebugStore.getState().push(entry);
}
