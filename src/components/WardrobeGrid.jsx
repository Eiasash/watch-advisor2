import React, { useMemo, useCallback, useState } from "react";
import { FixedSizeGrid } from "react-window";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import GarmentEditor from "./GarmentEditor.jsx";

const COLUMN_COUNT = 4;
const CELL_WIDTH   = 210;
const CELL_HEIGHT  = 300;
const GRID_WIDTH   = COLUMN_COUNT * CELL_WIDTH;
const GRID_HEIGHT  = 620;

const TYPE_ICONS   = { shirt: "\u{1F454}", pants: "\u{1F456}", shoes: "\u{1F45F}", jacket: "\u{1F9E5}", sweater: "\u{1F9F6}" };
const GARMENT_TYPES = ["shirt", "pants", "shoes", "jacket", "sweater"];
const CATEGORY_GROUPS = {
  tops:    ["shirt", "sweater"],
  bottoms: ["pants"],
  shoes:   ["shoes"],
  layers:  ["jacket"],
};
const COLOR_SWATCHES = {
  black: "#1a1a1a", white: "#f5f5f0", grey: "#8a8a8a", gray: "#8a8a8a", navy: "#1e2f5e",
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

function ImagePreview({ src, name, onClose }) {
  if (!src) return null;
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
        cursor: "pointer",
      }}
      onClick={onClose}
    >
      <div style={{ maxWidth: "90vw", maxHeight: "90vh", position: "relative" }}>
        <img src={src} alt={name} style={{ maxWidth: "90vw", maxHeight: "85vh", objectFit: "contain", borderRadius: 12 }} />
        <div style={{
          position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center",
          fontSize: 14, color: "#e2e8f0", background: "rgba(0,0,0,0.6)", padding: "6px 12px",
          borderRadius: 8, margin: "0 auto", width: "fit-content",
        }}>
          {name}
        </div>
      </div>
    </div>
  );
}

