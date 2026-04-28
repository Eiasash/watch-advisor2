/**
 * StrapLibraryTab — first-class "Straps" tab.
 *
 * Lists every strap (seed + custom). Tap a strap → detail view shows
 * compatible watches + sample-outfit hints. Cross-product styling.
 *
 * Lazy-loaded from AppShell to keep the initial bundle lean.
 */

import React, { useMemo, useState } from "react";
import { useStrapStore } from "../stores/strapStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { buildStrapList, watchesForStrap, sampleOutfitsForStrap, groupStrapsByType } from "../features/strapLibrary/strapLibrary.js";

// Small color swatch (mirrors StrapPanel constants — kept local to avoid coupling)
const SWATCH = {
  silver: "#c0c0c8", grey: "#9ca3af", black: "#1f2937", brown: "#78350f", tan: "#d4a574",
  navy: "#1e3a5f", teal: "#0d9488", olive: "#65730a", white: "#f3f4f6", beige: "#d6cfc0",
  burgundy: "#6b1d1d", green: "#16a34a", red: "#dc2626", gold: "#c8a951",
};

const TYPE_ORDER = ["bracelet", "integrated", "leather", "alligator", "canvas", "nato", "rubber", "other"];

function StrapTile({ strap, isDark, onSelect, selected }) {
  const sw = SWATCH[strap.color] ?? "#888";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#8b93a7" : "#6b7280";
  const card = isDark ? "#171a21" : "#ffffff";
  const border = selected ? "#3b82f6" : (isDark ? "#2b3140" : "#e5e7eb");

  return (
    <button onClick={() => onSelect(strap.id)} style={{
      background: card, border: `2px solid ${border}`, borderRadius: 12,
      padding: 10, cursor: "pointer", textAlign: "left",
      display: "flex", flexDirection: "column", gap: 6, minHeight: 88,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6, background: sw,
          border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
        }} aria-label={`${strap.color} swatch`} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: text,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{strap.label || "Untitled strap"}</div>
          <div style={{ fontSize: 10, color: muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {strap.type || "other"}{strap.custom ? " · custom" : ""}
          </div>
        </div>
      </div>
      {strap.originWatch && (
        <div style={{ fontSize: 10, color: muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {strap.originWatch.brand} {strap.originWatch.model}
        </div>
      )}
    </button>
  );
}

function StrapDetail({ strap, isDark, onClose }) {
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#8b93a7" : "#6b7280";
  const card = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const sw = SWATCH[strap.color] ?? "#888";

  const watches = useMemo(() => watchesForStrap(strap), [strap]);
  const owner = strap.originWatch ?? watches[0] ?? null;
  const samples = useMemo(() => sampleOutfitsForStrap(strap, owner), [strap, owner]);

  return (
    <div style={{
      background: card, border: `1px solid ${border}`, borderRadius: 16,
      padding: 18, marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 12, background: sw,
          border: `2px solid ${isDark ? "#2b3140" : "#d1d5db"}`, flexShrink: 0,
        }} aria-label={`${strap.color} large swatch`} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: text }}>{strap.label || "Untitled strap"}</div>
          <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
            {strap.type || "other"} · {strap.color || "unknown"}{strap.custom ? " · custom" : ""}
          </div>
          {strap.useCase && (
            <div style={{ fontSize: 12, color: text, marginTop: 6, fontStyle: "italic" }}>{strap.useCase}</div>
          )}
        </div>
        <button onClick={onClose} style={{
          background: "transparent", border: "none", color: muted, fontSize: 20,
          cursor: "pointer", padding: 4, lineHeight: 1,
        }} aria-label="Close detail">×</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase",
          letterSpacing: "0.06em", marginBottom: 8,
        }}>Pairs with {watches.length} {watches.length === 1 ? "watch" : "watches"}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {watches.map(w => (
            <div key={w.id} style={{
              padding: "8px 10px", borderRadius: 8, background: isDark ? "#0f131a" : "#f9fafb",
              border: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{w.brand} {w.model}</div>
                <div style={{ fontSize: 11, color: muted }}>
                  {w.dial} dial · {w.lug ?? w.lugWidth ?? "?"}mm lug
                  {w.id === strap.watchId ? " · home" : " · cross-strap candidate"}
                </div>
              </div>
              <div style={{ fontSize: 11, color: muted }}>{w.replica ? "replica" : "genuine"}</div>
            </div>
          ))}
          {watches.length === 0 && (
            <div style={{ fontSize: 12, color: muted, fontStyle: "italic" }}>No compatible watches found.</div>
          )}
        </div>
      </div>

      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase",
          letterSpacing: "0.06em", marginBottom: 8,
        }}>Sample outfits</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {samples.map((s, i) => (
            <div key={i} style={{
              padding: "8px 10px", borderRadius: 8, background: isDark ? "#0f131a" : "#f9fafb",
              border: `1px solid ${border}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: text }}>{s.context}</div>
              <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
                {s.shoes} — {s.note}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function StrapLibraryTab() {
  const straps = useStrapStore(s => s.straps) ?? {};
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const [selectedId, setSelectedId] = useState(null);
  const [filterType, setFilterType] = useState("all");

  const list = useMemo(() => buildStrapList(straps), [straps]);
  const filtered = useMemo(
    () => filterType === "all" ? list : list.filter(s => (s.type || "other") === filterType),
    [list, filterType]
  );
  const groups = useMemo(() => groupStrapsByType(list), [list]);
  const selected = selectedId ? list.find(s => s.id === selectedId) : null;

  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#8b93a7" : "#9ca3af";
  const border = isDark ? "#2b3140" : "#e5e7eb";

  const types = useMemo(() => {
    const present = new Set(Object.keys(groups));
    return TYPE_ORDER.filter(t => present.has(t));
  }, [groups]);

  return (
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: text, marginBottom: 4 }}>Straps</div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>
        {list.length} straps across the collection — tap any to see compatible watches and sample pairings.
      </div>

      {/* Type filter chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        <button onClick={() => setFilterType("all")} style={chip(filterType === "all", isDark)}>
          All ({list.length})
        </button>
        {types.map(t => (
          <button key={t} onClick={() => setFilterType(t)} style={chip(filterType === t, isDark)}>
            {t} ({groups[t]?.length ?? 0})
          </button>
        ))}
      </div>

      {selected && <StrapDetail strap={selected} isDark={isDark} onClose={() => setSelectedId(null)} />}

      <div style={{
        display: "grid", gap: 8,
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
      }}>
        {filtered.map(s => (
          <StrapTile key={s.id} strap={s} isDark={isDark} onSelect={setSelectedId} selected={selectedId === s.id} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ fontSize: 13, color: muted, textAlign: "center", padding: 24, border: `1px dashed ${border}`, borderRadius: 12 }}>
          No straps match this filter.
        </div>
      )}
    </div>
  );
}

function chip(active, isDark) {
  return {
    padding: "6px 12px", borderRadius: 16, fontSize: 12, fontWeight: 600,
    border: `1px solid ${active ? "#3b82f6" : (isDark ? "#2b3140" : "#d1d5db")}`,
    background: active ? "#3b82f6" : "transparent",
    color: active ? "#fff" : (isDark ? "#8b93a7" : "#6b7280"),
    cursor: "pointer", textTransform: "lowercase",
  };
}
