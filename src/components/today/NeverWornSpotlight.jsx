/**
 * NeverWornSpotlight — shows one never-worn garment daily with gentle suggestion.
 * Not aggressive — just awareness. User can dismiss or tap to select.
 */
import React, { useMemo } from "react";

/**
 * @param {{ garments: Array, history: Array, isDark: boolean, onSelect?: (id:string)=>void }} props
 */
export default function NeverWornSpotlight({ garments, history, isDark, onSelect }) {
  const spotlight = useMemo(() => {
    if (!garments?.length) return null;

    // Collect all garment IDs ever worn
    const wornIds = new Set();
    for (const h of (history ?? [])) {
      const ids = h.garmentIds ?? h.payload?.garmentIds ?? [];
      for (const id of ids) wornIds.add(id);
    }

    // Filter to wearable, never-worn garments (exclude accessories, bags, shoes — focus on shirts/pants/sweaters)
    const candidates = garments.filter(g =>
      !wornIds.has(g.id) &&
      !g.excludeFromWardrobe &&
      ["shirt", "pants", "sweater", "jacket"].includes(g.type)
    );

    if (!candidates.length) return null;

    // Deterministic daily pick based on date hash
    const today = new Date().toISOString().slice(0, 10);
    const hash = [...today].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return candidates[hash % candidates.length];
  }, [garments, history]);

  if (!spotlight) return null;

  const card = isDark ? "#161b22" : "#fffbeb";
  const border = isDark ? "#854d0e40" : "#fbbf2440";
  const text = isDark ? "#fde68a" : "#92400e";
  const muted = isDark ? "#d4a574" : "#a16207";

  return (
    <div style={{
      background: card, borderRadius: 14, border: `1px solid ${border}`,
      padding: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 12,
      cursor: onSelect ? "pointer" : "default",
    }}
    onClick={() => onSelect?.(spotlight.id)}>
      {(spotlight.thumbnail || spotlight.photoUrl) ? (
        <img
          src={spotlight.thumbnail || spotlight.photoUrl}
          alt={spotlight.name}
          style={{ width: 52, height: 68, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: 52, height: 68, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isDark ? "#1a1f2b" : "#f3f4f6", fontSize: 22,
        }}>👕</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: "uppercase",
                      letterSpacing: "0.05em", marginBottom: 2 }}>
          💡 Try something new
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: isDark ? "#fef3c7" : "#78350f",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {spotlight.name}
        </div>
        <div style={{ fontSize: 11, color: muted }}>
          {spotlight.color} {spotlight.type} · never logged
        </div>
      </div>
    </div>
  );
}
