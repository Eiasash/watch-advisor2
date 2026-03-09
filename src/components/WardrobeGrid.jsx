import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { FixedSizeGrid } from "react-window";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { setCachedState } from "../services/localCache.js";
import { deleteGarment, pushGarment, deleteStoragePhoto } from "../services/supabaseSync.js";
import GarmentEditor from "./GarmentEditor.jsx";

const CELL_HEIGHT = 272;
const GRID_HEIGHT = 580;

const ALL_FILTERS = [
  { label: "All",     key: "all" },
  { label: "Tops",    key: "tops" },
  { label: "Bottoms", key: "bottoms" },
  { label: "Shoes",   key: "shoes" },
  { label: "Layers",  key: "layers" },
  { label: "Extras",  key: "extras" }, // belt, sunglasses, hat, scarf, bag, accessory
  { label: "Review",  key: "review" },
];

const TYPE_FILTER = {
  all:     () => true,
  tops:    g => ["shirt","sweater","polo","tee","flannel","crewneck","cardigan","hoodie","overshirt"].includes(g.type),
  bottoms: g => ["pants","jeans","chinos","shorts","joggers","corduroy"].includes(g.type),
  shoes:   g => ["shoes","boots","sneakers","loafers","sandals"].includes(g.type),
  layers:  g => ["jacket","coat","blazer","bomber","vest"].includes(g.type),
  extras:  g => ["belt","sunglasses","hat","scarf","bag","accessory"].includes(g.type),
  review:  g => g.needsReview,
};

const TYPE_ICONS = {
  shirt:"👔", pants:"👖", shoes:"👟", jacket:"🧥", sweater:"🧶",
  belt:"🔗", sunglasses:"🕶️", hat:"🧢", scarf:"🧣", bag:"👜", accessory:"💍",
};
const COLOR_SWATCHES = {
  black:"#1a1a1a", white:"#f5f5f0", grey:"#8a8a8a", gray:"#8a8a8a",
  navy:"#1e2f5e", blue:"#2d5fa0", brown:"#6b3a2a", tan:"#c4a882",
  beige:"#d4c4a8", olive:"#6b7c3a", green:"#2d6b3a", red:"#8b2020",
  burgundy:"#6b1a2a", cream:"#e8e0cc", orange:"#c45c20", purple:"#5a2a7a",
};

