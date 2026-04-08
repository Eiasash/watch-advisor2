/**
 * ScoreBackfill — shows unscored history entries for quick batch rating.
 * Swipe through 5 at a time, tap a score, auto-saves.
 */
import React, { useState, useMemo } from "react";

/**
 * @param {{ entries: Array, watches: Array, garments: Array, onScore: (id: string, score: number) => void, isDark: boolean }} props
 */
export default function ScoreBackfill({ entries, watches, garments, onScore, isDark }) {
  const [page, setPage] = useState(0);
  const [expandedEntry, setExpandedEntry] = useState(null);
  const [dismissed, setDismissed] = useState(new Set());

  const unscored = useMemo(() => {
    return entries.filter(e => {
      if (e.quickLog || e.payload?.quickLog) return false;
      if (e.legacy || e.payload?.legacy) return false;
      const gids = e.garmentIds ?? e.payload?.garmentIds ?? [];
      if (!Array.isArray(gids) || gids.length === 0) return false;
      const s = e.score ?? e.payload?.score;
      return s == null || s === undefined;
    }).filter(e => {
      // Only show entries from last 3 days — older unscored entries are gone, no backlog
      if (dismissed.has(e.id)) return false;
      const d = new Date(e.date || e.loggedAt);
      return (Date.now() - d.getTime()) <= 3 * 24 * 60 * 60 * 1000;
    }).sort((a, b) => new Date(b.date || b.loggedAt) - new Date(a.date || a.loggedAt));
  }, [entries]);

  if (!unscored.length) return null;

  const pageSize = 5;
  const pageEntries = unscored.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(unscored.length / pageSize);

  const card = isDark ? "#161b22" : "#fefce8";
  const border = isDark ? "#854d0e30" : "#fef08a40";
  const text = isDark ? "#fde68a" : "#92400e";
  const muted = isDark ? "#d4a574" : "#a16207";

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: "uppercase",
                    letterSpacing: "0.05em", marginBottom: 10 }}>
        ⭐ Rate past outfits ({unscored.length} unscored)
      </div>

      {pageEntries.map(entry => {
        const watch = watches.find(w => w.id === (entry.watchId ?? entry.watch_id));
        const gids = entry.garmentIds ?? entry.payload?.garmentIds ?? [];
        const wornG = garments.filter(g => gids.includes(g.id));
        const ctx = entry.context ?? entry.payload?.context;

        return (
          <div key={entry.id} style={{
            padding: "8px 0", borderBottom: `1px solid ${isDark ? "#1a1f2b" : "#fef08a30"}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#fef3c7" : "#78350f" }}>
                  {entry.date}
                </span>
                {watch && (
                  <span style={{ fontSize: 10, color: muted, marginLeft: 6 }}>
                    {watch.emoji ?? "⌚"} {watch.model}
                  </span>
                )}
              </div>
              {ctx && (
                <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4,
                               background: isDark ? "#1e3a5f" : "#dbeafe", color: "#3b82f6" }}>
                  {ctx}
                </span>
              )}
            </div>
            <div
              onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
              style={{ fontSize: 10, color: muted, marginBottom: 6, cursor: wornG.length > 0 ? "pointer" : "default" }}
            >
              {wornG.map(g => g.name?.slice(0, 18)).join(" · ") || "No garment data"}
              {wornG.length > 0 && <span style={{ marginLeft: 4, fontSize: 8 }}>{expandedEntry === entry.id ? "▲" : "▼"}</span>}
            </div>
            {expandedEntry === entry.id && wornG.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto", paddingBottom: 4 }}>
                {wornG.map(g => {
                  const photo = g.thumbnail || g.photoUrl;
                  return (
                    <div key={g.id} style={{
                      flexShrink: 0, width: 64, textAlign: "center",
                    }}>
                      {photo ? (
                        <img src={photo} alt={g.name} style={{ width: 60, height: 60, borderRadius: 6, objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 60, height: 60, borderRadius: 6, background: isDark ? "#1a1f2b" : "#f3f4f6",
                                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                          {g.type === "shirt" ? "👔" : g.type === "pants" ? "👖" : g.type === "shoes" ? "👞" : "•"}
                        </div>
                      )}
                      <div style={{ fontSize: 8, color: muted, marginTop: 2, lineHeight: 1.1, overflow: "hidden",
                                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.name?.slice(0, 14)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              {[5, 6, 7, 8, 9, 10].map(s => (
                <button key={s} onClick={() => onScore(entry.id, s)}
                  style={{
                    width: 32, height: 28, borderRadius: 6, border: "none",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    background: isDark ? "#1a1f2b" : "#fef9c3",
                    color: isDark ? "#fde68a" : "#92400e",
                  }}>{s}</button>
              ))}
              <button onClick={() => setDismissed(prev => new Set([...prev, entry.id]))}
                style={{ marginLeft: 4, height: 28, padding: "0 8px", borderRadius: 6, border: "none",
                  fontSize: 11, cursor: "pointer", background: "transparent", color: muted }}>Skip</button>
            </div>
          </div>
        );
      })}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "none",
                     cursor: page === 0 ? "default" : "pointer", opacity: page === 0 ? 0.3 : 1,
                     background: isDark ? "#1a1f2b" : "#f3f4f6", color: muted }}>← Prev</button>
          <span style={{ fontSize: 10, color: muted, lineHeight: "28px" }}>{page + 1}/{totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "none",
                     cursor: page >= totalPages - 1 ? "default" : "pointer", opacity: page >= totalPages - 1 ? 0.3 : 1,
                     background: isDark ? "#1a1f2b" : "#f3f4f6", color: muted }}>Next →</button>
        </div>
      )}
    </div>
  );
}