const Cell = React.memo(function Cell({ columnIndex, rowIndex, style, data }) {
  const index = rowIndex * data.columns + columnIndex;
  const item  = data.items[index];
  if (!item) return null;

  const isDark = data.isDark;
  const swatch = COLOR_SWATCHES[item.color] ?? "#333";
  const isOutfitShot = item.photoType === "outfit-shot";
  const needsReview  = item.needsReview;
  const isDuplicate  = !!item.duplicateOf;
  const hasOriginalFilename = item.originalFilename &&
    /^(img|dsc|dscn|photo|pic|pxl|screenshot|wp|cam|capture|mvimg|p_|snap)/i.test(item.originalFilename);

  return (
    <div style={{ ...style, padding: 6 }}>
      <div
        style={{
          height: "100%", borderRadius: 12, overflow: "hidden",
          background: isDark ? "#0f131a" : "#f9fafb",
          border: `1px solid ${isDuplicate ? "#7c3aed" : needsReview ? "#854d0e" : isDark ? "#2b3140" : "#d1d5db"}`,
          display: "flex", flexDirection: "column",
          cursor: "pointer",
        }}
        onClick={() => data.onEdit(item)}
      >
        {/* Image area */}
        {item.thumbnail || item.photoUrl ? (
          <div style={{ position: "relative" }}>
            <img
              src={item.thumbnail || item.photoUrl}
              alt={item.name}
              loading="lazy"
              decoding="async"
              style={{ width: "100%", height: 140, objectFit: "cover", display: "block", flexShrink: 0 }}
              onClick={(e) => { e.stopPropagation(); data.onPreview(item); }}
            />
            <div
              style={{
                position: "absolute", top: 4, right: 4,
                width: 22, height: 22, borderRadius: 6,
                background: "rgba(0,0,0,0.5)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, cursor: "pointer",
              }}
              onClick={(e) => { e.stopPropagation(); data.onPreview(item); }}
              title="Preview full image"
            >
              &#128269;
            </div>
          </div>
        ) : (
          <div style={{
            width: "100%", height: 140, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 36,
            background: isDark ? "#171a21" : "#e5e7eb", flexShrink: 0,
          }}>
            {isOutfitShot ? "\u{1FA9E}" : (TYPE_ICONS[item.type] ?? "\u{1F455}")}
          </div>
        )}

        {/* Info area */}
        <div style={{ padding: "8px 10px", flex: 1, minHeight: 0 }}>
          <div style={{
            fontWeight: 600, fontSize: 12, lineHeight: 1.3, marginBottom: 4,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            color: isDark ? "#e2e8f0" : "#1f2937",
          }}>
            {item.name}
          </div>

          {/* Original filename as clickable link */}
          {hasOriginalFilename && (
            <div
              style={{
                fontSize: 10, color: "#3b82f6", cursor: "pointer", marginBottom: 3,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                textDecoration: "underline dotted",
              }}
              onClick={(e) => { e.stopPropagation(); data.onPreview(item); }}
              title={`Click to preview: ${item.originalFilename}`}
            >
              {item.originalFilename}
            </div>
          )}

          {/* Category + color row */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{item.type ?? item.category}</span>
            {item.color && (
              <>
                <span style={{ fontSize: 11, color: "#4b5563" }}>&middot;</span>
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

          {/* Inline type editor for review items */}
          {needsReview && !isOutfitShot && (
            <select
              value={item.type}
              onChange={(e) => { e.stopPropagation(); data.onUpdateType(item.id, e.target.value); }}
              onClick={e => e.stopPropagation()}
              style={{
                width: "100%", fontSize: 11, padding: "2px 4px",
                background: isDark ? "#171a21" : "#fff",
                color: isDark ? "#e2e8f0" : "#1f2937",
                border: "1px solid #854d0e", borderRadius: 4,
                cursor: "pointer", marginBottom: 3,
              }}
            >
              {GARMENT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}

          {/* Badges */}
          <div style={{ lineHeight: 1 }}>
            {isOutfitShot  && <Badge label="outfit shot"  color="#92400e" bg="#451a03" />}
            {needsReview && !isOutfitShot && <Badge label="review" color="#92400e" bg="#451a03" />}
            {isDuplicate   && <Badge label="DUPLICATE?"  color="#7c3aed" bg="#2e1065" />}
          </div>
        </div>
      </div>
    </div>
  );
});

export default function WardrobeGrid() {
  const garments      = useWardrobeStore(s => s.garments);
  const updateGarment = useWardrobeStore(s => s.updateGarment);
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [filter, setFilter] = useState("all");

  const items = useMemo(() => {
    const active = garments.filter(g => g && !g.excludeFromWardrobe);
    if (filter === "all") return active;
    if (filter === "review") return active.filter(g => g.needsReview);
    const types = CATEGORY_GROUPS[filter];
    if (types) return active.filter(g => types.includes(g.type));
    return active.filter(g => g.type === filter);
  }, [garments, filter]);

  const allActive = useMemo(() => garments.filter(g => g && !g.excludeFromWardrobe), [garments]);
  const rowCount = Math.max(1, Math.ceil(items.length / COLUMN_COUNT));
  const reviewCount = useMemo(() => allActive.filter(g => g.needsReview).length, [allActive]);

  const handleUpdateType = useCallback((id, newType) => {
    updateGarment(id, { type: newType, needsReview: false });
  }, [updateGarment]);

  const handleEdit = useCallback((item) => setEditing(item), []);
  const handlePreview = useCallback((item) => setPreview(item), []);

  const counts = useMemo(() => {
    const c = { tops: 0, bottoms: 0, shoes: 0, layers: 0 };
    for (const g of allActive) {
      for (const [group, types] of Object.entries(CATEGORY_GROUPS)) {
        if (types.includes(g.type)) c[group]++;
      }
    }
    return c;
  }, [allActive]);

  const filterBtn = (key, label) => ({
    padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${filter === key ? "#3b82f6" : isDark ? "#2b3140" : "#d1d5db"}`,
    background: filter === key ? (isDark ? "#1e3a5f" : "#dbeafe") : "transparent",
    color: filter === key ? "#3b82f6" : (isDark ? "#8b93a7" : "#6b7280"),
  });

  return (
    <div style={{
      padding: "16px 18px", borderRadius: 16,
      background: isDark ? "#171a21" : "#ffffff",
      border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937" }}>
          Wardrobe
          <span style={{ marginLeft: 8, fontSize: 13, color: "#6b7280", fontWeight: 400 }}>
            ({items.length}{filter !== "all" ? ` of ${allActive.length}` : ""})
          </span>
        </h3>
        {reviewCount > 0 && (
          <span
            style={{
              fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
              background: "#451a03", color: "#f97316", cursor: "pointer",
            }}
            onClick={() => setFilter(filter === "review" ? "all" : "review")}
          >
            {reviewCount} needs review
          </span>
        )}
      </div>

      {/* Category filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={() => setFilter("all")} style={filterBtn("all")}>All</button>
        <button onClick={() => setFilter("tops")} style={filterBtn("tops")}>Tops ({counts.tops})</button>
        <button onClick={() => setFilter("bottoms")} style={filterBtn("bottoms")}>Bottoms ({counts.bottoms})</button>
        <button onClick={() => setFilter("shoes")} style={filterBtn("shoes")}>Shoes ({counts.shoes})</button>
        <button onClick={() => setFilter("layers")} style={filterBtn("layers")}>Layers ({counts.layers})</button>
        {reviewCount > 0 && (
          <button onClick={() => setFilter("review")} style={filterBtn("review")}>Review ({reviewCount})</button>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ color: "#4b5563", fontSize: 14, padding: "24px 0", textAlign: "center" }}>
          {filter !== "all" ? "No garments in this category." : "No garments yet \u2014 import photos to get outfit recommendations."}
        </div>
      ) : (
        <FixedSizeGrid
          columnCount={COLUMN_COUNT}
          columnWidth={CELL_WIDTH}
          rowCount={rowCount}
          rowHeight={CELL_HEIGHT}
          width={GRID_WIDTH}
          height={Math.min(GRID_HEIGHT, rowCount * CELL_HEIGHT)}
          itemData={{
            items, columns: COLUMN_COUNT,
            onUpdateType: handleUpdateType, onEdit: handleEdit,
            onPreview: handlePreview, isDark,
          }}
        >
          {Cell}
        </FixedSizeGrid>
      )}

      {editing && <GarmentEditor garment={editing} onClose={() => setEditing(null)} />}
      {preview && (
        <ImagePreview
          src={preview.photoUrl || preview.thumbnail}
          name={preview.name}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
