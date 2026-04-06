/**
 * QuickStrapSwap — quickly change the active strap on the current watch.
 * Shows available straps as tappable chips. Tap to switch instantly.
 * Shows current active strap highlighted.
 */
import React, { useState } from "react";
import { useStrapStore } from "../../stores/strapStore.js";

const TYPE_EMOJI = { leather: "🔗", bracelet: "⌚", canvas: "🎽", nato: "🎽", rubber: "🏊", suede: "🦌" };

export default function QuickStrapSwap({ watchId, isDark }) {
  const allStraps = useStrapStore(s => s.getStrapsForWatch(watchId));
  const activeStrapObj = useStrapStore(s => s.getActiveStrapObj?.(watchId));
  const setActive = useStrapStore(s => s.setActiveStrap);
  const incrementWear = useStrapStore(s => s.incrementWearCount);
  const [justSwapped, setJustSwapped] = useState(null);

  if (!allStraps.length || allStraps.length <= 1) return null;

  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  const accent = "#8b5cf6";

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase",
                    letterSpacing: "0.06em", marginBottom: 6 }}>
        Quick Strap Swap
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {allStraps.map(s => {
          const isActive = s.id === activeStrapObj?.id;
          const wasSwapped = justSwapped === s.id;
          const emoji = TYPE_EMOJI[s.type?.toLowerCase()] ?? "🔗";
          return (
            <button key={s.id}
              onClick={() => {
                if (!isActive) {
                  setActive(watchId, s.id);
                  incrementWear(s.id);
                  setJustSwapped(s.id);
                  setTimeout(() => setJustSwapped(null), 2000);
                }
              }}
              style={{
                padding: "5px 10px", borderRadius: 8, fontSize: 10, fontWeight: 600,
                cursor: isActive ? "default" : "pointer",
                border: `1px solid ${isActive ? accent : border}`,
                background: isActive ? `${accent}18` : wasSwapped ? "#22c55e18" : "transparent",
                color: isActive ? accent : wasSwapped ? "#22c55e" : text,
                transition: "all 0.2s",
              }}
            >
              {emoji} {s.label?.slice(0, 18) ?? s.id}
              {isActive && " ●"}
              {wasSwapped && " ✓"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
