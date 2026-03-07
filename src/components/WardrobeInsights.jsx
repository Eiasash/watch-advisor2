import React, { useMemo } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { computeInsights } from "../wardrobe/wardrobeInsights.js";

const COLOR_SWATCHES = {
  black: "#1a1a1a", white: "#f5f5f0", gray: "#8a8a8a", grey: "#8a8a8a",
  navy: "#1e2f5e", blue: "#2d5fa0", brown: "#6b3a2a", tan: "#c4a882",
  beige: "#d4c4a8", olive: "#6b7c3a", green: "#2d6b3a", red: "#8b2020",
};

function StatBox({ label, value, isDark }) {
  return (
    <div style={{
      background: isDark ? "#0f131a" : "#f3f4f6", borderRadius: 10, padding: "10px 14px",
      border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`, textAlign: "center", minWidth: 70,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

export default function WardrobeInsights() {
  const garments = useWardrobeStore(s => s.garments);
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const insights = useMemo(() => computeInsights(garments), [garments]);

  if (insights.total === 0) return null;

  return (
    <div style={{
      padding: "16px 18px", borderRadius: 16,
      background: isDark ? "#171a21" : "#ffffff",
      border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`, marginBottom: 16,
    }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937" }}>
        Wardrobe Insights
      </h3>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <StatBox label="Total" value={insights.total} isDark={isDark} />
        <StatBox label="Shirts" value={insights.shirts} isDark={isDark} />
        <StatBox label="Pants" value={insights.pants} isDark={isDark} />
        <StatBox label="Shoes" value={insights.shoes} isDark={isDark} />
        <StatBox label="Jackets" value={insights.jackets} isDark={isDark} />
      </div>

      {insights.dominantColors.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>Dominant Colors</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {insights.dominantColors.map(({ color, count }) => (
              <div key={color} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  display: "inline-block", width: 14, height: 14, borderRadius: "50%",
                  background: COLOR_SWATCHES[color] ?? "#444", border: "1px solid #374151",
                }} />
                <span style={{ fontSize: 12, color: "#8b93a7" }}>{color} ({count})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
