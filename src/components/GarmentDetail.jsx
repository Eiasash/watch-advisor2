/**
 * GarmentDetail — modal showing full stats for a single garment.
 * - Wear count + last worn date
 * - Which watches it was paired with
 * - Which other garments it was worn alongside
 * - Context distribution (clinic vs casual vs date night)
 * - Photo (if available)
 */
import React, { useMemo } from "react";

export default function GarmentDetail({ garment, history, watches, garments, isDark, onClose }) {
  if (!garment) return null;

  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  const card = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const accent = "#3b82f6";

  const stats = useMemo(() => {
    const wearDates = [];
    const watchPairings = {};
    const garmentPairings = {};
    const contextDist = {};

    history.forEach(entry => {
      const ids = entry.garmentIds ?? entry.payload?.garmentIds ?? [];
      if (!ids.includes(garment.id)) return;

      wearDates.push(entry.date);

      // Watch pairing
      const wid = entry.watchId ?? entry.watch_id;
      if (wid) watchPairings[wid] = (watchPairings[wid] ?? 0) + 1;

      // Garment pairings (other garments worn same day)
      ids.forEach(id => {
        if (id !== garment.id) garmentPairings[id] = (garmentPairings[id] ?? 0) + 1;
      });

      // Context
      const ctx = entry.context ?? entry.payload?.context ?? "unset";
      contextDist[ctx] = (contextDist[ctx] ?? 0) + 1;
    });

    const topWatches = Object.entries(watchPairings)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, count]) => {
        const w = watches.find(x => x.id === id);
        return { name: w ? `${w.brand} ${w.model}` : id, count };
      });

    const topPairings = Object.entries(garmentPairings)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, count]) => {
        const g = garments.find(x => x.id === id);
        return { name: g?.name ?? id, count, photo: g?.thumbnail || g?.photoUrl };
      });

    const sorted = wearDates.sort();
    return {
      wearCount: wearDates.length,
      firstWorn: sorted[0] ?? null,
      lastWorn: sorted[sorted.length - 1] ?? null,
      topWatches,
      topPairings,
      contextDist: Object.entries(contextDist).sort(([, a], [, b]) => b - a),
    };
  }, [garment.id, history, watches, garments]);

  const photo = garment.thumbnail || garment.photoUrl;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 440, maxHeight: "85vh", overflowY: "auto",
        background: card, borderRadius: "18px 18px 0 0",
        padding: "18px 16px 24px", boxShadow: "0 -4px 24px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          {photo ? (
            <img src={photo} alt={garment.name} style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover" }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: 10, background: isDark ? "#0f131a" : "#f3f4f6",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
              {garment.type === "shirt" ? "👔" : garment.type === "pants" ? "👖" : garment.type === "shoes" ? "👞" : "👕"}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{garment.name}</div>
            {garment.brand && <div style={{ fontSize: 12, color: muted }}>{garment.brand}</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
              {garment.color && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: isDark ? "#1a1f2b" : "#f3f4f6", color: text }}>{garment.color}</span>}
              {garment.material && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: isDark ? "#1a1f2b" : "#f3f4f6", color: text }}>{garment.material}</span>}
              {garment.weight && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: isDark ? "#1a1f2b" : "#f3f4f6", color: text }}>{garment.weight}</span>}
            </div>
          </div>
        </div>

        {/* Wear stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            { label: "Worn", value: stats.wearCount, emoji: "👔" },
            { label: "First", value: stats.firstWorn?.slice(5) ?? "—", emoji: "📅" },
            { label: "Last", value: stats.lastWorn?.slice(5) ?? "—", emoji: "🕐" },
          ].map(({ label, value, emoji }) => (
            <div key={label} style={{
              padding: "8px", borderRadius: 8, textAlign: "center",
              background: isDark ? "#0f131a" : "#f9fafb", border: `1px solid ${border}`,
            }}>
              <div style={{ fontSize: 14 }}>{emoji}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: text }}>{value}</div>
              <div style={{ fontSize: 9, color: muted, textTransform: "uppercase" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Context distribution */}
        {stats.contextDist.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", marginBottom: 6 }}>Context</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {stats.contextDist.map(([ctx, count]) => (
                <span key={ctx} style={{
                  padding: "3px 8px", borderRadius: 6, fontSize: 10,
                  background: isDark ? "#1a1f2b" : "#f3f4f6",
                  border: `1px solid ${border}`, color: text,
                }}>
                  {ctx === "unset" ? "any" : ctx.replace(/-/g, " ")} ({count})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Watch pairings */}
        {stats.topWatches.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", marginBottom: 6 }}>Paired with watches</div>
            {stats.topWatches.map(({ name, count }) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", color: text }}>
                <span>⌚ {name}</span>
                <span style={{ color: muted }}>×{count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Garment pairings */}
        {stats.topPairings.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", marginBottom: 6 }}>Often worn with</div>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
              {stats.topPairings.map(({ name, count, photo }) => (
                <div key={name} style={{ flexShrink: 0, width: 60, textAlign: "center" }}>
                  {photo ? (
                    <img src={photo} alt={name} style={{ width: 52, height: 52, borderRadius: 6, objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: 52, height: 52, borderRadius: 6, background: isDark ? "#1a1f2b" : "#f3f4f6",
                                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>👕</div>
                  )}
                  <div style={{ fontSize: 8, color: muted, marginTop: 2, lineHeight: 1.1, overflow: "hidden",
                                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name?.slice(0, 12)}</div>
                  <div style={{ fontSize: 8, color: accent }}>×{count}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats.wearCount === 0 && (
          <div style={{ textAlign: "center", padding: "16px 0", color: muted, fontSize: 12 }}>
            Never worn yet — give it a try!
          </div>
        )}

        <button onClick={onClose} style={{
          width: "100%", padding: "10px 0", borderRadius: 10,
          border: `1px solid ${border}`, background: "transparent",
          color: muted, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>Close</button>
      </div>
    </div>
  );
}
