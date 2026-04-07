import React from "react";
import GarmentThumb from "./GarmentThumb.jsx";

// Normalised to lowercase to match garment.type values (DB stores lowercase)
const GARMENT_PRIORITY = ["shoes", "pants", "shirt", "sweater", "jacket", "coat"];

/**
 * Garment selection grid with type-filter tabs.
 * Computes activeGarments / garmentTypes / visible internally.
 */
export default function GarmentPicker({
  garments, selected, toggleGarment, onClearAll,
  filter, setFilter,
  isDark, card, border, muted,
}) {
  const activeGarments = garments.filter(
    g => !g.excludeFromWardrobe && g.type !== "outfit-photo" && g.type !== "outfit-shot"
  );

  const types = new Set(activeGarments.map(g => (g.type ?? "").toLowerCase()).filter(Boolean));
  const garmentTypes = [
    "all",
    ...GARMENT_PRIORITY.filter(t => types.has(t)),
    ...[...types].filter(t => !GARMENT_PRIORITY.includes(t)),
  ];

  const visible = filter === "all"
    ? activeGarments
    : activeGarments.filter(g => (g.type ?? "").toLowerCase() === filter);

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Garments {selected.size > 0 && <span style={{ color: "#3b82f6" }}>({selected.size})</span>}
        </div>
        {selected.size > 0 && (
          <button onClick={onClearAll}
            style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}>
            Clear all
          </button>
        )}
      </div>

      {/* Type filter tabs */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 4 }}>
        {garmentTypes.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ padding: "4px 10px", borderRadius: 14, border: "none", fontSize: 11, fontWeight: 600,
                     whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0,
                     background: filter === t ? "#3b82f6" : (isDark ? "#1a1f2b" : "#f3f4f6"),
                     color: filter === t ? "#fff" : muted }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(88px,1fr))", gap: 8 }}>
        {visible.map(g => (
          <GarmentThumb key={g.id} g={g} selected={selected.has(g.id)}
            onClick={() => toggleGarment(g.id)} isDark={isDark} />
        ))}
      </div>
    </div>
  );
}
