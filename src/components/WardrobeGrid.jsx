import React, { useMemo } from "react";
import { FixedSizeGrid } from "react-window";
import { useWardrobeStore } from "../stores/wardrobeStore.js";

const COLUMN_COUNT = 3;
const CELL_WIDTH   = 192;
const CELL_HEIGHT  = 280;
const GRID_WIDTH   = COLUMN_COUNT * CELL_WIDTH;
const GRID_HEIGHT  = 560;

const TYPE_ICONS   = { shirt: "👔", pants: "👖", shoes: "👟", jacket: "🧥" };
const COLOR_SWATCHES = {
  black: "#1a1a1a", white: "#f5f5f0", grey: "#8a8a8a", navy: "#1e2f5e",
  blue: "#2d5fa0", brown: "#6b3a2a", tan: "#c4a882", beige: "#d4c4a8",
  olive: "#6b7c3a", green: "#2d6b3a", red: "#8b2020",
};

function Badge({ label, color = "#374151", bg = "#1f2937" }) {
  return (
    <span style={{
      display: "inline-block", fontSize: 10, fontWeight: 600,
      padding: "1px 6px", borderRadius: 4,
      color, background: bg, marginRight: 3, marginTop: 3,
      letterSpacing: "0.04em", textTransform: "uppercase",
    }}>
      {label}
    </span>
  );
}

const Cell = React.memo(function Cell({ columnIndex, rowIndex, style, data }) {
  const index = rowIndex * data.columns + columnIndex;
  const item  = data.items[index];
  if (!item) return null;

  const swatch = COLOR_SWATCHES[item.color] ?? "#333";
  const isOutfitShot = item.photoType === "outfit-shot";
  const needsReview  = item.needsReview;
  const isDuplicate  = !!item.duplicateOf;

  return (
    <div style={{ ...style, padding: 6 }}>
      <div style={{
        height: "100%", borderRadius: 12, overflow: "hidden",
        background: "#0f131a",
        border: `1px solid ${needsReview ? "#854d0e" : isDuplicate ? "#7c3aed" : "#2b3140"}`,
        display: "flex", flexDirection: "column",
      }}>
        {/* Image area */}
        {item.thumbnail || item.photoUrl ? (
          <img
            src={item.thumbnail || item.photoUrl}
            alt={item.name}
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: 148, objectFit: "cover", display: "block", flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: "100%", height: 148, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 36, background: "#171a21", flexShrink: 0,
          }}>
            {isOutfitShot ? "🪞" : (TYPE_ICONS[item.type] ?? "👕")}
          </div>
        )}

        {/* Info area */}
        <div style={{ padding: "8px 10px", flex: 1, minHeight: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3, marginBottom: 3,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.name}
          </div>

          {/* Type + color row */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{item.type}</span>
            {item.color && (
              <>
                <span style={{ fontSize: 11, color: "#4b5563" }}>·</span>
                <span style={{
                  display: "inline-block", width: 10, height: 10,
                  borderRadius: "50%", background: swatch,
                  border: "1px solid #374151", flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: "#6b7280" }}>{item.color}</span>
              </>
            )}
          </div>

          {/* Formality */}
          <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 4 }}>
            formality {item.formality ?? 5}/10
          </div>

          {/* Badges */}
          <div style={{ lineHeight: 1 }}>
            {isOutfitShot  && <Badge label="outfit shot"  color="#92400e" bg="#451a03" />}
            {needsReview && !isOutfitShot && <Badge label="review" color="#92400e" bg="#451a03" />}
            {isDuplicate   && <Badge label="duplicate?"  color="#7c3aed" bg="#2e1065" />}
            {needsReview && item._confidence && (
              <Badge label={item._confidence} color="#6b7280" bg="#111827" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default function WardrobeGrid() {
  const garments = useWardrobeStore(s => s.garments);
  const items    = useMemo(() => garments.filter(Boolean), [garments]);
  const rowCount = Math.max(1, Math.ceil(items.length / COLUMN_COUNT));

  const reviewCount = useMemo(() => items.filter(g => g.needsReview).length, [items]);

  return (
    <div style={{ padding: "16px 18px", borderRadius: 16, background: "#171a21", border: "1px solid #2b3140" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          Wardrobe
          <span style={{ marginLeft: 8, fontSize: 13, color: "#6b7280", fontWeight: 400 }}>
            ({items.length})
          </span>
        </h3>
        {reviewCount > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
            background: "#451a03", color: "#f97316",
          }}>
            {reviewCount} needs review
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ color: "#4b5563", fontSize: 14, padding: "24px 0", textAlign: "center" }}>
          No garments yet — import photos to get outfit recommendations.
        </div>
      ) : (
        <FixedSizeGrid
          columnCount={COLUMN_COUNT}
          columnWidth={CELL_WIDTH}
          rowCount={rowCount}
          rowHeight={CELL_HEIGHT}
          width={GRID_WIDTH}
          height={Math.min(GRID_HEIGHT, rowCount * CELL_HEIGHT)}
          itemData={{ items, columns: COLUMN_COUNT }}
        >
          {Cell}
        </FixedSizeGrid>
      )}
    </div>
  );
}
