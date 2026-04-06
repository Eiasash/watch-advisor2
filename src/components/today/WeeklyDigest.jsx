/**
 * WeeklyDigest — summary of last week's outfit performance.
 * Shows on Sundays (Israel's first work day) or when there's a full week of data.
 * Displays: outfits logged, unique watches, avg score, most-worn garment, streak.
 */
import React, { useMemo, useState } from "react";
import { useHistoryStore } from "../../stores/historyStore.js";
import { useWatchStore } from "../../stores/watchStore.js";
import { useWardrobeStore } from "../../stores/wardrobeStore.js";
import { useThemeStore } from "../../stores/themeStore.js";

export default function WeeklyDigest() {
  const history = useHistoryStore(s => s.entries) ?? [];
  const watches = useWatchStore(s => s.watches) ?? [];
  const garments = useWardrobeStore(s => s.garments) ?? [];
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const [dismissed, setDismissed] = useState(false);

  const digest = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday
    // Only show on Sunday (work week start) or Monday
    if (dayOfWeek !== 0 && dayOfWeek !== 1) return null;

    // Last 7 days
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);

    const weekEntries = history.filter(e => e.date >= weekStr && e.date < todayStr);
    if (weekEntries.length < 2) return null; // Not enough data

    // Unique watches
    const uniqueWatches = new Set(weekEntries.map(e => e.watchId).filter(Boolean));

    // Avg score
    const scores = weekEntries.map(e => e.score ?? e.payload?.score).filter(s => s != null);
    const avgScore = scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

    // Most worn garment
    const gFreq = {};
    weekEntries.forEach(e => (e.garmentIds ?? []).forEach(id => { gFreq[id] = (gFreq[id] ?? 0) + 1; }));
    const topGarmentId = Object.entries(gFreq).sort(([, a], [, b]) => b - a)[0];
    const topGarment = topGarmentId ? garments.find(g => g.id === topGarmentId[0]) : null;

    // Context split
    const ctxs = {};
    weekEntries.forEach(e => {
      const c = e.context ?? e.payload?.context ?? "unset";
      ctxs[c] = (ctxs[c] ?? 0) + 1;
    });

    return {
      outfitCount: weekEntries.length,
      uniqueWatches: uniqueWatches.size,
      avgScore,
      topGarment: topGarment ? { name: topGarment.name, count: topGarmentId[1] } : null,
      contexts: Object.entries(ctxs).sort(([, a], [, b]) => b - a),
    };
  }, [history, garments]);

  if (!digest || dismissed) return null;

  const card = isDark ? "#161b22" : "#f0fdf4";
  const border = isDark ? "#16a34a30" : "#bbf7d040";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  const accent = "#22c55e";

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          📋 Last Week
        </span>
        <button onClick={() => setDismissed(true)} style={{
          background: "none", border: "none", color: muted, fontSize: 16, cursor: "pointer", padding: "2px 6px",
        }}>✕</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: text }}>{digest.outfitCount}</div>
          <div style={{ fontSize: 9, color: muted, textTransform: "uppercase" }}>Outfits</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: text }}>{digest.uniqueWatches}</div>
          <div style={{ fontSize: 9, color: muted, textTransform: "uppercase" }}>Watches</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: text }}>{digest.avgScore ?? "—"}</div>
          <div style={{ fontSize: 9, color: muted, textTransform: "uppercase" }}>Avg Score</div>
        </div>
      </div>

      {digest.topGarment && (
        <div style={{ fontSize: 11, color: text, marginBottom: 6 }}>
          Most worn: <span style={{ fontWeight: 700 }}>{digest.topGarment.name}</span>
          <span style={{ color: muted }}> ({digest.topGarment.count}×)</span>
        </div>
      )}

      {digest.contexts.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {digest.contexts.map(([ctx, count]) => (
            <span key={ctx} style={{
              padding: "2px 6px", borderRadius: 4, fontSize: 9,
              background: isDark ? "#14532d" : "#dcfce7", color: isDark ? "#86efac" : "#166534",
            }}>
              {ctx === "unset" ? "any" : ctx.replace(/-/g, " ")} ({count})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
