/**
 * WatchRotationPanel — per-watch rotation health table.
 * Reads from historyStore via domain/rotationStats (no new persistence).
 * Shows: idle days / wear count / CPW, sorted by most neglected first.
 */
import React, { useMemo } from "react";
import { useWatchStore }   from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore }   from "../stores/themeStore.js";
import { buildRotationTable } from "../domain/rotationStats.js";

/** Idle-day colour coding */
function idleColor(idle, isDark) {
  if (!isFinite(idle) || idle >= 21) return "#ef4444"; // red — neglected
  if (idle >= 8)                      return "#f59e0b"; // amber — getting stale
  return "#22c55e";                                     // green — recently worn
}

function idleLabel(idle) {
  if (!isFinite(idle)) return "never";
  if (idle === 0)      return "today";
  if (idle === 1)      return "yesterday";
  return `${idle}d`;
}

function dialDot(dialColor) {
  const MAP = {
    "silver-white": "#e2e8f0", "white":"#f3f4f6", "black":"#1f2937",
    "navy":"#1e3a5f", "blue":"#2563eb", "grey":"#9ca3af", "green":"#16a34a",
    "teal":"#0d9488", "red":"#dc2626", "burgundy":"#6b1d1d", "turquoise":"#06b6d4",
    "purple":"#9333ea", "meteorite":"#6b7280", "white-teal":"#0d9488",
    "black-red":"#dc2626",
  };
  return MAP[dialColor?.toLowerCase()] ?? "#6b7280";
}

export default function WatchRotationPanel() {
  const { mode }  = useThemeStore();
  const isDark    = mode === "dark";
  const watches   = useWatchStore(s => s.watches);
  const entries   = useHistoryStore(s => s.entries);

  const rows = useMemo(() => buildRotationTable(watches, entries), [watches, entries]);

  const card   = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const muted  = isDark ? "#6b7280" : "#9ca3af";
  const hdr    = isDark ? "#0f131a" : "#f3f4f6";

  return (
    <div style={{ background: card, borderRadius: 16, border: `1px solid ${border}`,
                  overflow: "hidden", marginBottom: 16 }}>

      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${border}`,
                    display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: text }}>Watch Rotation</div>
        <div style={{ fontSize: 11, color: muted }}>
          {rows.filter(r => !isFinite(r.idle) || r.idle >= 14).length} need attention
        </div>
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 52px 52px 56px",
                    padding: "6px 18px", background: hdr,
                    borderBottom: `1px solid ${border}` }}>
        {["Watch", "Idle", "Wears", "CPW"].map(h => (
          <div key={h} style={{ fontSize: 10, fontWeight: 700, color: muted,
                                textTransform: "uppercase", letterSpacing: "0.07em",
                                textAlign: h === "Watch" ? "left" : "right" }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      {rows.map(({ watch: w, idle, count, cpw }, i) => {
        const color = idleColor(idle, isDark);
        const isReplica = !!w.replica;
        return (
          <div key={w.id}
            style={{ display: "grid", gridTemplateColumns: "1fr 52px 52px 56px",
                     padding: "10px 18px", alignItems: "center",
                     borderBottom: i < rows.length - 1 ? `1px solid ${border}` : "none",
                     background: (!isFinite(idle) || idle >= 21) && !isReplica
                       ? (isDark ? "#1a0f0f" : "#fff5f5")
                       : "transparent" }}>

            {/* Watch name + dial dot */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%",
                            background: dialDot(w.dial), flexShrink: 0,
                            border: `1px solid ${isDark ? "#374151" : "#d1d5db"}` }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: text,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {w.brand} {w.model}
                </div>
                <div style={{ fontSize: 10, color: muted }}>
                  {isReplica ? "replica" : `₪${(w.priceILS ?? 0).toLocaleString()}`}
                </div>
              </div>
            </div>

            {/* Idle days */}
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color,
                             background: `${color}18`, borderRadius: 6,
                             padding: "2px 7px", display: "inline-block" }}>
                {idleLabel(idle)}
              </span>
            </div>

            {/* Wear count */}
            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: text }}>
              {count}
            </div>

            {/* CPW */}
            <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700,
                          color: cpw == null ? muted
                               : cpw <= 50  ? "#22c55e"
                               : cpw <= 200 ? "#f59e0b"
                               : "#ef4444" }}>
              {cpw != null ? `₪${cpw}` : "—"}
            </div>
          </div>
        );
      })}

      <div style={{ padding: "8px 18px", fontSize: 10, color: muted,
                    borderTop: `1px solid ${border}` }}>
        CPW = cost per wear · prices approximate · replicas excluded from CPW
      </div>
    </div>
  );
}
