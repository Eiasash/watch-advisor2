/**
 * StrapHealth — strap lifecycle dashboard.
 * Shows wear count, health bar, estimated lifespan for each strap.
 * Groups by watch. Highlights straps needing replacement.
 */
import React, { useState } from "react";
import { useStrapStore } from "../../stores/strapStore.js";
import { useWatchStore } from "../../stores/watchStore.js";
import { useThemeStore } from "../../stores/themeStore.js";
import { isActiveWatch } from "../../utils/watchFilters.js";

export default function StrapHealth() {
  const straps = useStrapStore(s => s.straps) ?? {};
  const watches = useWatchStore(s => s.watches) ?? [];
  const getStrapStats = useStrapStore(s => s.getStrapStats);
  const activeStrap = useStrapStore(s => s.activeStrap);
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const [expanded, setExpanded] = useState(false);

  const card = isDark ? "#161b22" : "#fffbf0";
  const border = isDark ? "#854d0e30" : "#fed7aa40";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#8b93a7" : "#6b7280";
  const accent = "#f97316";

  // Group straps by watch (only non-bracelet straps — bracelets don't wear out)
  const watchGroups = watches
    .filter(isActiveWatch)
    .map(w => {
      const watchStraps = Object.values(straps)
        .filter(s => s.watchId === w.id && s.type !== "bracelet")
        .map(s => ({ ...s, stats: getStrapStats(s.id), isActive: activeStrap[w.id] === s.id }))
        .sort((a, b) => (b.stats?.wears ?? 0) - (a.stats?.wears ?? 0));
      return { watch: w, straps: watchStraps };
    })
    .filter(g => g.straps.length > 0);

  const totalStraps = watchGroups.reduce((sum, g) => sum + g.straps.length, 0);
  const needsReplacement = watchGroups.reduce((sum, g) => sum + g.straps.filter(s => s.stats?.needsReplacement).length, 0);
  const totalWears = watchGroups.reduce((sum, g) => sum + g.straps.reduce((s2, s) => s2 + (s.stats?.wears ?? 0), 0), 0);

  if (!totalStraps) return null;

  const healthColor = (pct) => pct > 60 ? "#22c55e" : pct > 30 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: expanded ? 10 : 0 }}>
        <div onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer", flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            🔗 Strap Health
          </span>
          <span style={{ marginLeft: 8, fontSize: 11, color: muted }}>
            {totalStraps} straps · {totalWears} total wears
            {needsReplacement > 0 && <span style={{ color: "#ef4444", fontWeight: 700 }}> · {needsReplacement} worn out</span>}
          </span>
        </div>
        <span onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer", color: muted, fontSize: 10 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {expanded && watchGroups.map(({ watch, straps: ws }) => (
        <div key={watch.id} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: text, marginBottom: 4 }}>
            ⌚ {watch.brand} {watch.model}
          </div>
          {ws.map(s => {
            const st = s.stats;
            if (!st) return null;
            const barWidth = Math.max(2, st.healthPct);
            return (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
                opacity: st.needsReplacement ? 0.7 : 1,
              }}>
                <div style={{ fontSize: 10, width: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: text }}>
                  {s.isActive && <span style={{ color: accent }}>● </span>}
                  {s.label}
                </div>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: isDark ? "#1a1f2b" : "#f3f4f6", position: "relative", overflow: "hidden" }}>
                  <div style={{
                    width: `${barWidth}%`, height: "100%", borderRadius: 4,
                    background: healthColor(st.healthPct),
                    transition: "width 0.3s",
                  }} />
                </div>
                <div style={{ fontSize: 9, color: muted, width: 50, textAlign: "right", whiteSpace: "nowrap" }}>
                  {st.wears}/{st.lifespan}
                </div>
                {st.needsReplacement && (
                  <span style={{ fontSize: 9, color: "#ef4444", fontWeight: 700 }}>⚠️</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
