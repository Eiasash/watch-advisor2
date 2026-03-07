import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useWatchStore } from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { fuzzySearchGarments } from "../services/supabaseSync.js";

/**
 * Command palette / search overlay.
 * Open with Ctrl+K / Cmd+K or the search button in the header.
 * Groups results by category: watches, garments, actions.
 */

const ACTIONS = [
  { id: "act-settings", label: "Open Settings", icon: "\u2699", action: "settings" },
  { id: "act-export-json", label: "Export Data (JSON)", icon: "\u21E9", action: "export-json" },
  { id: "act-export-csv", label: "Export Data (CSV)", icon: "\u21E9", action: "export-csv" },
  { id: "act-theme", label: "Toggle Day/Night Mode", icon: "\u263E", action: "toggle-theme" },
  { id: "act-top", label: "Scroll to Top", icon: "\u2191", action: "scroll-top" },
];

export default function CommandPalette({ onClose, onAction }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dbGarments, setDbGarments] = useState([]);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const watches = useWatchStore(s => s.watches);
  const setActiveWatch = useWatchStore(s => s.setActiveWatch);
  const garments = useWardrobeStore(s => s.garments);
  const { mode, toggle } = useThemeStore();
  const isDark = mode === "dark";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced DB fuzzy search — fires when query >= 3 chars, 250ms delay
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 3) { setDbGarments([]); return; }
    debounceRef.current = setTimeout(async () => {
      const results = await fuzzySearchGarments(query.trim(), 12);
      setDbGarments(results);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    const out = [];

    // Watches
    const matchedWatches = watches.filter(w =>
      !q || [w.brand, w.model, w.ref, w.dial, w.style].some(f => f?.toLowerCase().includes(q))
    ).slice(0, 6);
    if (matchedWatches.length > 0) {
      out.push({ type: "header", label: "Watches" });
      matchedWatches.forEach(w => out.push({
        type: "watch", id: w.id, label: `${w.brand} ${w.model}`,
        detail: `${w.ref} \u00B7 ${w.dial} dial \u00B7 ${w.style}`,
        icon: "\u231A", data: w,
      }));
    }

    // Garments — merge local (instant) with DB fuzzy results, deduplicate by id
    const activeGarments = garments.filter(g => g && !g.excludeFromWardrobe);
    const localMatched = activeGarments.filter(g =>
      !q || [g.name, g.type, g.color, g.originalFilename].some(f => f?.toLowerCase().includes(q))
    );
    const localIds = new Set(localMatched.map(g => g.id));
    const dbOnly = dbGarments.filter(g => !localIds.has(g.id));
    const merged = [...localMatched, ...dbOnly].slice(0, 8);

    if (merged.length > 0) {
      out.push({ type: "header", label: "Garments" });
      merged.forEach(g => out.push({
        type: "garment", id: g.id, label: g.name,
        detail: `${g.type} \u00B7 ${g.color} \u00B7 formality ${g.formality}/10`,
        icon: g.type === "shoes" ? "\u{1F45F}" : g.type === "pants" ? "\u{1F456}" : g.type === "jacket" ? "\u{1F9E5}" : "\u{1F454}",
        data: g,
      }));
    }

    // Actions
    const matchedActions = ACTIONS.filter(a =>
      !q || a.label.toLowerCase().includes(q)
    );
    if (matchedActions.length > 0) {
      out.push({ type: "header", label: "Actions" });
      matchedActions.forEach(a => out.push({ type: "action", ...a }));
    }

    return out;
  }, [query, watches, garments, dbGarments]);

  const selectableResults = results.filter(r => r.type !== "header");

  const handleSelect = useCallback((item) => {
    if (!item) return;
    if (item.type === "watch") {
      setActiveWatch(item.data);
      onClose();
    } else if (item.type === "garment") {
      onClose();
    } else if (item.type === "action") {
      if (item.action === "toggle-theme") toggle();
      else if (item.action === "scroll-top") window.scrollTo({ top: 0, behavior: "smooth" });
      else if (onAction) onAction(item.action);
      onClose();
    }
  }, [setActiveWatch, toggle, onClose, onAction]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, selectableResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSelect(selectableResults[selectedIndex]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, selectableResults, selectedIndex, handleSelect]);

  // Reset selection when query changes
  useEffect(() => setSelectedIndex(0), [query]);

  const bg = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = "#6b7280";
  const hoverBg = isDark ? "#1e2433" : "#f3f4f6";

  let selectableIdx = -1;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: "15vh", zIndex: 1200,
    }} onClick={onClose}>
      <div style={{
        background: bg, borderRadius: 14, width: 520, maxWidth: "92vw",
        border: `1px solid ${border}`, overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }} onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div style={{
          padding: "12px 16px", borderBottom: `1px solid ${border}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 16, color: muted }}>&#128269;</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search watches, garments, or actions..."
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: text, fontSize: 15,
            }}
          />
          <kbd style={{
            fontSize: 10, padding: "2px 6px", borderRadius: 4,
            background: isDark ? "#0f131a" : "#e5e7eb", color: muted,
            border: `1px solid ${border}`,
          }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflow: "auto", padding: "4px 0" }}>
          {results.length === 0 && (
            <div style={{ padding: "24px 16px", textAlign: "center", color: muted, fontSize: 13 }}>
              No results found.
            </div>
          )}
          {results.map((item, i) => {
            if (item.type === "header") {
              return (
                <div key={`h-${item.label}`} style={{
                  padding: "8px 16px 4px", fontSize: 11, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.06em", color: muted,
                }}>
                  {item.label}
                </div>
              );
            }
            selectableIdx++;
            const isSelected = selectableIdx === selectedIndex;
            const currentIdx = selectableIdx;
            return (
              <div
                key={item.id}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(currentIdx)}
                style={{
                  padding: "8px 16px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10,
                  background: isSelected ? hoverBg : "transparent",
                  borderLeft: isSelected ? "3px solid #3b82f6" : "3px solid transparent",
                }}
              >
                <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{item.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: text,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {item.label}
                  </div>
                  {item.detail && (
                    <div style={{ fontSize: 11, color: muted, marginTop: 1 }}>{item.detail}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: "8px 16px", borderTop: `1px solid ${border}`,
          display: "flex", gap: 12, fontSize: 11, color: muted,
        }}>
          <span><kbd style={kbdStyle(isDark, border)}>&uarr;&darr;</kbd> navigate</span>
          <span><kbd style={kbdStyle(isDark, border)}>Enter</kbd> select</span>
          <span><kbd style={kbdStyle(isDark, border)}>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function kbdStyle(isDark, border) {
  return {
    fontSize: 10, padding: "1px 4px", borderRadius: 3,
    background: isDark ? "#0f131a" : "#e5e7eb",
    border: `1px solid ${border}`, marginRight: 2,
  };
}
