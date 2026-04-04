/**
 * StrapSuggestion — suggests best strap for selected watch based on weather + context.
 * Shows as a small inline hint below the watch picker.
 */
import React, { useMemo } from "react";

/**
 * @param {{ watchId: string, watches: Array, straps: object, weather: object, context: string, isDark: boolean }} props
 */
export default function StrapSuggestion({ watchId, watches, straps, weather, context, isDark }) {
  const suggestion = useMemo(() => {
    if (!watchId || !straps) return null;
    const watch = watches?.find(w => w.id === watchId);
    if (!watch) return null;

    // Get straps for this watch
    const watchStraps = Object.values(straps).filter(s => s.watchId === watchId);
    if (watchStraps.length <= 1) return null; // No choice to make

    const temp = weather?.tempC ?? 22;
    const isHot = temp >= 28;
    const isFormal = ["formal", "clinic", "eid-celebration"].includes(context);
    const isCasual = ["casual", "shift"].includes(context);

    let pick = null;
    let reason = "";

    if (isHot) {
      // Hot: prefer bracelet or NATO/rubber
      pick = watchStraps.find(s => s.type === "bracelet") ||
             watchStraps.find(s => ["nato", "canvas", "rubber"].includes(s.type));
      reason = `${temp}°C — bracelet or fabric breathes better`;
    } else if (isFormal) {
      // Formal: prefer leather or bracelet
      pick = watchStraps.find(s => s.type === "leather" && s.color === "black") ||
             watchStraps.find(s => s.type === "bracelet") ||
             watchStraps.find(s => s.type === "leather");
      reason = "Formal context — leather or bracelet";
    } else if (isCasual) {
      // Casual: NATO, canvas, or bracelet
      pick = watchStraps.find(s => ["nato", "canvas"].includes(s.type)) ||
             watchStraps.find(s => s.type === "bracelet");
      reason = "Casual — NATO or bracelet";
    }

    if (!pick) return null;
    return { strap: pick, reason };
  }, [watchId, watches, straps, weather, context]);

  if (!suggestion) return null;

  const muted = isDark ? "#64748b" : "#94a3b8";

  return (
    <div style={{ fontSize: 10, color: muted, marginTop: 4, padding: "3px 8px" }}>
      💡 Strap tip: <strong style={{ color: isDark ? "#93c5fd" : "#3b82f6" }}>{suggestion.strap.label}</strong> — {suggestion.reason}
    </div>
  );
}
