import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { FixedSizeGrid } from "react-window";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useThemeStore } from "../stores/themeStore.js";

const CELL_HEIGHT   = 280;
const GRID_HEIGHT   = 560;

const FILTER_TABS = [
  { label: "All",     key: "all"     },
  { label: "Tops",    key: "tops"    },
  { label: "Bottoms", key: "bottoms" },
  { label: "Shoes",   key: "shoes"   },
  { label: "Layers",  key: "layers"  },
];

const TYPE_FILTER = {
  all:     () => true,
  tops:    g => g.type === "shirt" || g.type === "sweater",
  bottoms: g => g.type === "pants",
  shoes:   g => g.type === "shoes",
  layers:  g => g.type === "jacket",
};

const TYPE_ICONS   = { shirt: "👔", pants: "👖", shoes: "👟", jacket: "🧥", sweater: "🧶" };
const COLOR_SWATCHES = {
  black: "#1a1a1a", white: "#f5f5f0", grey: "#8a8a8a", gray: "#8a8a8a",
  navy: "#1e2f5e", blue: "#2d5fa0", brown: "#6b3a2a", tan: "#c4a882",
  beige: "#d4c4a8", olive: "#6b7c3a", green: "#2d6b3a", red: "#8b2020",
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
  if (!item) return <div style={style} />;

  const isDark       = data.isDark;
  const isSelected   = data.selectedId === item.id;
  const swatch       = COLOR_SWATCHES[item.color] ?? "#333";
  const isOutfitShot = item.photoType === "outfit-shot" || item.type === "outfit-photo";
  const needsReview  = item.needsReview;
  const isDuplicate  = !!item.duplicateOf;

  const borderColor = isSelected
    ? "#f59e0b"
    : needsReview ? "#854d0e"
    : isDuplicate ? "#7c3aed"
    : isDark ? "#2b3140" : "#d1d5db";

  return (
    <div
      style={{ ...style, padding: 6 }}
      ref={isSelected ? data.selectedRef : null}
    >
      <div style={{
        height: "100%", borderRadius: 12, overflow: "hidden",
        background: isDark ? "#0f131a" : "#f9fafb",
        border: `2px solid ${borderColor}`,
        display: "flex", flexDirection: "column",
        boxShadow: isSelected ? "0 0 0 2px #f59e0b55" : "none",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}>
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
            justifyContent: "center", fontSize: 36, background: isDark ? "#171a21" : "#f3f4f6", flexShrink: 0,
          }}>
            {isOutfitShot ? "🪞" : (TYPE_ICONS[item.type] ?? "👕")}
          </div>
        )}

        <div style={{ padding: "8px 10px", flex: 1, minHeight: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: 13, lineHeight: 1.3, marginBottom: 3,
            color: isDark ? "#e2e8f0" : "#111827",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {item.name}
          </div>

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

          <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 4 }}>
            formality {item.formality ?? 5}/10
          </div>

          <div style={{ lineHeight: 1 }}>
            {isOutfitShot  && <Badge label="outfit shot"  color="#92400e" bg="#451a03" />}
            {needsReview && !isOutfitShot && <Badge label="review" color="#92400e" bg="#451a03" />}
            {isDuplicate   && <Badge label="duplicate?"   color="#7c3aed" bg="#2e1065" />}
          </div>
        </div>
      </div>
    </div>
  );
});

