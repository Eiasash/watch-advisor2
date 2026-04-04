/**
 * HistoryOutfitPhotos — renders garment thumbnails for a history entry.
 * Replaces text-only garment names with visual gallery.
 */
import React from "react";

/**
 * @param {{ garmentIds: Array, garments: Array, isDark: boolean }} props
 */
export default function HistoryOutfitPhotos({ garmentIds, garments, isDark }) {
  if (!garmentIds?.length || !garments?.length) return null;

  const worn = garments.filter(g => garmentIds.includes(g.id));
  if (!worn.length) return null;

  const hasPhotos = worn.some(g => g.thumbnail || g.photoUrl);
  if (!hasPhotos) return null; // Fall back to text display

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
      {worn.map(g => (
        <div key={g.id} style={{
          width: 44, borderRadius: 6, overflow: "hidden",
          border: `1px solid ${isDark ? "#2b3140" : "#e5e7eb"}`,
        }}>
          {(g.thumbnail || g.photoUrl) ? (
            <img src={g.thumbnail || g.photoUrl} alt={g.name ?? ""}
              style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }}
              title={g.name}
            />
          ) : (
            <div style={{
              width: "100%", aspectRatio: "3/4", display: "flex", alignItems: "center",
              justifyContent: "center", background: isDark ? "#0f131a" : "#f3f4f6",
              fontSize: 14,
            }} title={g.name}>👕</div>
          )}
        </div>
      ))}
    </div>
  );
}
