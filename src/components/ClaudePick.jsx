import { useState, useEffect, useMemo } from "react";
import { useThemeStore } from "../stores/themeStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";

const SLOT_ICONS = { watch: "⌚", shirt: "👔", sweater: "🧶", layer: "🧥", pants: "👖", shoes: "👞", jacket: "🧥", belt: "🪢" };
const SLOT_ORDER = ["watch", "shirt", "sweater", "layer", "pants", "shoes", "jacket", "belt"];

export default function ClaudePick() {
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const [pick, setPick] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSlot, setExpandedSlot] = useState(null);
  const garments = useWardrobeStore(s => s.garments);

  const bg = isDark ? "#0f131a" : "#f8fafc";
  const card = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  const accent = "#8b5cf6";

  // Match pick garment names to actual wardrobe garments (fuzzy by name)
  const matchedGarments = useMemo(() => {
    if (!pick || !garments.length) return {};
    const matched = {};
    for (const slot of SLOT_ORDER) {
      if (slot === "watch" || !pick[slot] || pick[slot] === "null") continue;
      const pickName = pick[slot].toLowerCase().trim();
      // Exact match first, then substring match
      const exact = garments.find(g => g.name?.toLowerCase().trim() === pickName);
      if (exact) { matched[slot] = exact; continue; }
      const partial = garments.find(g => {
        const gn = g.name?.toLowerCase().trim() ?? "";
        return gn.includes(pickName) || pickName.includes(gn);
      });
      if (partial) matched[slot] = partial;
    }
    return matched;
  }, [pick, garments]);

  const fetchPick = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = "/.netlify/functions/daily-pick";
      const res = force
        ? await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ forceRefresh: true }) })
        : await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPick(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPick(); }, []);

  if (loading && !pick) {
    return (
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${accent}44`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          🤖 Claude's Pick
        </div>
        <div style={{ fontSize: 12, color: muted, marginTop: 8 }}>Thinking about your outfit...</div>
      </div>
    );
  }

  if (error && !pick) {
    return (
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          🤖 Claude's Pick
        </div>
        <div style={{ fontSize: 11, color: "#ef4444", marginTop: 8 }}>{error}</div>
        <button onClick={() => fetchPick(true)} style={{
          marginTop: 8, padding: "4px 12px", borderRadius: 6, border: `1px solid ${accent}`,
          background: "transparent", color: accent, fontSize: 11, cursor: "pointer",
        }}>Retry</button>
      </div>
    );
  }

  if (!pick) return null;

  const slots = SLOT_ORDER.filter(s => {
    if (s === "watch") return pick.watch;
    return pick[s] && pick[s] !== "null";
  });

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${accent}44`, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: collapsed ? 0 : 12 }}>
        <div onClick={() => setCollapsed(!collapsed)} style={{ cursor: "pointer", flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            🤖 Claude's Pick
          </span>
          {pick.score && (
            <span style={{ marginLeft: 8, fontSize: 11, color: pick.score >= 8 ? "#22c55e" : pick.score >= 6 ? "#f59e0b" : muted }}>
              {pick.score}/10
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); fetchPick(true); }} style={{
            padding: "3px 8px", borderRadius: 6, border: `1px solid ${border}`,
            background: "transparent", color: muted, fontSize: 10, cursor: "pointer",
          }}>{loading ? "..." : "🔄"}</button>
          <span onClick={() => setCollapsed(!collapsed)} style={{ cursor: "pointer", color: muted, fontSize: 10 }}>
            {collapsed ? "▼" : "▲"}
          </span>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Watch + Strap */}
          {pick.watch && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
              borderRadius: 8, background: isDark ? "#1a1040" : "#f5f3ff",
              border: `1px solid ${accent}33`, marginBottom: 10,
            }}>
              <span style={{ fontSize: 18 }}>⌚</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: text }}>{pick.watch}</div>
                {pick.strap && <div style={{ fontSize: 10, color: muted }}>{pick.strap}</div>}
              </div>
            </div>
          )}

          {/* Garment slots — tappable to expand details */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {slots.filter(s => s !== "watch").map(slot => {
              const name = pick[slot];
              if (!name || name === "null") return null;
              const garment = matchedGarments[slot];
              const photo = garment?.thumbnail || garment?.photoUrl;
              const isExpanded = expandedSlot === slot;
              return (
                <div key={slot}>
                  <div
                    onClick={() => setExpandedSlot(isExpanded ? null : slot)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 10px", borderRadius: 6,
                      background: isExpanded ? (isDark ? "#1a1040" : "#f5f3ff") : bg,
                      border: isExpanded ? `1px solid ${accent}44` : "1px solid transparent",
                      fontSize: 11, cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {photo ? (
                      <img src={photo} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: 28, textAlign: "center", fontSize: 16 }}>{SLOT_ICONS[slot] ?? "•"}</span>
                    )}
                    <span style={{ color: muted, textTransform: "uppercase", fontSize: 9, width: 52 }}>{slot}</span>
                    <span style={{ color: text, fontWeight: 600, flex: 1 }}>{name}</span>
                    {garment && <span style={{ fontSize: 9, color: muted }}>{isExpanded ? "▲" : "▼"}</span>}
                  </div>
                  {isExpanded && garment && (
                    <div style={{
                      padding: "8px 10px 8px 46px", fontSize: 10, color: muted,
                      display: "flex", flexDirection: "column", gap: 3,
                    }}>
                      {garment.brand && <div><span style={{ fontWeight: 600 }}>Brand:</span> {garment.brand}</div>}
                      {garment.color && <div><span style={{ fontWeight: 600 }}>Color:</span> {garment.color}</div>}
                      {garment.material && <div><span style={{ fontWeight: 600 }}>Material:</span> {garment.material}</div>}
                      {garment.weight && <div><span style={{ fontWeight: 600 }}>Weight:</span> {garment.weight}</div>}
                      {garment.formality != null && <div><span style={{ fontWeight: 600 }}>Formality:</span> {garment.formality}/10</div>}
                      {photo && (
                        <img src={photo} alt={garment.name} style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, marginTop: 4 }} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Reasoning */}
          {pick.reasoning && (
            <div style={{
              marginTop: 10, padding: "8px 10px", borderRadius: 8,
              background: isDark ? "#1a1040" : "#f5f3ff",
              border: `1px solid ${accent}22`,
              fontSize: 11, color: isDark ? "#c4b5fd" : "#7c3aed", lineHeight: 1.5,
            }}>
              {pick.reasoning}
            </div>
          )}

          {/* Layer tip */}
          {pick.layerTip && (
            <div style={{
              marginTop: 6, padding: "5px 10px", borderRadius: 6,
              background: "#f9731620", border: "1px solid #f9731633",
              fontSize: 10, color: "#f97316", fontWeight: 600,
            }}>
              💡 {pick.layerTip}
            </div>
          )}

          {/* Weather context */}
          {pick.weather && (
            <div style={{ marginTop: 6, fontSize: 10, color: muted }}>
              {pick.weather.tempMorning != null && <span>🌅 {pick.weather.tempMorning}°</span>}
              {pick.weather.tempMidday != null && <span> · ☀️ {pick.weather.tempMidday}°</span>}
              {pick.weather.tempEvening != null && <span> · 🌙 {pick.weather.tempEvening}°</span>}
              {pick.generatedAt && <span> · Generated {new Date(pick.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
