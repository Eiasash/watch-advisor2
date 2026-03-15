import React from "react";
import { useThemeStore } from "../../stores/themeStore.js";

/**
 * NeglectedAlert — tappable banner for the most-neglected genuine watch.
 * Only shown when the idle watch is not already selected.
 *
 * Props:
 *   neglected   — { watch: { id, brand, model }, idle: number } | null
 *   watchId     — currently selected watchId
 *   onSelect    — (watchId: string) → void
 */
export default function NeglectedAlert({ neglected, watchId, onSelect }) {
  const { mode } = useThemeStore();
  const isDark   = mode === "dark";

  if (!neglected || neglected.idle < 7 || neglected.watch.id === watchId) return null;

  return (
    <div
      onClick={() => onSelect(neglected.watch.id)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
               borderRadius: 12, cursor: "pointer",
               background: isDark ? "#1a1206" : "#fffbeb",
               border: `1px solid ${isDark ? "#78350f" : "#fde68a"}` }}>
      <span style={{ fontSize: 18 }}>⏰</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700,
                      color: isDark ? "#fbbf24" : "#92400e" }}>
          {neglected.watch.brand} {neglected.watch.model} —{" "}
          {isFinite(neglected.idle) ? `${neglected.idle} days idle` : "never worn"}
        </div>
        <div style={{ fontSize: 11, color: isDark ? "#d97706" : "#b45309" }}>
          Tap to select · give it some wrist time
        </div>
      </div>
    </div>
  );
}
