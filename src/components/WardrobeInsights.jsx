import React, { useMemo } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useThemeStore } from "../stores/themeStore.js";

const COLOR_SWATCHES = {
  black:"#1a1a1a", white:"#f5f5f0", gray:"#8a8a8a", grey:"#8a8a8a",
  navy:"#1e2f5e", blue:"#2d5fa0", brown:"#6b3a2a", tan:"#c4a882",
  beige:"#d4c4a8", olive:"#6b7c3a", green:"#2d6b3a", red:"#8b2020",
  burgundy:"#6b1a2a", cream:"#e8e0cc", orange:"#c45c20", purple:"#5a2a7a",
};

const CATS = {
  Tops:       g => ["shirt","sweater"].includes(g.type),
  Bottoms:    g => g.type === "pants",
  Shoes:      g => g.type === "shoes",
  Layers:     g => g.type === "jacket",
  Extras:     g => ["belt","sunglasses","hat","scarf","bag","accessory"].includes(g.type),
  "Needs Review": g => g.needsReview,
};

function StatBox({ label, value, isDark, accent }) {
  return (
    <div style={{
      background: isDark ? "#0f131a" : "#f3f4f6",
      borderRadius:10, padding:"9px 12px",
      border:`1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
      textAlign:"center", minWidth:62, flex:1,
    }}>
      <div style={{ fontSize:21, fontWeight:800, color: accent ?? (isDark ? "#e2e8f0" : "#1f2937") }}>{value}</div>
      <div style={{ fontSize:10, color:"#6b7280", marginTop:2, textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</div>
    </div>
  );
}

export default function WardrobeInsights() {
  const garments = useWardrobeStore(s => s.garments);
  const { mode } = useThemeStore();
  const isDark   = mode === "dark";

  const items = useMemo(() => garments.filter(g => g && !g.excludeFromWardrobe), [garments]);

  const counts = useMemo(() => {
    const c = { Total: items.length };
    for (const [label, fn] of Object.entries(CATS)) c[label] = items.filter(fn).length;
    return c;
  }, [items]);

  const colorDist = useMemo(() => {
    const m = {};
    items.forEach(g => { if (g.color) m[g.color] = (m[g.color] ?? 0) + 1; });
    return Object.entries(m).sort((a,b) => b[1]-a[1]).slice(0, 8);
  }, [items]);

  const needsAngles = useMemo(() =>
    items.filter(g => g.type !== "outfit-photo" && !(g.photoAngles?.length) && (g.thumbnail || g.photoUrl)).length,
  [items]);

  if (items.length === 0) return null;

  const bg = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const sub = isDark ? "#6b7280" : "#9ca3af";

  return (
    <div style={{ padding:"14px 18px", borderRadius:16, background:bg, border:`1px solid ${border}`, marginBottom:14 }}>
      <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:700, color:text }}>Wardrobe Snapshot</h3>

      {/* Stats row */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        <StatBox label="Total"   value={counts.Total}   isDark={isDark} />
        <StatBox label="Tops"    value={counts.Tops}    isDark={isDark} />
        <StatBox label="Bottoms" value={counts.Bottoms} isDark={isDark} />
        <StatBox label="Shoes"   value={counts.Shoes}   isDark={isDark} />
        <StatBox label="Layers"  value={counts.Layers}  isDark={isDark} />
        {counts.Extras > 0 && <StatBox label="Extras" value={counts.Extras} isDark={isDark} accent="#8b5cf6" />}
        {counts["Needs Review"] > 0 && (
          <StatBox label="Review" value={counts["Needs Review"]} isDark={isDark} accent="#f97316" />
        )}
      </div>

      {/* Color palette */}
      {colorDist.length > 0 && (
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:11, fontWeight:700, color:sub, marginBottom:5, textTransform:"uppercase" }}>Palette</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            {colorDist.map(([color, count]) => (
              <div key={color} style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span style={{
                  display:"inline-block", width:13, height:13, borderRadius:"50%",
                  background: COLOR_SWATCHES[color] ?? "#555", border:`1px solid ${isDark?"#374151":"#d1d5db"}`,
                }} />
                <span style={{ fontSize:11, color:isDark?"#8b93a7":"#6b7280" }}>{color} ({count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hints */}
      {needsAngles > 0 && (
        <div style={{ fontSize:11, color:sub, marginTop:4 }}>
          💡 {needsAngles} item{needsAngles > 1 ? "s have" : " has"} only 1 photo — long-press to select & add angles
        </div>
      )}
    </div>
  );
}
