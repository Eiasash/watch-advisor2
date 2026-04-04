/**
 * OutfitReplay — "Wear this again" button for history entries.
 * When tapped, copies garmentIds + watchId + context to today's form.
 */
import React from "react";

/**
 * @param {{ entry: object, isDark: boolean, onReplay: (entry: object) => void }} props
 */
export default function OutfitReplay({ entry, isDark, onReplay }) {
  if (!entry || !(entry.garmentIds?.length || entry.payload?.garmentIds?.length)) return null;

  const hasGarments = (entry.garmentIds ?? entry.payload?.garmentIds ?? []).length > 0;
  if (!hasGarments) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onReplay(entry);
      }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "4px 10px", borderRadius: 16, border: "none",
        fontSize: 11, fontWeight: 600, cursor: "pointer",
        background: isDark ? "#1e3a5f" : "#dbeafe",
        color: isDark ? "#93c5fd" : "#1e40af",
      }}
    >
      🔁 Wear again
    </button>
  );
}
