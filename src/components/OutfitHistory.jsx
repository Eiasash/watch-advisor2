import React, { useState, useMemo } from "react";
import { useHistoryStore } from "../stores/historyStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import OutfitReplay from "./history/OutfitReplay.jsx";
import ScoreBackfill from "./history/ScoreBackfill.jsx";
import HistoryOutfitPhotos from "./history/HistoryOutfitPhotos.jsx";
import OutfitCompare from "./history/OutfitCompare.jsx";

export default function OutfitHistory() {
  const entries      = useHistoryStore(s => s.entries);
  const removeEntry  = useHistoryStore(s => s.removeEntry);
  const upsertEntry  = useHistoryStore(s => s.upsertEntry);
  const watches      = useWatchStore(s => s.watches);
  const garments     = useWardrobeStore(s => s.garments);
  const { mode } = useThemeStore();
  const isDark   = mode === "dark";

  const [filter, setFilter] = useState("all"); // "all" | "week" | "month"
  const [watchFilter, setWatchFilter] = useState("all");
  const [ctxFilter, setCtxFilter] = useState("all");

  const sorted = useMemo(() => {
    const now = Date.now();
    const cutoff = filter === "week" ? 7 : filter === "month" ? 30 : Infinity;
    return [...entries]
      .filter(e => {
        if (cutoff !== Infinity) {
          const d = new Date(e.date || e.loggedAt);
          if ((now - d.getTime()) / 86400000 > cutoff) return false;
        }
        if (watchFilter !== "all" && (e.watchId ?? e.watch_id) !== watchFilter) return false;
        const ctx = e.context ?? e.payload?.context ?? "unset";
        if (ctxFilter !== "all" && ctx !== ctxFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const da = new Date(b.date || b.loggedAt);
        const db = new Date(a.date || a.loggedAt);
        return da - db;
      });
  }, [entries, filter, watchFilter, ctxFilter]);

  // Unique watches and contexts in history for filter options
  const filterOptions = useMemo(() => {
    const wIds = new Set(); const ctxs = new Set();
    entries.forEach(e => {
      if (e.watchId) wIds.add(e.watchId);
      const c = e.context ?? e.payload?.context;
      if (c) ctxs.add(c);
    });
    return {
      watches: [...wIds].map(id => ({ id, label: watches.find(w => w.id === id)?.model ?? id })),
      contexts: [...ctxs].sort(),
    };
  }, [entries, watches]);

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

      {/* Watch + context filters */}
      {(filterOptions.watches.length > 1 || filterOptions.contexts.length > 1) && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {filterOptions.watches.length > 1 && (
            <select value={watchFilter} onChange={e => setWatchFilter(e.target.value)} style={{
              padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              border: `1px solid ${watchFilter !== "all" ? "#3b82f6" : border}`,
              background: isDark ? "#0f131a" : "#f9fafb", color: watchFilter !== "all" ? "#3b82f6" : sub,
              outline: "none",
            }}>
              <option value="all">All watches</option>
              {filterOptions.watches.map(w => (
                <option key={w.id} value={w.id}>⌚ {w.label}</option>
              ))}
            </select>
          )}
          {filterOptions.contexts.length > 1 && (
            <select value={ctxFilter} onChange={e => setCtxFilter(e.target.value)} style={{
              padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              border: `1px solid ${ctxFilter !== "all" ? "#8b5cf6" : border}`,
              background: isDark ? "#0f131a" : "#f9fafb", color: ctxFilter !== "all" ? "#8b5cf6" : sub,
              outline: "none",
            }}>
              <option value="all">All contexts</option>
              {filterOptions.contexts.map(c => (
                <option key={c} value={c}>{c.replace(/-/g, " ")}</option>
              ))}
            </select>
          )}
          {(watchFilter !== "all" || ctxFilter !== "all") && (
            <button onClick={() => { setWatchFilter("all"); setCtxFilter("all"); }} style={{
              padding: "4px 8px", borderRadius: 6, fontSize: 10, border: "none",
              background: "transparent", color: "#ef4444", cursor: "pointer", fontWeight: 600,
            }}>Clear</button>
          )}
        </div>
      )}

      {sorted.length === 0 && (
        <div style={{ fontSize: 13, color: sub, textAlign: "center", padding: "30px 0" }}>
          No outfits logged yet. Use "Wear This" on the Today or Wardrobe tab to log an outfit.
        </div>
      )}

      {/* Score backfill for unscored entries */}
      <ScoreBackfill
        entries={entries}
        watches={watches}
        garments={garments}
        onScore={(id, score) => {
          const entry = entries.find(e => e.id === id);
          if (entry) upsertEntry({ ...entry, score });
        }}
        isDark={isDark}
      />

      {/* Outfit comparison */}
      {entries.length >= 2 && (
        <OutfitCompare entries={entries} watches={watches} garments={garments} isDark={isDark} />
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
              <OutfitReplay entry={entry} isDark={isDark} onReplay={(e) => {
                // Dispatch custom event — AppShell listens and navigates to Today tab
                window.dispatchEvent(new CustomEvent("outfit-replay", { detail: {
                  garmentIds: e.garmentIds ?? e.payload?.garmentIds ?? [],
                  watchId: e.watchId ?? e.watch_id,
                  context: e.context ?? e.payload?.context,
                  strapId: e.strapId ?? null,
                }}));
              }} />
              <button
                onClick={() => { if (window.confirm(`Delete log for ${dayName}?`)) removeEntry(entry.id); }}
                style={{ marginLeft: "auto", background: "none", border: "none",
                         color: isDark ? "#4b5563" : "#d1d5db", fontSize: 16,
                         cursor: "pointer", padding: "2px 6px", lineHeight: 1 }}
                title="Delete this log">✕</button>
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

            {/* Garment photo gallery */}
            <HistoryOutfitPhotos garmentIds={entry.garmentIds ?? []} garments={garments} isDark={isDark} />

            {entry.notes && (
              <div style={{ marginTop: 6, fontSize: 11, color: sub, fontStyle: "italic" }}>{entry.notes}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
