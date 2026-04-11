/**
 * TailorCountdown — shows tailor queue status with countdown to pickup day.
 * Reads tailor-flagged garments from wardrobe and displays a compact card.
 */
import React, { useMemo } from "react";

/**
 * @param {Array} garments - all garments from wardrobeStore
 * @param {boolean} isDark - dark mode flag
 * @param {string} [pickupDate] - ISO date string for pickup day (optional override)
 */
export default function TailorCountdown({ garments, isDark, pickupDate }) {
  const tailorItems = useMemo(() => {
    if (!garments?.length) return [];
    return garments.filter(g => {
      if (g.excludeFromWardrobe) return false;
      const notes = (g.notes ?? "").toLowerCase();
      return notes.includes("tailor") || notes.includes("pulls at chest") ||
             notes.includes("billows") || notes.includes("wide in torso") ||
             notes.includes("sleeves") || notes.includes("cuffs too");
    });
  }, [garments]);

  if (!tailorItems.length) return null;

  // Calculate days until pickup
  const pickup = pickupDate ? new Date(pickupDate) : null;
  let daysLeft = null;
  let pickupLabel = null;
  if (pickup) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const pickupDay = new Date(pickup.toISOString().slice(0, 10));
    daysLeft = Math.ceil((pickupDay - today) / 86_400_000);
    if (daysLeft <= 0) {
      pickupLabel = "Ready for pickup!";
    } else if (daysLeft === 1) {
      pickupLabel = "Pickup tomorrow";
    } else {
      pickupLabel = `${daysLeft} days until pickup`;
    }
  }

  const bg = isDark ? "#1a1f2b" : "#f0fdf4";
  const border = isDark ? "#166534" : "#86efac";
  const text = isDark ? "#86efac" : "#166534";
  const muted = isDark ? "#a3a3a3" : "#78716c";

  return (
    <div style={{ background: bg, borderRadius: 12, border: `1px solid ${border}`, padding: "10px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: text }}>
          🧵 Tailor Queue · {tailorItems.length} piece{tailorItems.length > 1 ? "s" : ""}
        </div>
        {pickupLabel && (
          <div style={{
            fontSize: 10, fontWeight: 700, color: daysLeft <= 0 ? "#22c55e" : text,
            background: isDark ? "#0f131a" : "#dcfce7", borderRadius: 6, padding: "2px 8px",
          }}>
            {pickupLabel}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {tailorItems.map(g => (
          <span key={g.id} style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 6,
            background: isDark ? "#0f131a" : "#e5e7eb", color: muted,
          }}>
            {(g.name ?? "").slice(0, 25)}
          </span>
        ))}
      </div>
    </div>
  );
}
