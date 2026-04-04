/**
 * LastWornWithWatch — shows the last outfit logged with the currently selected watch.
 * Helps avoid repeating the exact same combo.
 */
import React, { useMemo } from "react";

/**
 * @param {{ watchId: string, history: Array, garments: Array, isDark: boolean }} props
 */
export default function LastWornWithWatch({ watchId, history, garments, isDark }) {
  const lastEntry = useMemo(() => {
    if (!watchId || !history?.length) return null;
    // Find most recent entry with this watch that has garment data
    const sorted = [...history]
      .filter(h => (h.watchId === watchId || h.watch_id === watchId) &&
                   (h.garmentIds?.length > 0 || h.payload?.garmentIds?.length > 0))
      .sort((a, b) => new Date(b.date || b.loggedAt) - new Date(a.date || a.loggedAt));
    return sorted[0] ?? null;
  }, [watchId, history]);

  if (!lastEntry) return null;

  const gids = lastEntry.garmentIds ?? lastEntry.payload?.garmentIds ?? [];
  const wornGarments = garments.filter(g => gids.includes(g.id));
  const date = lastEntry.date;
  const daysAgo = Math.round((Date.now() - new Date(date).getTime()) / 86400000);
  const dateLabel = daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo}d ago`;

  const bg = isDark ? "#0f131a" : "#f8fafc";
  const border = isDark ? "#2b3140" : "#e2e8f0";
  const muted = isDark ? "#64748b" : "#94a3b8";
  const text = isDark ? "#e2e8f0" : "#1f2937";

  return (
    <div style={{
      background: bg, borderRadius: 10, border: `1px solid ${border}`,
      padding: "10px 14px", marginBottom: 10,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase",
                    letterSpacing: "0.05em", marginBottom: 6 }}>
        🔄 Last worn with this watch · {dateLabel}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {wornGarments.map(g => (
          <div key={g.id} style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 6,
            background: isDark ? "#1a1f2b" : "#f1f5f9",
            fontSize: 10, color: text,
          }}>
            {(g.thumbnail || g.photoUrl) ? (
              <img src={g.thumbnail || g.photoUrl} alt="" style={{ width: 16, height: 16, borderRadius: 3, objectFit: "cover" }} />
            ) : null}
            {g.name?.slice(0, 22)}
          </div>
        ))}
      </div>
      {lastEntry.context && (
        <div style={{ fontSize: 9, color: muted, marginTop: 4 }}>
          Context: {lastEntry.context} · Score: {lastEntry.score ?? lastEntry.payload?.score ?? "—"}
        </div>
      )}
    </div>
  );
}
