import React from "react";

export default function WatchSelector({ watches, activeWatch, onChange }) {
  return (
    <div className="watch-selector" style={{
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#8b93a7" }}>Select Watch</label>
      <select
        value={activeWatch?.id ?? ""}
        onChange={(e) => {
          const watch = watches.find(w => w.id === e.target.value);
          if (watch) onChange(watch);
        }}
        style={{
          background: "#0f131a", color: "#e2e8f0",
          border: "1px solid #2b3140", borderRadius: 8,
          padding: "6px 12px", fontSize: 13, cursor: "pointer",
        }}
      >
        {watches.map(w => (
          <option key={w.id} value={w.id}>
            {w.model} — {w.dial}
          </option>
        ))}
      </select>
    </div>
  );
}
