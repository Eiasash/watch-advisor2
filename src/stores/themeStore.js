import { create } from "zustand";

const saved = typeof localStorage !== "undefined" ? localStorage.getItem("wa-theme") : null;

export const useThemeStore = create(set => ({
  mode: saved || "dark",
  toggle: () => set(state => {
    const next = state.mode === "dark" ? "light" : "dark";
    try { localStorage.setItem("wa-theme", next); } catch (e) { if (import.meta.env?.DEV) console.warn("[themeStore] persist failed:", e.message); }
    return { mode: next };
  }),
}));
