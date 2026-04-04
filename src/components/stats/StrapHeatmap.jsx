/**
 * StrapHeatmap — visualises strap wear frequency across watches.
 * Shows which straps are neglected and which are overused.
 */
import React, { useMemo } from "react";

/**
 * @param {{ history: Array, watches: Array, isDark: boolean }} props
 */
export default function StrapHeatmap({ history, watches, isDark }) {
  const strapData = useMemo(() => {
    if (!history?.length) return [];

    // Aggregate strap usage from history
    const usage = {}; // { watchId: { strapLabel: count } }
    for (const h of history) {
      const watchId = h.watchId ?? h.watch_id;
      const strap = h.strapLabel ?? h.payload?.strap ?? null;
      if (!watchId) continue;
      if (!usage[watchId]) usage[watchId] = {};
      const label = strap || "(no strap logged)";
      usage[watchId][label] = (usage[watchId][label] || 0) + 1;
    }

    // Build display data
    const result = [];
    for (const [watchId, straps] of Object.entries(usage)) {
      const watch = watches?.find(w => w.id === watchId);
      if (!watch || watch.retired) continue;
      const entries = Object.entries(straps)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
      const total = entries.reduce((s, e) => s + e.count, 0);
      result.push({ watchId, watchName: `${watch.brand} ${watch.model}`, entries, total });
    }
    return result.sort((a, b) => b.total - a.total);
  }, [history, watches]);

  if (!strapData.length) return null;

  const card = isDark ? "#161b22" : "#faf5ff";
  const border = isDark ? "#7c3aed30" : "#e9d5ff40";
  const text = isDark ? "#c4b5fd" : "#5b21b6";
  const muted = isDark ? "#a78bfa" : "#7c3aed";

  // Count entries with no strap logged
  const noStrapCount = strapData.reduce((s, w) => {
    const noStrap = w.entries.find(e => e.label === "(no strap logged)");
    return s + (noStrap?.count ?? 0);
  }, 0);
  const totalEntries = strapData.reduce((s, w) => s + w.total, 0);
  const noStrapPct = totalEntries > 0 ? Math.round((noStrapCount / totalEntries) * 100) : 0;

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: "uppercase",
                    letterSpacing: "0.05em", marginBottom: 4 }}>
        ⌚ Strap usage
      </div>
      {noStrapPct > 30 && (
        <div style={{ fontSize: 10, color: "#ef4444", marginBottom: 8 }}>
          ⚠️ {noStrapPct}% of entries missing strap data
        </div>
      )}
      {strapData.slice(0, 6).map(w => (
        <div key={w.watchId} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#e9d5ff" : "#3b0764", marginBottom: 3 }}>
            {w.watchName} ({w.total}×)
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {w.entries.map(e => {
              const pct = Math.round((e.count / w.total) * 100);
              const isNoStrap = e.label === "(no strap logged)";
              return (
                <span key={e.label} style={{
                  fontSize: 10, padding: "2px 6px", borderRadius: 8,
                  background: isNoStrap
                    ? (isDark ? "#451a03" : "#fef2f2")
                    : (isDark ? "#1a1f2b" : "#f5f3ff"),
                  color: isNoStrap
                    ? (isDark ? "#fca5a5" : "#991b1b")
                    : muted,
                }}>
                  {e.label.slice(0, 18)} · {e.count}× ({pct}%)
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
