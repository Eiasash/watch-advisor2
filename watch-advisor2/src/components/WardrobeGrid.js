import React, { useMemo } from "react";
import { FixedSizeGrid } from "react-window";
import { useWardrobeStore } from "../stores/wardrobeStore.js";

const Cell = React.memo(function Cell({ columnIndex, rowIndex, style, data }) {
  const index = rowIndex * data.columns + columnIndex;
  const item = data.items[index];
  if (!item) return null;

  return React.createElement("div", { style: { ...style, padding: 8 } },
    React.createElement("div", {
      style: {
        height: "100%", borderRadius: 14, overflow: "hidden",
        background: "#171a21", border: "1px solid #2b3140"
      }
    },
      React.createElement("img", {
        src: item.thumbnail || item.photoUrl,
        alt: item.name,
        loading: "lazy",
        decoding: "async",
        style: { width: "100%", height: 160, objectFit: "cover", display: "block" }
      }),
      React.createElement("div", { style: { padding: 10 } },
        React.createElement("div", { style: { fontWeight: 600, fontSize: 14 } }, item.name),
        React.createElement("div", { style: { opacity: 0.7, fontSize: 12 } }, [item.type, item.color].filter(Boolean).join(" · "))
      )
    )
  );
});

export default function WardrobeGrid() {
  const garments = useWardrobeStore(s => s.garments);
  const items = useMemo(() => garments.filter(Boolean), [garments]);

  return React.createElement("div", {
    style: {
      padding: 16, borderRadius: 16,
      background: "#171a21", border: "1px solid #2b3140"
    }
  },
    React.createElement("h3", { style: { marginTop: 0 } }, "Wardrobe"),
    React.createElement(FixedSizeGrid, {
      columnCount: 4,
      columnWidth: 190,
      rowCount: Math.max(1, Math.ceil(items.length / 4)),
      rowHeight: 260,
      width: 800,
      height: 760,
      itemData: { items, columns: 4 }
    }, Cell)
  );
}
