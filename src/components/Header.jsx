import React from "react";
import { useWatchStore } from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useThemeStore } from "../stores/themeStore.js";

export default function Header({ onOpenSettings }) {
  const watches = useWatchStore(s => s.watches);
  const garments = useWardrobeStore(s => s.garments);
  const { mode, toggle } = useThemeStore();
  const isDark = mode === "dark";

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: 20, paddingBottom: 16,
      borderBottom: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
    }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
          watch-advisor
        </h1>
        <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
          Watch-first outfit planner &middot; {watches.length} watches &middot; {garments.filter(g => !g.excludeFromWardrobe).length} garments
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Day/Night toggle */}
        <button
          onClick={toggle}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            padding: "6px 12px", borderRadius: 8, border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
            background: isDark ? "#0f131a" : "#f9fafb", color: isDark ? "#e2e8f0" : "#1f2937",
            fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
          }}
        >
          {isDark ? "\u263E" : "\u2600"} {isDark ? "Night" : "Day"}
        </button>
        {/* Settings */}
        <button
          onClick={onOpenSettings}
          title="Settings"
          style={{
            padding: "6px 12px", borderRadius: 8, border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
            background: isDark ? "#0f131a" : "#f9fafb", color: isDark ? "#e2e8f0" : "#1f2937",
            fontSize: 14, cursor: "pointer",
          }}
        >
          &#9881;
        </button>
      </div>
    </div>
  );
}
