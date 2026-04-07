import React from "react";

/**
 * Garment thumbnail card — used inside GarmentPicker.
 * Shows photo or emoji fallback, selection checkmark, and type label.
 */
export default function GarmentThumb({ g, selected, onClick, isDark }) {
  const border = isDark ? "#2b3140" : "#d1d5db";
  return (
    <div onClick={onClick}
      style={{ position: "relative", cursor: "pointer", borderRadius: 10, overflow: "hidden",
               border: `2px solid ${selected ? "#3b82f6" : border}`,
               background: isDark ? "#0f131a" : "#f3f4f6",
               transition: "border-color 0.12s" }}>
      {(g.thumbnail || g.photoUrl) ? (
        <img src={g.thumbnail || g.photoUrl} alt={g.name}
          style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: "100%", aspectRatio: "3/4", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 4 }}>
          <div style={{ fontSize: 24 }}>👕</div>
          <div style={{ fontSize: 11, color: isDark ? "#6b7280" : "#9ca3af", textAlign: "center", padding: "0 4px" }}>
            {g.name?.slice(0, 18)}
          </div>
        </div>
      )}
      {selected && (
        <div style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%",
                      background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "#fff", fontWeight: 700 }}>✓</div>
      )}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,#00000088)",
                    padding: "12px 4px 4px", fontSize: 11, color: "#fff", textAlign: "center", fontWeight: 600 }}>
        {g.type?.toUpperCase()}
      </div>
    </div>
  );
}
