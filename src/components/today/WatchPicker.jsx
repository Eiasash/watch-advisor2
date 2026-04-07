import React from "react";
import { useStrapStore } from "../../stores/strapStore.js";

/** Returns days since watchId was last worn, or null if never worn. */
export function daysSinceWorn(watchId, history) {
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < history.length; i++) {
    if (history[i].watchId === watchId) {
      const d = history[i].date;
      if (!d) continue;
      const diff = Math.round((new Date(today) - new Date(d)) / 86400000);
      return diff;
    }
  }
  return null;
}

/**
 * Watch + strap picker section.
 * Renders the watch list with days-since-worn indicators,
 * and the strap picker for the selected watch.
 */
export default function WatchPicker({
  watches, watchId, onSelectWatch,
  entries, straps, activeStrap,
  isDark, card, border, text, muted,
}) {
  const watchStraps  = Object.values(straps).filter(s => s.watchId === watchId);
  const activeStrapId = activeStrap[watchId];

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: "uppercase",
                    letterSpacing: "0.06em", marginBottom: 10 }}>Watch</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {watches.map(w => {
          const dsw = daysSinceWorn(w.id, entries);
          return (
            <div key={w.id} onClick={() => onSelectWatch(w.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10,
                       border: `2px solid ${watchId === w.id ? "#3b82f6" : border}`, cursor: "pointer",
                       background: watchId === w.id ? (isDark ? "#0c1f3f" : "#eff6ff") : "transparent" }}>
              <div style={{ fontSize: 22 }}>{w.emoji ?? "\u231A"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{w.brand} {w.model}</div>
                <div style={{ fontSize: 11, color: muted }}>
                  {w.dualDial ? `${w.dualDial.sideA}/${w.dualDial.sideB}` : w.dial} dial
                  {w.replica ? " \u00B7 replica" : " \u00B7 genuine"}
                </div>
              </div>
              {dsw !== null && (
                <div style={{ fontSize: 10, fontWeight: 600, color: dsw >= 7 ? "#22c55e" : dsw <= 2 ? "#ef4444" : muted }}>
                  {dsw === 0 ? "today" : `${dsw}d`}
                </div>
              )}
              {watchId === w.id && <div style={{ color: "#3b82f6", fontWeight: 700, fontSize: 16 }}>{"\u2713"}</div>}
            </div>
          );
        })}
      </div>

      {/* Strap picker for selected watch */}
      {watchStraps.length > 0 && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${border}`, paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: muted, fontWeight: 600, marginBottom: 8 }}>STRAP</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {watchStraps.map(s => (
              <button key={s.id}
                onClick={() => useStrapStore.getState().setActiveStrap(watchId, s.id)}
                style={{ padding: "5px 10px", borderRadius: 8,
                         border: `1px solid ${activeStrapId === s.id ? "#3b82f6" : border}`,
                         background: activeStrapId === s.id ? "#3b82f622" : "transparent",
                         color: activeStrapId === s.id ? "#3b82f6" : muted,
                         fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
