import React from "react";
import { useThemeStore } from "../../stores/themeStore.js";

/**
 * StreakBadge — green badge showing consecutive wear days.
 * Returns null when streak is 0.
 */
export default function StreakBadge({ streak }) {
  const { mode } = useThemeStore();
  const isDark   = mode === "dark";

  if (!streak || streak <= 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                  borderRadius: 20, alignSelf: "flex-start",
                  background: isDark ? "#0f1a0f" : "#f0fdf4",
                  border: `1px solid ${isDark ? "#166534" : "#bbf7d0"}` }}>
      <span style={{ fontSize: 15 }}>🔥</span>
      <span style={{ fontSize: 12, fontWeight: 700,
                     color: isDark ? "#4ade80" : "#15803d" }}>
        {streak}-day wear streak
      </span>
    </div>
  );
}
