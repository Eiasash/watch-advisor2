import React from "react";
import { useThemeStore } from "../stores/themeStore.js";

/**
 * Shimmer loading skeleton shown during bootstrap.
 * Mimics the layout of WatchDashboard + WardrobeGrid.
 */

const shimmerKeyframes = `
@keyframes wa-shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
`;

function ShimmerBlock({ width, height, borderRadius = 8, style = {} }) {
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const base = isDark ? "#1e2433" : "#e5e7eb";
  const shine = isDark ? "#2b3140" : "#f3f4f6";

  return (
    <div style={{
      width, height, borderRadius,
      background: `linear-gradient(90deg, ${base} 25%, ${shine} 50%, ${base} 75%)`,
      backgroundSize: "800px 100%",
      animation: "wa-shimmer 1.5s infinite linear",
      ...style,
    }} />
  );
}

export default function LoadingSkeleton() {
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const cardBg = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#d1d5db";

  return (
    <>
      <style>{shimmerKeyframes}</style>

      {/* Watch dashboard skeleton */}
      <div style={{
        padding: "18px 20px", borderRadius: 18, marginBottom: 20,
        background: cardBg, border: `1px solid ${border}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
          <ShimmerBlock width={160} height={24} />
          <ShimmerBlock width={120} height={28} borderRadius={6} />
        </div>
        <ShimmerBlock width="100%" height={80} borderRadius={14} style={{ marginBottom: 18 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[0, 1, 2, 3].map(i => (
            <ShimmerBlock key={i} width="100%" height={90} borderRadius={12} />
          ))}
        </div>
      </div>

      {/* Wardrobe grid skeleton */}
      <div style={{
        display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start",
      }}>
        <div style={{
          padding: "16px 18px", borderRadius: 16, background: cardBg,
          border: `1px solid ${border}`,
        }}>
          <ShimmerBlock width={140} height={18} style={{ marginBottom: 12 }} />
          <ShimmerBlock width="100%" height={120} borderRadius={12} />
        </div>
        <div style={{
          padding: "16px 18px", borderRadius: 16, background: cardBg,
          border: `1px solid ${border}`,
        }}>
          <ShimmerBlock width={100} height={18} style={{ marginBottom: 12 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
              <ShimmerBlock key={i} width="100%" height={180} borderRadius={12} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
