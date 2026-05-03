/**
 * NeglectedWatchNudge — surfaces genuine watches idle 14+ days.
 * Shows the most neglected genuine watch with a "Wear me today" nudge.
 * Tapping selects that watch in TodayPanel.
 */
import React, { useState } from "react";
import { daysIdle } from "../../domain/rotationStats.js";
import { isActiveWatch } from "../../utils/watchFilters.js";

const IDLE_THRESHOLD = 14; // days

export default function NeglectedWatchNudge({ watches, history, currentWatchId, onSelectWatch, isDark }) {
  const [dismissed, setDismissed] = useState(null); // dismissed watchId
  if (!watches?.length || !history?.length) return null;

  const genuine = watches.filter(w => isActiveWatch(w) && !w.replica);
  if (!genuine.length) return null;

  // Find the most idle genuine watch that isn't already selected
  let worst = null;
  let maxIdle = -1;
  for (const w of genuine) {
    const idle = daysIdle(w.id, history);
    if (idle > maxIdle && w.id !== currentWatchId) {
      maxIdle = idle;
      worst = w;
    }
  }

  if (!worst || maxIdle < IDLE_THRESHOLD) return null;
  if (dismissed === worst.id) return null;

  const bg = isDark ? "#1a1f2b" : "#fffbeb";
  const border = isDark ? "#92400e" : "#fbbf24";
  const text = isDark ? "#fbbf24" : "#92400e";

  return (
    <div
      onClick={() => onSelectWatch?.(worst.id)}
      style={{
        background: bg, borderRadius: 12, border: `1px solid ${border}`,
        padding: "10px 14px", marginBottom: 12, cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: text, marginBottom: 2 }}>
        ⏰ {worst.brand} {worst.model} — {maxIdle === Infinity ? "never worn" : `${maxIdle}d idle`}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: isDark ? "#d4d4d4" : "#78716c" }}>
          Tap to select · {worst.dial} dial · {worst.style}
        </div>
        <button onClick={e => { e.stopPropagation(); setDismissed(worst.id); }}
          style={{ fontSize: 14, background: "transparent", border: "none",
            cursor: "pointer", color: isDark ? "#4b5563" : "#9ca3af", padding: "0 4px" }}>✕</button>
      </div>
    </div>
  );
}
