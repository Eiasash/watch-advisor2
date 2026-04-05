/**
 * OutfitCompare — select two history entries to compare side-by-side.
 * Shows garments, watch, context, score, photos for each.
 */
import React, { useState, useMemo } from "react";

const SLOT_ICONS = { shirt: "👔", sweater: "🧶", pants: "👖", shoes: "👞", jacket: "🧥", belt: "🪢" };

export default function OutfitCompare({ entries, watches, garments, isDark }) {
  const [picks, setPicks] = useState([null, null]); // [entryId, entryId]
  const [selecting, setSelecting] = useState(null); // 0 or 1

  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  const card = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const accent = "#3b82f6";

  const recentEntries = useMemo(() =>
    entries
      .filter(e => (e.garmentIds?.length ?? 0) > 0)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 30),
  [entries]);

  const getEntry = (id) => entries.find(e => e.id === id);

  const renderSide = (entryId, side) => {
    const entry = getEntry(entryId);
    if (!entry) return (
      <div onClick={() => setSelecting(side)} style={{
        flex: 1, minHeight: 200, borderRadius: 12,
        border: `2px dashed ${border}`, display: "flex", alignItems: "center",
        justifyContent: "center", cursor: "pointer",
        background: isDark ? "#0f131a" : "#f9fafb",
      }}>
        <div style={{ textAlign: "center", color: muted }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>+</div>
          <div style={{ fontSize: 11 }}>Select outfit {side + 1}</div>
        </div>
      </div>
    );

    const watch = watches.find(w => w.id === entry.watchId);
    const gids = entry.garmentIds ?? [];
    const wornG = garments.filter(g => gids.includes(g.id));
    const score = entry.score ?? entry.payload?.score;
    const ctx = entry.context ?? entry.payload?.context;
    const photo = entry.outfitPhoto ?? entry.outfitPhotos?.[0];

    return (
      <div style={{ flex: 1, borderRadius: 12, border: `1px solid ${border}`, overflow: "hidden", background: card }}>
        {/* Photo */}
        {photo && (
          <img src={photo} alt="Outfit" style={{ width: "100%", height: 140, objectFit: "cover" }} />
        )}
        {/* Header */}
        <div style={{ padding: "8px 10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: accent }}>{entry.date}</span>
            {score != null && (
              <span style={{ fontSize: 10, fontWeight: 700, color: score >= 8 ? "#22c55e" : score >= 6 ? "#f59e0b" : "#ef4444" }}>
                {score}/10
              </span>
            )}
          </div>
          {watch && <div style={{ fontSize: 10, color: muted, marginBottom: 4 }}>⌚ {watch.model}</div>}
          {ctx && <div style={{ fontSize: 9, color: accent, marginBottom: 6, textTransform: "uppercase" }}>{ctx}</div>}

          {/* Garments */}
          {wornG.map(g => {
            const photo = g.thumbnail || g.photoUrl;
            const type = g.type ?? g.category;
            const icon = SLOT_ICONS[type] ?? "•";
            return (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                {photo ? (
                  <img src={photo} alt="" style={{ width: 22, height: 22, borderRadius: 3, objectFit: "cover" }} />
                ) : (
                  <span style={{ width: 22, textAlign: "center", fontSize: 12 }}>{icon}</span>
                )}
                <span style={{ fontSize: 10, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.name?.slice(0, 20)}
                </span>
              </div>
            );
          })}
          {wornG.length === 0 && <div style={{ fontSize: 10, color: muted }}>No garment data</div>}

          <button onClick={() => { setPicks(p => { const n = [...p]; n[side] = null; return n; }); }}
            style={{ marginTop: 6, fontSize: 9, color: muted, background: "none", border: "none", cursor: "pointer" }}>
            Change
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: "uppercase",
                    letterSpacing: "0.05em", marginBottom: 8 }}>
        🔀 Compare Outfits
      </div>

      {/* Side by side */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {renderSide(picks[0], 0)}
        {renderSide(picks[1], 1)}
      </div>

      {/* Selector drawer */}
      {selecting !== null && (
        <div style={{
          background: card, borderRadius: 12, border: `1px solid ${border}`,
          padding: 10, maxHeight: 240, overflowY: "auto",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: muted, marginBottom: 6, textTransform: "uppercase" }}>
            Select outfit {selecting + 1}
          </div>
          {recentEntries.map(e => {
            const watch = watches.find(w => w.id === e.watchId);
            const gids = e.garmentIds ?? [];
            const names = gids.map(id => garments.find(g => g.id === id)?.name?.slice(0, 12)).filter(Boolean);
            const isOther = picks[1 - selecting] === e.id;
            return (
              <div key={e.id}
                onClick={() => { if (!isOther) { setPicks(p => { const n = [...p]; n[selecting] = e.id; return n; }); setSelecting(null); } }}
                style={{
                  padding: "6px 8px", borderRadius: 6, marginBottom: 3,
                  cursor: isOther ? "default" : "pointer", opacity: isOther ? 0.3 : 1,
                  background: isDark ? "#0f131a" : "#f9fafb",
                  border: `1px solid ${border}`,
                }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: text }}>
                  {e.date} · {watch?.model ?? "?"} {e.score != null ? `· ${e.score}/10` : ""}
                </div>
                <div style={{ fontSize: 9, color: muted }}>{names.join(" · ") || "no garments"}</div>
              </div>
            );
          })}
          <button onClick={() => setSelecting(null)} style={{
            width: "100%", padding: "6px 0", marginTop: 4, borderRadius: 6,
            border: `1px solid ${border}`, background: "transparent",
            color: muted, fontSize: 11, cursor: "pointer",
          }}>Cancel</button>
        </div>
      )}
    </div>
  );
}