export default function WardrobeGrid() {
  const garments           = useWardrobeStore(s => s.garments);
  const selectedGarmentId  = useWardrobeStore(s => s.selectedGarmentId);
  const setSelectedGarmentId = useWardrobeStore(s => s.setSelectedGarmentId);
  const { mode }           = useThemeStore();
  const isDark             = mode === "dark";

  const [activeFilter, setActiveFilter] = useState("all");
  const [gridWidth, setGridWidth]       = useState(typeof window !== "undefined" ? Math.min(window.innerWidth - 40, 576) : 576);
  const gridRef    = useRef(null);
  const selectedRef = useRef(null);
  const containerRef = useRef(null);

  // Responsive width
  useEffect(() => {
    function onResize() {
      const w = containerRef.current?.offsetWidth ?? window.innerWidth - 40;
      setGridWidth(Math.max(280, w));
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Responsive columns: 2 on small phones, 3 default
  const COLUMN_COUNT = gridWidth < 360 ? 2 : 3;
  const cellWidth = Math.floor(gridWidth / COLUMN_COUNT);

  const allItems = useMemo(() => garments.filter(Boolean), [garments]);
  const filtered = useMemo(() => {
    const fn = TYPE_FILTER[activeFilter] ?? TYPE_FILTER.all;
    return allItems.filter(fn);
  }, [allItems, activeFilter]);

  const rowCount = Math.max(1, Math.ceil(filtered.length / COLUMN_COUNT));

  const reviewCount = useMemo(() => allItems.filter(g => g.needsReview).length, [allItems]);

  // Scroll to selected garment when selectedGarmentId changes
  useEffect(() => {
    if (!selectedGarmentId || !gridRef.current) return;
    // Switch to the right tab first
    const target = allItems.find(g => g.id === selectedGarmentId);
    if (target) {
      const type = target.type;
      const tab = type === "pants" ? "bottoms"
        : type === "shoes" ? "shoes"
        : type === "jacket" ? "layers"
        : (type === "shirt" || type === "sweater") ? "tops"
        : "all";
      setActiveFilter(prev => {
        if (prev !== "all" && prev !== tab) return "all"; // show all so item is visible
        return prev;
      });
    }
    setTimeout(() => {
      const idx = filtered.findIndex(g => g.id === selectedGarmentId);
      if (idx >= 0 && gridRef.current) {
        const row = Math.floor(idx / COLUMN_COUNT);
        gridRef.current.scrollToItem({ rowIndex: row, columnIndex: 0, align: "center" });
      }
    }, 100);
  }, [selectedGarmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeCounts = useMemo(() => ({
    tops:    allItems.filter(TYPE_FILTER.tops).length,
    bottoms: allItems.filter(TYPE_FILTER.bottoms).length,
    shoes:   allItems.filter(TYPE_FILTER.shoes).length,
    layers:  allItems.filter(TYPE_FILTER.layers).length,
  }), [allItems]);

  const tabLabel = (tab) => {
    if (tab.key === "all") return `All (${allItems.length})`;
    const count = typeCounts[tab.key] ?? 0;
    return `${tab.label} (${count})`;
  };

  return (
    <div style={{ padding: "16px 18px", borderRadius: 16, background: isDark ? "#171a21" : "#fff", border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}` }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: isDark ? "#e2e8f0" : "#111827" }}>
          Wardrobe
        </h3>
        {reviewCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "#451a03", color: "#f97316" }}>
            {reviewCount} review
          </span>
        )}
        {selectedGarmentId && (
          <button
            onClick={() => setSelectedGarmentId(null)}
            style={{ marginLeft: "auto", fontSize: 11, background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: "2px 6px" }}
          >
            ✕ clear
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: `1px solid ${activeFilter === tab.key ? "#3b82f6" : (isDark ? "#2b3140" : "#d1d5db")}`,
              background: activeFilter === tab.key ? "#1d4ed822" : "transparent",
              color: activeFilter === tab.key ? "#3b82f6" : (isDark ? "#8b93a7" : "#6b7280"),
              cursor: "pointer",
            }}
          >
            {tabLabel(tab)}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div ref={containerRef}>
        {filtered.length === 0 ? (
          <div style={{ color: "#4b5563", fontSize: 14, padding: "24px 0", textAlign: "center" }}>
            {allItems.length === 0
              ? "No garments yet — import photos to get outfit recommendations."
              : `No ${activeFilter} items.`}
          </div>
        ) : (
          <FixedSizeGrid
            ref={gridRef}
            columnCount={COLUMN_COUNT}
            columnWidth={cellWidth}
            rowCount={rowCount}
            rowHeight={CELL_HEIGHT}
            width={gridWidth}
            height={Math.min(GRID_HEIGHT, rowCount * CELL_HEIGHT)}
            itemData={{ items: filtered, columns: COLUMN_COUNT, isDark, selectedId: selectedGarmentId, selectedRef }}
          >
            {Cell}
          </FixedSizeGrid>
        )}
      </div>
    </div>
  );
}