// ── Card Cell ─────────────────────────────────────────────────────────────────
const Cell = React.memo(function Cell({ columnIndex, rowIndex, style, data }) {
  const index = rowIndex * data.columns + columnIndex;
  const item  = data.items[index];
  if (!item) return <div style={style} />;

  const { isDark, selectMode, selectedIds, onSelect, onLongPress, onEdit, selectedGarmentId, history } = data;
  const isSelected   = selectedIds.has(item.id) || selectedGarmentId === item.id;
  const isLinked     = selectedGarmentId === item.id;
  const swatch       = COLOR_SWATCHES[item.color] ?? "#333";
  const isOutfitShot = item.type === "outfit-photo" || item.type === "outfit-shot";
  const hasAngles    = (item.photoAngles?.length ?? 0) > 0;
  const needsReview  = item.needsReview;
  const isDuplicate  = !!item.duplicateOf;
  // Cost-per-wear
  const cpw = useMemo(() => {
    if (!item.price) return null;
    const wears = (history ?? []).filter(e => (e.garmentIds ?? []).includes(item.id)).length;
    if (!wears) return null;
    return Math.round(item.price / wears);
  }, [item.id, item.price, history]);

  const borderColor = isLinked   ? "#f59e0b"
    : isSelected && selectMode   ? "#3b82f6"
    : needsReview                ? "#92400e"
    : isDuplicate                ? "#7c3aed"
    : isDark ? "#2b3140" : "#d1d5db";

  const longPressRef = useRef(null);
  function onTouchStart(e) {
    longPressRef.current = setTimeout(() => {
      onLongPress(item.id);
      if (navigator.vibrate) navigator.vibrate(20);
    }, 420);
  }
  function onTouchEnd() {
    clearTimeout(longPressRef.current);
  }

  return (
    <div style={{ ...style, padding:5 }}>
      <div
        style={{
          height:"100%", borderRadius:12, overflow:"hidden",
          background: isDark ? "#0f131a" : "#f9fafb",
          border:`2px solid ${borderColor}`,
          display:"flex", flexDirection:"column",
          boxShadow: isLinked ? "0 0 0 3px #f59e0b44" : isSelected && selectMode ? "0 0 0 3px #3b82f644" : "none",
          transition:"border-color 0.15s, box-shadow 0.15s",
          position:"relative", cursor:"pointer",
          userSelect:"none", WebkitUserSelect:"none",
        }}
        onClick={() => selectMode ? onSelect(item.id) : onEdit(item)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchEnd}
      >
        {/* Select checkbox */}
        {selectMode && (
          <div style={{
            position:"absolute", top:6, left:6, zIndex:10,
            width:22, height:22, borderRadius:6,
            background: selectedIds.has(item.id) ? "#3b82f6" : "rgba(0,0,0,0.45)",
            border:`2px solid ${selectedIds.has(item.id) ? "#3b82f6" : "#6b7280"}`,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            {selectedIds.has(item.id) && <span style={{ color:"#fff", fontSize:13 }}>✓</span>}
          </div>
        )}

        {/* Angle badge */}
        {hasAngles && !selectMode && (
          <div style={{
            position:"absolute", top:6, right:6, zIndex:10,
            background:"rgba(0,0,0,0.55)", borderRadius:5,
            fontSize:10, fontWeight:700, color:"#fff", padding:"1px 5px",
          }}>+{item.photoAngles.length}</div>
        )}

        {/* Photo */}
        {(item.thumbnail || item.photoUrl) ? (
          <img
            src={item.thumbnail || item.photoUrl}
            alt={item.name}
            loading="lazy"
            decoding="async"
            onClick={e => { if (selectMode) return; e.stopPropagation(); onEdit(item); }}
            style={{ width:"100%", height:145, objectFit:"cover", display:"block", flexShrink:0 }}
          />
        ) : (
          <div style={{
            width:"100%", height:145, display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:38, background:isDark?"#171a21":"#f3f4f6", flexShrink:0,
          }}>
            {isOutfitShot ? "🪞" : (TYPE_ICONS[item.type] ?? "👕")}
          </div>
        )}

        {/* Info */}
        <div style={{ padding:"7px 9px", flex:1, minHeight:0 }}>
          <div style={{
            fontWeight:700, fontSize:12, lineHeight:1.3, marginBottom:2,
            color:isDark?"#e2e8f0":"#111827",
            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
          }}>{item.name}</div>

          <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:2 }}>
            <span style={{ fontSize:10, color:isDark?"#6b7280":"#9ca3af" }}>{item.type}</span>
            {item.color && (
              <>
                <span style={{ fontSize:10, color:"#4b5563" }}>·</span>
                <span style={{
                  display:"inline-block", width:9, height:9, borderRadius:"50%",
                  background:swatch, border:"1px solid #374151", flexShrink:0,
                }} />
                <span style={{ fontSize:10, color:isDark?"#6b7280":"#9ca3af" }}>{item.color}</span>
              </>
            )}
          </div>

          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            {needsReview && (
              <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:4,
                             background:"#451a03", color:"#f97316", textTransform:"uppercase" }}>review</span>
            )}
            {isDuplicate && (
              <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:4,
                             background:"#2e1065", color:"#c4b5fd", textTransform:"uppercase" }}>dupe?</span>
            )}
            {cpw !== null && (
              <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:4,
                             background:"#052e16", color:"#4ade80" }} title="Cost per wear">~{cpw}/w</span>
            )}
            {item.lastWorn && (() => {
              const d = Math.floor((Date.now() - new Date(item.lastWorn).getTime()) / 864e5);
              const col = d <= 3 ? "#4ade80" : d <= 14 ? "#f59e0b" : "#6b7280";
              const label = d === 0 ? "today" : d === 1 ? "1d ago" : `${d}d ago`;
              return (
                <span style={{ fontSize:9, padding:"1px 5px", borderRadius:4, color:col,
                               background: isDark ? "#1a1a1a" : "#f3f4f6" }}
                      title={`Last worn: ${item.lastWorn}`}>
                  {label}
                </span>
              );
            })()}
            {item.brand && (
              <span style={{ fontSize:9, color:isDark?"#4b5563":"#9ca3af", fontStyle:"italic" }}>{item.brand}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

// ── Batch Toolbar ─────────────────────────────────────────────────────────────
function BatchToolbar({ count, isDark, onDelete, onMerge, onSetType, onCancel }) {
  const [showTypes, setShowTypes] = useState(false);
  const TYPES = ["shirt","pants","shoes","jacket","sweater","belt","sunglasses","hat","scarf","bag","accessory"];
  const bg = isDark ? "#1e2330" : "#1f2937";
  return (
    <div style={{
      position:"fixed", bottom:0, left:0, right:0, zIndex:500,
      background:bg, borderTop:"1px solid #374151",
      padding:"12px 20px", display:"flex", gap:8, alignItems:"center",
      flexWrap:"wrap", boxShadow:"0 -4px 20px rgba(0,0,0,0.4)",
    }}>
      <span style={{ color:"#e2e8f0", fontWeight:700, fontSize:13, marginRight:4 }}>
        {count} selected
      </span>
      {count >= 2 && (
        <button onClick={onMerge} style={batchBtn("#7c3aed")}>Merge angles</button>
      )}
      <div style={{ position:"relative" }}>
        <button onClick={() => setShowTypes(v => !v)} style={batchBtn("#3b82f6")}>Set type ▾</button>
        {showTypes && (
          <div style={{
            position:"absolute", bottom:"110%", left:0, background:isDark?"#171a21":"#fff",
            border:"1px solid #374151", borderRadius:10, padding:6, minWidth:140,
            display:"flex", flexDirection:"column", gap:2, zIndex:600,
          }}>
            {TYPES.map(t => (
              <button key={t} onClick={() => { onSetType(t); setShowTypes(false); }} style={{
                background:"none", border:"none", color:isDark?"#e2e8f0":"#1f2937",
                fontSize:12, cursor:"pointer", padding:"4px 8px", textAlign:"left", borderRadius:5,
              }}>{t}</button>
            ))}
          </div>
        )}
      </div>
      <button onClick={onDelete} style={batchBtn("#ef4444")}>Delete</button>
      <button onClick={onCancel} style={{ ...batchBtn("#4b5563"), marginLeft:"auto" }}>Cancel</button>
    </div>
  );
}
const batchBtn = bg => ({
  padding:"7px 14px", borderRadius:8, border:"none", background:bg,
  color:"#fff", fontWeight:600, fontSize:12, cursor:"pointer",
});

// ── Main WardrobeGrid ─────────────────────────────────────────────────────────
export default function WardrobeGrid() {
  const garments           = useWardrobeStore(s => s.garments);
  const selectedGarmentId  = useWardrobeStore(s => s.selectedGarmentId);
  const setSelectedGarmentId = useWardrobeStore(s => s.setSelectedGarmentId);
  const selectMode         = useWardrobeStore(s => s.selectMode);
  const selectedIds        = useWardrobeStore(s => s.selectedIds);
  const toggleSelect       = useWardrobeStore(s => s.toggleSelect);
  const enterSelectMode    = useWardrobeStore(s => s.enterSelectMode);
  const exitSelectMode     = useWardrobeStore(s => s.exitSelectMode);
  const batchDelete        = useWardrobeStore(s => s.batchDelete);
  const batchSetType       = useWardrobeStore(s => s.batchSetType);
  const batchMergeAngles   = useWardrobeStore(s => s.batchMergeAngles);
  const watches            = useWatchStore(s => s.watches);
  const history            = useHistoryStore(s => s.entries);
  const { mode }           = useThemeStore();
  const isDark             = mode === "dark";

  const [activeFilter, setActiveFilter] = useState("all");
  const [query, setQuery]       = useState("");
  const [editing, setEditing]   = useState(null);
  
  const [gridWidth, setGridWidth] = useState(
    typeof window !== "undefined" ? Math.min(window.innerWidth - 40, 840) : 840
  );
  const gridRef     = useRef(null);
  const containerRef = useRef(null);
  const selectedRef  = useRef(null);

  useEffect(() => {
    function onResize() {
      const w = containerRef.current?.offsetWidth ?? window.innerWidth - 40;
      setGridWidth(Math.max(280, w));
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const COLUMN_COUNT = gridWidth < 360 ? 2 : gridWidth < 560 ? 3 : 4;
  const cellWidth    = Math.floor(gridWidth / COLUMN_COUNT);

  const allItems = useMemo(() => garments.filter(g => g && !g.excludeFromWardrobe), [garments]);

  const filtered = useMemo(() => {
    const fn = TYPE_FILTER[activeFilter] ?? TYPE_FILTER.all;
    let arr = allItems.filter(fn);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter(g =>
        (g.name ?? "").toLowerCase().includes(q) ||
        (g.type ?? "").toLowerCase().includes(q) ||
        (g.color ?? "").toLowerCase().includes(q) ||
        (g.brand ?? "").toLowerCase().includes(q)
      );
    }
    return arr;
  }, [allItems, activeFilter, query]);

  const rowCount = Math.max(1, Math.ceil(filtered.length / COLUMN_COUNT));

  const typeCounts = useMemo(() => {
    const c = {};
    for (const f of Object.keys(TYPE_FILTER)) {
      c[f] = f === "all" ? allItems.length : allItems.filter(TYPE_FILTER[f]).length;
    }
    return c;
  }, [allItems]);

  // Scroll to selected garment
  useEffect(() => {
    if (!selectedGarmentId || !gridRef.current) return;
    const target = allItems.find(g => g.id === selectedGarmentId);
    if (!target) return;
    setActiveFilter("all");
    setQuery("");
    setTimeout(() => {
      const idx = allItems.findIndex(g => g.id === selectedGarmentId);
      if (idx >= 0 && gridRef.current) {
        gridRef.current.scrollToItem({ rowIndex: Math.floor(idx / COLUMN_COUNT), columnIndex: 0, align: "center" });
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setSelectedGarmentId(null), 2000);
      }
    }, 60);
  }, [selectedGarmentId]); // eslint-disable-line

  const handleLongPress = useCallback(id => {
    enterSelectMode();
    toggleSelect(id);
  }, [enterSelectMode, toggleSelect]);

  const handleEdit = useCallback(item => { if (!selectMode) setEditing(item); }, [selectMode]);
  

  function handleBatchDelete() {
    const deletedIds = Array.from(selectedIds);
    batchDelete();
    const updated = garments.filter(g => !selectedIds.has(g.id));
    setCachedState({ watches, garments: updated, history }).catch(() => {});
    // Delete from cloud DB and Storage
    deletedIds.forEach(id => {
      deleteGarment(id).catch(() => {});
      deleteStoragePhoto(id).catch(() => {});
    });
  }
  function handleBatchSetType(t) {
    batchSetType(t);
    const updated = garments.map(g => selectedIds.has(g.id) ? { ...g, type: t } : g);
    setCachedState({ watches, garments: updated, history }).catch(() => {});
    // Push updated garments to cloud
    updated.filter(g => selectedIds.has(g.id)).forEach(g => pushGarment(g).catch(() => {}));
  }
  function handleBatchMerge() {
    const ids = Array.from(selectedIds);
    const [primaryId, ...rest] = ids;
    batchMergeAngles();
    // Read primary from store AFTER batchMergeAngles has updated it (Zustand set is sync)
    const primary = useWardrobeStore.getState().garments.find(g => g.id === primaryId);
    if (primary) pushGarment(primary).catch(() => {});
    rest.forEach(id => {
      deleteGarment(id).catch(() => {});
      deleteStoragePhoto(id).catch(() => {});
    });
    const updated = garments
      .filter(g => !rest.includes(g.id))
      .map(g => g.id === primaryId ? { ...g, photoAngles: [...(g.photoAngles??[]), ...rest.flatMap(rid => { const r = garments.find(x=>x.id===rid); return [r?.thumbnail, ...(r?.photoAngles??[])].filter(Boolean); }).slice(0,4)] } : g);
    setCachedState({ watches, garments: updated, history }).catch(() => {});
  }

  const tabStyle = active => ({
    padding:"5px 10px", borderRadius:7, fontSize:11, fontWeight:600, cursor:"pointer",
    border:`1px solid ${active ? "#3b82f6" : (isDark ? "#2b3140" : "#d1d5db")}`,
    background: active ? "#1d4ed822" : "transparent",
    color: active ? "#3b82f6" : (isDark ? "#8b93a7" : "#6b7280"),
    whiteSpace:"nowrap",
    flexShrink:0,
  });

  return (
    <div style={{ padding:"16px 18px", borderRadius:16,
                  background:isDark?"#171a21":"#fff", border:`1px solid ${isDark?"#2b3140":"#d1d5db"}` }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
        <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:isDark?"#e2e8f0":"#111827" }}>Wardrobe</h3>
        <span style={{ fontSize:12, color:isDark?"#4b5563":"#9ca3af" }}>{allItems.length} items</span>
        {typeCounts.review > 0 && (
          <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:6,
                         background:"#451a03", color:"#f97316" }}>{typeCounts.review} review</span>
        )}
      </div>

      {/* Search */}
      <input
        value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Search wardrobe…"
        style={{
          width:"100%", boxSizing:"border-box", padding:"7px 12px",
          borderRadius:9, border:`1px solid ${isDark?"#2b3140":"#d1d5db"}`,
          background:isDark?"#0f131a":"#f9fafb", color:isDark?"#e2e8f0":"#1f2937",
          fontSize:13, marginBottom:10,
        }}
      />

      {/* Filter tabs */}
      <div style={{ display:"flex", gap:5, marginBottom:12, overflowX:"auto", paddingBottom:4 }}>
        {ALL_FILTERS.map(tab => (
          <button key={tab.key} onClick={() => setActiveFilter(tab.key)} style={tabStyle(activeFilter === tab.key)}>
            {tab.label} {typeCounts[tab.key] > 0 ? `(${typeCounts[tab.key]})` : ""}
          </button>
        ))}
      </div>

      {/* Select mode hint */}
      {!selectMode && allItems.length > 0 && (
        <div style={{ fontSize:11, color:isDark?"#4b5563":"#9ca3af", marginBottom:8 }}>
          Long-press to select items for batch actions
        </div>
      )}

      {/* Grid */}
      <div ref={containerRef}>
        {filtered.length === 0 ? (
          <div style={{ color:"#4b5563", fontSize:14, padding:"24px 0", textAlign:"center" }}>
            {allItems.length === 0 ? "No garments yet — import photos to start." : "No items in this filter."}
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
            itemData={{
              items: filtered, columns: COLUMN_COUNT, isDark,
              selectMode, selectedIds, selectedGarmentId,
              onSelect: toggleSelect, onLongPress: handleLongPress,
              onEdit: handleEdit,
              selectedRef, history,
            }}
          >
            {Cell}
          </FixedSizeGrid>
        )}
      </div>

      {editing && <GarmentEditor garment={editing} onClose={() => setEditing(null)} />}
      {selectMode && (
        <BatchToolbar
          count={selectedIds.size}
          isDark={isDark}
          onDelete={handleBatchDelete}
          onMerge={handleBatchMerge}
          onSetType={handleBatchSetType}
          onCancel={exitSelectMode}
        />
      )}
    </div>
  );
}
