/**
 * TailorQueue — shows garments flagged for tailoring with specific fix needed.
 * "Mark as done" clears the flag and returns garment to active rotation.
 */
import React, { useMemo } from "react";

const FIT_ISSUES = {
  tight: { icon: "🔴", label: "Tight", action: "Let out / assess" },
  "needs-tailor": { icon: "🟡", label: "Needs tailor", action: "See notes" },
  oversized: { icon: "🟠", label: "Oversized", action: "Take in" },
};

/**
 * @param {{ garments: Array, onMarkDone: (id: string) => void, isDark: boolean }} props
 */
export default function TailorQueue({ garments, onMarkDone, isDark }) {
  const queue = useMemo(() => {
    if (!garments?.length) return [];
    return garments.filter(g => {
      if (g.excludeFromWardrobe) return false;
      const fit = g.fit ?? "";
      const notes = (g.notes ?? "").toLowerCase();
      return fit === "tight" || fit === "needs-tailor" ||
        notes.includes("tailor") || notes.includes("cuff") ||
        notes.includes("sleeve") || notes.includes("billows") ||
        notes.includes("pulls at") || notes.includes("too wide") ||
        notes.includes("too long");
    });
  }, [garments]);

  if (!queue.length) return null;

  const card = isDark ? "#161b22" : "#fff7ed";
  const border = isDark ? "#92400e30" : "#fed7aa40";
  const text = isDark ? "#fbbf24" : "#92400e";
  const muted = isDark ? "#d97706" : "#b45309";
  const btnBg = isDark ? "#14532d" : "#dcfce7";
  const btnColor = isDark ? "#86efac" : "#166534";

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: "uppercase",
                    letterSpacing: "0.05em", marginBottom: 10 }}>
        ✂️ Tailor queue ({queue.length})
      </div>
      {queue.map(g => {
        const info = FIT_ISSUES[g.fit] ?? { icon: "🟡", label: g.fit || "Check", action: "See notes" };
        return (
          <div key={g.id} style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "8px 0", borderBottom: `1px solid ${isDark ? "#1a1f2b" : "#fed7aa30"}`,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{info.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#fef3c7" : "#78350f" }}>
                {g.name}
              </div>
              <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>
                {g.notes?.slice(0, 80) || info.action}
              </div>
            </div>
            {onMarkDone && (
              <button
                onClick={(e) => { e.stopPropagation(); onMarkDone(g.id); }}
                style={{
                  padding: "4px 10px", borderRadius: 8, border: "none",
                  fontSize: 10, fontWeight: 700, cursor: "pointer",
                  background: btnBg, color: btnColor, flexShrink: 0,
                }}>
                ✓ Done
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
