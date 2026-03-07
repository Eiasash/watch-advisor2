import React, { useState, useMemo } from "react";
import { useHistoryStore } from "../stores/historyStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useThemeStore } from "../stores/themeStore.js";

export default function OutfitHistory() {
  const entries  = useHistoryStore(s => s.entries);
  const watches  = useWatchStore(s => s.watches);
  const garments = useWardrobeStore(s => s.garments);
  const { mode } = useThemeStore();
  const isDark   = mode === "dark";

  const [filter, setFilter] = useState("all"); // "all" | "week" | "month"

  const sorted = useMemo(() => {
    const now = Date.now();
    const cutoff = filter === "week" ? 7 : filter === "month" ? 30 : Infinity;
    return [...entries]
      .filter(e => {
        if (cutoff === Infinity) return true;
        const d = new Date(e.date || e.loggedAt);
        return (now - d.getTime()) / 86400000 <= cutoff;
      })
      .sort((a, b) => {
        const da = new Date(b.date || b.loggedAt);
        const db = new Date(a.date || a.loggedAt);
        return da - db;
      });
  }, [entries, filter]);

  const bg     = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const sub    = isDark ? "#8b93a7" : "#6b7280";
  const card   = isDark ? "#0f131a" : "#f9fafb";

  const filterBtn = (key, label) => (
    <button key={key} onClick={() => setFilter(key)} style={{
      padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
      border: `1px solid ${filter === key ? "#3b82f6" : border}`,
      background: filter === key ? "#1d4ed822" : "transparent",
      color: filter === key ? "#3b82f6" : sub, cursor: "pointer",
    }}>{label}</button>
  );

  return (
    <div style={{ padding: "18px 20px", borderRadius: 16, background: bg, border: `1px solid ${border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: text }}>Outfit History</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {filterBtn("week", "7d")}
          {filterBtn("month", "30d")}
          {filterBtn("all", "All")}
        </div>
      </div>

      {sorted.length === 0 && (
        <div style={{ fontSize: 13, color: sub, textAlign: "center", padding: "30px 0" }}>
          No outfits logged yet. Use "Wear This" on the Today or Wardrobe tab to log an outfit.
        </div>
      )}

      {sorted.map(entry => {
        const watch = watches.find(w => w.id === entry.watchId);
        const worn  = (entry.garmentIds ?? []).map(id => garments.find(g => g.id === id)).filter(Boolean);
        const dateStr = entry.date || (entry.loggedAt ? entry.loggedAt.slice(0, 10) : "?");
        const dayName = (() => {
          try {
            return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          } catch { return dateStr; }
        })();

        return (
          <div key={entry.id} style={{
            marginBottom: 10, padding: 12, borderRadius: 12,
            background: card, border: `1px solid ${border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{dayName}</div>
              {entry.context && (
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6,
                               background: isDark ? "#1e3a5f" : "#dbeafe", color: "#3b82f6" }}>
                  {entry.context}
                </span>
              )}
            </div>

            {/* Watch */}
            {watch && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                {watch.thumbnail && (
                  <img src={watch.thumbnail} alt={watch.model} style={{
                    width: 36, height: 36, borderRadius: 6, objectFit: "cover",
                  }} />
                )}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: text }}>
                    {watch.brand} {watch.model}
                  </div>
                  {entry.strapLabel && (
                    <div style={{ fontSize: 11, color: sub }}>{entry.strapLabel}</div>
                  )}
                </div>
              </div>
            )}

            {/* Garments */}
            {worn.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {worn.map(g => (
                  <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 8px", borderRadius: 6, background: isDark ? "#1a1f2b" : "#f3f4f6",
                    fontSize: 11, color: sub }}>
                    {(g.thumbnail || g.photoUrl) && (
                      <img src={g.thumbnail || g.photoUrl} alt={g.name}
                        style={{ width: 22, height: 22, borderRadius: 4, objectFit: "cover" }} />
                    )}
                    {g.name || g.type}
                  </div>
                ))}
              </div>
            )}

            {entry.notes && (
              <div style={{ marginTop: 6, fontSize: 11, color: sub, fontStyle: "italic" }}>{entry.notes}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
