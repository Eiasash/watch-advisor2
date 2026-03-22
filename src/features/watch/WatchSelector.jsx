import React from "react";

export default function WatchSelector({ watches, activeWatch, onChange, isDark = false }) {
  // Filter retired (traded) watches from the selection dropdown.
  // Retired watches remain in the store for history display lookups.
  const selectable = watches.filter(w => !w.retired);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <label style={{ fontSize:12, fontWeight:600, color: isDark ? "#8b93a7" : "#6b7280", whiteSpace:"nowrap" }}>Watch</label>
      <select
        value={activeWatch?.id ?? ""}
        onChange={e => {
          const watch = selectable.find(w => w.id === e.target.value);
          if (watch) onChange(watch);
        }}
        style={{
          background: isDark ? "#0f131a" : "#ffffff",
          color:      isDark ? "#e2e8f0" : "#111827",
          border:     `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
          borderRadius:8,
          padding:"6px 10px", fontSize:12, cursor:"pointer",
          maxWidth:180,
        }}
      >
        {selectable.map(w => (
          <option key={w.id} value={w.id}>
            {w.model} — {w.dualDial ? `${w.dualDial.sideA} / ${w.dualDial.sideB}` : w.dial}
          </option>
        ))}
      </select>
    </div>
  );
}
