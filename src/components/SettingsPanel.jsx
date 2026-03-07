import React, { useState, useCallback } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";

function exportData(garments, watches, history) {
  const data = {
    exportedAt: new Date().toISOString(),
    version: 2,
    watches,
    garments: garments.map(g => ({
      id: g.id, name: g.name, type: g.type, color: g.color,
      formality: g.formality, needsReview: g.needsReview,
      hash: g.hash ?? "",
      thumbnail: g.thumbnail ?? null,
      photoAngles: g.photoAngles ?? [],
      originalFilename: g.originalFilename ?? null,
      duplicateOf: g.duplicateOf ?? null,
      excludeFromWardrobe: g.excludeFromWardrobe ?? false,
    })),
    history,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `watch-advisor-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(garments) {
  const header = "id,name,type,color,formality,needsReview";
  const rows = garments.map(g =>
    [g.id, `"${(g.name || "").replace(/"/g, '""')}"`, g.type, g.color, g.formality, g.needsReview].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wardrobe-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SettingsPanel({ onClose }) {
  const garments = useWardrobeStore(s => s.garments);
  const watches = useWatchStore(s => s.watches);
  const history = useHistoryStore(s => s.entries);
  const { mode, toggle } = useThemeStore();
  const isDark = mode === "dark";

  const [supabaseUrl, setSupabaseUrl] = useState(
    () => typeof localStorage !== "undefined" ? localStorage.getItem("wa-supabase-url") || "" : ""
  );
  const [supabaseKey, setSupabaseKey] = useState(
    () => typeof localStorage !== "undefined" ? localStorage.getItem("wa-supabase-key") || "" : ""
  );
  const [saved, setSaved] = useState(false);

  const handleSaveLogin = useCallback(() => {
    try {
      localStorage.setItem("wa-supabase-url", supabaseUrl);
      localStorage.setItem("wa-supabase-key", supabaseKey);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  }, [supabaseUrl, supabaseKey]);

  const bg = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const cardBg = isDark ? "#0f131a" : "#f3f4f6";
  const textColor = isDark ? "#e2e8f0" : "#1f2937";
  const mutedColor = isDark ? "#6b7280" : "#6b7280";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: bg, borderRadius: 16, padding: "24px 28px",
        border: `1px solid ${border}`, width: 440, maxWidth: "92vw",
        maxHeight: "85vh", overflow: "auto", color: textColor,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Settings</h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: mutedColor, fontSize: 20, cursor: "pointer",
          }}>&times;</button>
        </div>

        {/* Theme */}
        <Section title="Appearance" isDark={isDark}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13 }}>Theme</span>
            <button onClick={toggle} style={{
              padding: "6px 14px", borderRadius: 8, border: `1px solid ${border}`,
              background: cardBg, color: textColor, fontSize: 13, cursor: "pointer",
            }}>
              {isDark ? "\u263E Night" : "\u2600 Day"} &rarr; {isDark ? "\u2600 Day" : "\u263E Night"}
            </button>
          </div>
        </Section>

        {/* Supabase Login */}
        <Section title="Cloud Sync (Supabase)" isDark={isDark}>
          <label style={labelStyle(mutedColor)}>Supabase URL</label>
          <input
            value={supabaseUrl}
            onChange={e => setSupabaseUrl(e.target.value)}
            placeholder="https://your-project.supabase.co"
            style={inputStyle(isDark, border)}
          />
          <label style={labelStyle(mutedColor)}>Anon Key</label>
          <input
            value={supabaseKey}
            onChange={e => setSupabaseKey(e.target.value)}
            placeholder="your-anon-key"
            type="password"
            style={inputStyle(isDark, border)}
          />
          <button onClick={handleSaveLogin} style={{
            marginTop: 8, padding: "8px 16px", borderRadius: 8, border: "none",
            background: saved ? "#22c55e" : "#3b82f6", color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%",
          }}>
            {saved ? "Saved!" : "Save Credentials"}
          </button>
          <div style={{ fontSize: 11, color: mutedColor, marginTop: 6 }}>
            Credentials are saved to localStorage. Reload the page after saving to connect.
          </div>
        </Section>

        {/* Export */}
        <Section title="Export Data" isDark={isDark}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => exportData(garments, watches, history)}
              style={exportBtnStyle(isDark, border)}
            >
              Export JSON
            </button>
            <button
              onClick={() => exportCSV(garments)}
              style={exportBtnStyle(isDark, border)}
            >
              Export CSV
            </button>
          </div>
          <div style={{ fontSize: 11, color: mutedColor, marginTop: 6 }}>
            Exports wardrobe, watches, and history data.
          </div>
        </Section>

        {/* Stats */}
        <Section title="Performance Stats" isDark={isDark}>
          <div style={{ fontSize: 12, color: mutedColor, lineHeight: 1.8 }}>
            Garments: {garments.length}<br />
            Active garments: {garments.filter(g => !g.excludeFromWardrobe).length}<br />
            Needs review: {garments.filter(g => g.needsReview).length}<br />
            Watches: {watches.length}<br />
            History entries: {history.length}<br />
            Cache: IndexedDB<br />
            Grid: react-window virtualized
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, isDark, children }) {
  const border = isDark ? "#2b3140" : "#d1d5db";
  return (
    <div style={{
      marginBottom: 18, padding: "12px 14px", borderRadius: 12,
      background: isDark ? "#0f131a" : "#f9fafb", border: `1px solid ${border}`,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
        color: isDark ? "#6b7280" : "#9ca3af", marginBottom: 10,
      }}>{title}</div>
      {children}
    </div>
  );
}

function labelStyle(c) {
  return { display: "block", fontSize: 12, fontWeight: 600, color: c, marginBottom: 4, marginTop: 8 };
}
function inputStyle(isDark, border) {
  return {
    width: "100%", padding: "8px 10px", borderRadius: 8,
    border: `1px solid ${border}`, background: isDark ? "#171a21" : "#ffffff",
    color: isDark ? "#e2e8f0" : "#1f2937", fontSize: 13, boxSizing: "border-box",
  };
}
function exportBtnStyle(isDark, border) {
  return {
    padding: "8px 16px", borderRadius: 8, border: `1px solid ${border}`,
    background: isDark ? "#171a21" : "#ffffff", color: isDark ? "#e2e8f0" : "#1f2937",
    fontSize: 13, fontWeight: 600, cursor: "pointer", flex: 1,
  };
}
