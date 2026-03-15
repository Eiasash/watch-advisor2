import React from "react";
import { useThemeStore } from "../../stores/themeStore.js";

/**
 * TomorrowPreview — compact card showing tomorrow's likely watch + outfit.
 * Returns null when preview is null.
 *
 * Props:
 *   preview — { watch: WatchSeed, outfit: OutfitResult } | null
 */
export default function TomorrowPreview({ preview }) {
  const { mode } = useThemeStore();
  const isDark   = mode === "dark";
  const muted    = isDark ? "#6b7280" : "#9ca3af";
  const text     = isDark ? "#e2e8f0" : "#1f2937";

  if (!preview) return null;

  const pieces = preview.outfit
    ? [preview.outfit.shirt, preview.outfit.pants, preview.outfit.shoes,
       preview.outfit.sweater, preview.outfit.jacket]
        .filter(Boolean)
        .map(g => g.name)
        .filter(Boolean)
    : [];

  return (
    <div style={{ background: isDark ? "#0d1117" : "#f8fafc",
                  border: `1px solid ${isDark ? "#2b3140" : "#e2e8f0"}`,
                  borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase",
                    letterSpacing: "0.07em", marginBottom: 8 }}>
        Tomorrow's Likely Pick
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 15 }}>⌚</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: text }}>
          {preview.watch?.brand} {preview.watch?.model}
        </span>
      </div>
      {pieces.length > 0 && (
        <div style={{ fontSize: 12, color: muted, lineHeight: 1.5 }}>
          {pieces.join(" · ")}
        </div>
      )}
    </div>
  );
}
