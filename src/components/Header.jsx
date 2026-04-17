import React from "react";
import { useWatchStore } from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useThemeStore } from "../stores/themeStore.js";

export default function Header({ onOpenSettings, onOpenSearch }) {
  const watches = useWatchStore(s => s.watches) ?? [];
  const garments = useWardrobeStore(s => s.garments) ?? [];
  const { mode, toggle } = useThemeStore();
  const isDark = mode === "dark";

  const btnStyle = {
    padding: "6px 12px", borderRadius: 8, border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
    background: isDark ? "#0f131a" : "#f9fafb", color: isDark ? "#e2e8f0" : "#1f2937",
    fontSize: 14, cursor: "pointer",
  };

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: 20, paddingBottom: 16,
      borderBottom: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
      flexWrap: "wrap", gap: 10,
    }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
          watch-advisor
        </h1>
        <div style={{ color: isDark ? "#9ca3af" : "#6b7280", fontSize: 13, marginTop: 2 }}>
          Watch-first outfit planner &middot; {watches.filter(w => !w.retired && !w.pending).length} watches &middot; {garments.filter(g => !g.excludeFromWardrobe).length} garments &middot; <span style={{ color: isDark ? "#6b7280" : "#9ca3af" }}>v{__BUILD_NUMBER__}</span>
        </div>
      </div>
      <div className="wa-header-actions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Search / Command Palette */}
        <button
          onClick={onOpenSearch}
          title="Search (Ctrl+K)"
          style={{ ...btnStyle, display: "flex", alignItems: "center", gap: 6 }}
        >
          &#128269;
          <span style={{ fontSize: 11, color: isDark ? "#6b7280" : "#9ca3af" }}>Ctrl+K</span>
        </button>
        {/* Day/Night toggle */}
        <button
          onClick={toggle}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          style={{ ...btnStyle, display: "flex", alignItems: "center", gap: 5 }}
        >
          {isDark ? "\u263E" : "\u2600"} {isDark ? "Night" : "Day"}
        </button>
        {/* Settings */}
        <button onClick={onOpenSettings} title="Settings" style={btnStyle}>
          &#9881;
        </button>
      </div>
    </div>
  );
}
