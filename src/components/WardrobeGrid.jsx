import React, { useMemo, useRef, useEffect, useState } from "react";
import { FixedSizeGrid } from "react-window";
import { useWardrobeStore } from "../stores/wardrobeStore.js";

const COLUMN_COUNT = 3;
const CELL_WIDTH   = 180;
const CELL_HEIGHT  = 250;
const GRID_WIDTH   = COLUMN_COUNT * CELL_WIDTH;
const GRID_HEIGHT  = 520;

const Cell = React.memo(function Cell({ columnIndex, rowIndex, style, data }) {
  const index = rowIndex * data.columns + columnIndex;
  const item  = data.items[index];
  if (!item) return null;

  const TYPE_ICONS = { shirt: "👔", pants: "👖", shoes: "👟", jacket: "🧥" };

  return (
    <div style={{ ...style, padding: 6 }}>
      <div style={{
        height: "100%", borderRadius: 12, overflow: "hidden",
        background: "#0f131a", border: "1px solid #2b3140",
        display: "flex", flexDirection: "column",
      }}>
        {item.thumbnail || item.photoUrl ? (
          <img
            src={item.thumbnail || item.photoUrl}
            alt={item.name}
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: 140, objectFit: "cover", display: "block", flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: "100%", height: 140, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 36, background: "#171a21", flexShrink: 0,
          }}>
            {TYPE_ICONS[item.type] ?? "👕"}
          </div>
        )}
        <div style={{ padding: "8px 10px", flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, marginBottom: 2 }}>{item.name}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            {[item.type, item.color].filter(Boolean).join(" · ")}
          </div>
          {item.formality != null && (
            <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>
              formality {item.formality}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default function WardrobeGrid() {
  const garments = useWardrobeStore(s => s.garments);
  const items = useMemo(() => garments.filter(Boolean), [garments]);
  const rowCount = Math.max(1, Math.ceil(items.length / COLUMN_COUNT));

  return (
    <div style={{
      padding: "16px 18px", borderRadius: 16,
      background: "#171a21", border: "1px solid #2b3140",
    }}>
      <h3 style={{ marginTop: 0, marginBottom: 14, fontSize: 15, fontWeight: 700 }}>
        Wardrobe
        <span style={{ marginLeft: 8, fontSize: 13, color: "#6b7280", fontWeight: 400 }}>
          ({items.length} item{items.length !== 1 ? "s" : ""})
        </span>
      </h3>
      {items.length === 0 ? (
        <div style={{ color: "#4b5563", fontSize: 14, padding: "24px 0", textAlign: "center" }}>
          No garments yet — import photos from the panel to get outfit recommendations.
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
