import React from "react";
import { useThemeStore } from "../stores/themeStore.js";

const DIAL_SWATCH = {
  "silver-white": "#e8e8e0", "green": "#3d6b45", "grey": "#8a8a8a",
  "blue": "#2d5fa0", "navy": "#1e2f5e", "white": "#f0ede8",
  "black-red": "#1a1a1a", "black": "#1a1a1a", "white-teal": "#4da89c",
};

const FIELDS = [
  { key: "brand", label: "Brand" },
  { key: "model", label: "Model" },
  { key: "ref", label: "Reference" },
  { key: "dial", label: "Dial" },
  { key: "strap", label: "Strap" },
  { key: "style", label: "Style" },
  { key: "formality", label: "Formality", fmt: v => `${v}/10` },
  { key: "size", label: "Case Size", fmt: v => v ? `${v}mm` : "\u2014" },
  { key: "lug", label: "Lug-to-Lug", fmt: v => v ? `${v}mm` : "\u2014" },
];

export default function WatchCompare({ watches, onClose }) {
  const { mode } = useThemeStore();
  const isDark = mode === "dark";

  if (!watches || watches.length < 2) return null;
  const [a, b] = watches;

  const bg = isDark ? "#171a21" : "#ffffff";
  const cardBg = isDark ? "#0f131a" : "#f3f4f6";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = "#6b7280";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: bg, borderRadius: 16, padding: "24px 28px",
        border: `1px solid ${border}`, width: 520, maxWidth: "94vw",
        maxHeight: "85vh", overflow: "auto", color: text,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Compare Watches</h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: muted, fontSize: 20, cursor: "pointer",
          }}>&times;</button>
        </div>

        {/* Dial swatches */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[a, b].map(w => (
            <div key={w.id} style={{
              background: cardBg, borderRadius: 12, padding: 14,
              border: `1px solid ${border}`, textAlign: "center",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%", margin: "0 auto 8px",
                background: DIAL_SWATCH[w.dial] ?? "#444",
                border: `3px solid ${border}`,
                boxShadow: `0 0 10px ${(DIAL_SWATCH[w.dial] ?? "#444")}44`,
              }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>{w.model}</div>
              <div style={{ fontSize: 12, color: muted }}>{w.brand}</div>
            </div>
          ))}
        </div>

        {/* Comparison table */}
        <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${border}` }}>
          {FIELDS.map(({ key, label, fmt }, i) => {
            const va = fmt ? fmt(a[key]) : a[key];
            const vb = fmt ? fmt(b[key]) : b[key];
            const match = va === vb;
            return (
              <div key={key} style={{
                display: "grid", gridTemplateColumns: "1fr 100px 1fr",
                fontSize: 13, borderBottom: i < FIELDS.length - 1 ? `1px solid ${border}` : "none",
                background: i % 2 === 0 ? cardBg : "transparent",
              }}>
                <div style={{ padding: "8px 12px", textAlign: "right", color: match ? muted : text }}>
                  {va ?? "\u2014"}
                </div>
                <div style={{ padding: "8px 6px", textAlign: "center", color: muted, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>
                  {label}
                </div>
                <div style={{ padding: "8px 12px", color: match ? muted : text }}>
                  {vb ?? "\u2014"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
