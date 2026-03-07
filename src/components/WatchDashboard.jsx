import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useWatchStore } from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { generateOutfit, explainOutfit } from "../engine/outfitEngine.js";
import { buildOutfit, explainOutfitChoice } from "../outfitEngine/outfitBuilder.js";
import { fetchWeather, formatWeatherText, getLayerRecommendation } from "../weather/weatherService.js";
import { getAISuggestion } from "../aiStylist/claudeStylist.js";
import WatchSelector from "../features/watch/WatchSelector.jsx";
import WatchCompare from "./WatchCompare.jsx";
import StrapPanel from "./StrapPanel.jsx";
import { useStrapStore } from "../stores/strapStore.js";
import WatchIDPanel   from "./WatchIDPanel.jsx";
import { useRejectStore } from "../stores/rejectStore.js";

const DIAL_SWATCH = {
  "silver-white": "#e8e8e0",
  "green":        "#3d6b45",
  "grey":         "#8a8a8a",
  "blue":         "#2d5fa0",
  "navy":         "#1e2f5e",
  "white":        "#f0ede8",
  "black-red":    "#1a1a1a",
  "black":        "#1a1a1a",
  "white-teal":   "#4da89c",
  // Replica dials — previously all showed #444
  "teal":         "#2a8a82",
  "burgundy":     "#6b1a2a",
  "purple":       "#5a2a7a",
  "turquoise":    "#1a9b8a",
  "red":          "#9b1a1a",
  "meteorite":    "#c0c0c0",
};

function WatchCard({ watch, label, accent = "#3b82f6", isDark }) {
  if (!watch) return null;
  const swatch = DIAL_SWATCH[watch.dial] ?? "#444";

  return (
    <div style={{
      background: isDark ? "#0f131a" : "#f3f4f6",
      borderRadius: 14,
      padding: "14px 16px",
      border: `1px solid ${accent}33`,
      display: "flex", gap: 14, alignItems: "flex-start",
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        background: swatch,
        border: `3px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
        flexShrink: 0,
        boxShadow: `0 0 12px ${swatch}44`,
      }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: accent, marginBottom: 3, textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2, color: isDark ? "#e2e8f0" : "#1f2937" }}>{watch.model}</div>
        <div style={{ fontSize: 13, color: "#8b93a7", marginTop: 2 }}>{watch.brand} &middot; {watch.ref}</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
          {watch.dial} dial &middot; {watch.style} &middot; formality {watch.formality}/10
        </div>
      </div>
    </div>
  );
}

function OutfitSlot({ slot, garment, isDark, onSelect }) {
  const ICONS = { shirt: "\u{1F454}", sweater: "\u{1FAA2}", pants: "\u{1F456}", shoes: "\u{1F45F}", jacket: "\u{1F9E5}" };
  const border = isDark ? "#2b3140" : "#d1d5db";
  const photo = garment?.thumbnail || garment?.photoUrl;

  return (
    <div
      onClick={() => garment && onSelect && onSelect(garment.id)}
      style={{
        background: isDark ? "#0f131a" : "#f3f4f6", borderRadius: 12,
        border: `1px solid ${border}`,
        overflow: "hidden", cursor: garment ? "pointer" : "default",
        transition: "border-color 0.15s",
        minHeight: 90,
      }}
    >
      {/* Photo area */}
      {photo ? (
        <img
          src={photo}
          alt={garment.name}
          style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }}
        />
      ) : (
        <div style={{
          width: "100%", height: 80,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, background: isDark ? "#171a21" : "#e5e7eb",
        }}>
          {ICONS[slot] ?? "\u{2022}"}
        </div>
      )}

      {/* Label */}
      <div style={{ padding: "8px 10px" }}>
        <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase",
                      letterSpacing: "0.07em", marginBottom: 2 }}>{slot}</div>
        {garment ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937",
                          lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden",
                          textOverflow: "ellipsis" }}>
              {garment.color} {garment.type}
            </div>
            {garment.brand && (
              <div style={{ fontSize: 11, color: "#8b93a7", marginTop: 1 }}>{garment.brand}</div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 11, color: "#4b5563", fontStyle: "italic" }}>Empty</div>
        )}
      </div>
    </div>
  );
}

export default function WatchDashboard() {
  const watches        = useWatchStore(s => s.watches);
  const activeWatch    = useWatchStore(s => s.activeWatch);
  const setActiveWatch = useWatchStore(s => s.setActiveWatch);
  const garments             = useWardrobeStore(s => s.garments);
  const setSelectedGarmentId = useWardrobeStore(s => s.setSelectedGarmentId);
  const history        = useHistoryStore(s => s.entries);
  const addRejection   = useRejectStore(s => s.addRejection);
  const { mode } = useThemeStore();
  const isDark = mode === "dark";

  const strapStraps     = useStrapStore(s => s.straps);
  const strapActiveMap  = useStrapStore(s => s.activeStrap);

  const [weather, setWeather] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [compareWatch, setCompareWatch] = useState(null);
  const [watchRecLoading, setWatchRecLoading] = useState(false);
  const [watchRecResult, setWatchRecResult] = useState(null);
  const [outfitLogged, setOutfitLogged] = useState(false);

  useEffect(() => {
    if (!activeWatch && watches.length > 0) {
      setActiveWatch(watches[0]);
    }
  }, [watches, activeWatch, setActiveWatch]);

  useEffect(() => {
    fetchWeather()
      .then(setWeather)
      .catch(err => console.warn("[weather] failed:", err.message));
  }, []);

  const selectedWatch = activeWatch ?? watches[0] ?? null;

  // Enrich watch with the ACTIVE strap — overrides static seed value
  // All engine consumers (buildOutfit, generateOutfit, explainOutfitChoice, getAISuggestion)
  // receive this enriched object, so strap-shoe logic is always accurate
  const enrichedWatch = useMemo(() => {
    if (!selectedWatch) return null;
    const activeStrapId = strapActiveMap[selectedWatch.id];
    const activeStrapObj = activeStrapId ? strapStraps[activeStrapId] : null;
    if (!activeStrapObj) return selectedWatch;
    // Build strap string the engine understands: "black leather", "brown leather", "bracelet" etc.
    const strapStr = activeStrapObj.type === "bracelet" || activeStrapObj.type === "integrated"
      ? activeStrapObj.type
      : `${activeStrapObj.color} ${activeStrapObj.type}`; // e.g. "brown leather", "teal leather", "navy nato"
    return { ...selectedWatch, strap: strapStr, _activeStrapLabel: activeStrapObj.label };
  }, [selectedWatch, strapActiveMap, strapStraps]);

  const weatherObj = useMemo(() => ({ tempC: weather?.tempC ?? 22 }), [weather]);

  const outfit = useMemo(() => {
    if (!enrichedWatch) return {};
    const newOutfit = buildOutfit(enrichedWatch, garments, weatherObj, history);
    const hasItems = Object.values(newOutfit).some(Boolean);
    if (hasItems) return newOutfit;
    return generateOutfit(enrichedWatch, garments, weatherObj, {}, history);
  }, [enrichedWatch, garments, weatherObj, history]); // buildOutfit/generateOutfit filter accessories internally

  const explanation = useMemo(() => {
    if (!enrichedWatch) return "";
    return explainOutfitChoice(enrichedWatch, outfit, weather);
  }, [enrichedWatch, outfit, weather]);

  const weatherText = formatWeatherText(weather);
  const layerRec = weather ? getLayerRecommendation(weather.tempC) : null;

  const handleAIStylist = useCallback(async () => {
    if (!enrichedWatch || garments.length === 0) return;
    setAiLoading(true);
    setAiSuggestion(null);
    try {
      // Derive day profile from today's context in week planner (not from watch style)
      const todayIso = new Date().toISOString().slice(0, 10);
      const onCallDates = useWardrobeStore.getState().onCallDates ?? [];
      const weekCtx = useWardrobeStore.getState().weekCtx ?? [];
      const todayDayIdx = new Date().getDay();
      const baseCtx = weekCtx[todayDayIdx] ?? "smart-casual";
      const contextProfile = onCallDates.includes(todayIso) ? "shift"
        : baseCtx === "hospital-smart-casual" ? "hospital-smart-casual"
        : baseCtx === "formal" ? "formal"
        : baseCtx === "casual" ? "casual"
        : "smart-casual";
      const suggestion = await getAISuggestion(garments, enrichedWatch, weather, outfit, contextProfile);
      setAiSuggestion(suggestion);
    } catch (err) {
      console.warn("[aiStylist] failed:", err.message);
    }
    setAiLoading(false);
  }, [enrichedWatch, garments, weather, outfit]);

  return (
    <div style={{
      padding: "18px 20px", borderRadius: 18, marginBottom: 20,
      background: isDark ? "#171a21" : "#ffffff",
      border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
    }}>
      {/* Header — stacks on mobile */}
      <style>{`
        .wa-dash-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; flex-wrap:wrap; }
        .wa-dash-controls { display:flex; align-items:center; gap:8px; }
        .wa-compare-select { display:block; }
        @media (max-width:600px) {
          .wa-compare-select { display:none; }
          .wa-dash-header { margin-bottom:12px; }
        }
      `}</style>
      <div className="wa-dash-header">
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937" }}>Today&apos;s Watch</h2>
        <div className="wa-dash-controls">
          {watches.length >= 2 && (
            <select
              className="wa-compare-select"
              value=""
              onChange={e => {
                const w = watches.find(w => w.id === e.target.value);
                if (w && selectedWatch) setCompareWatch(w);
              }}
              style={{
                padding: "4px 8px", borderRadius: 6, fontSize: 12,
                background: isDark ? "#0f131a" : "#f3f4f6",
                color: isDark ? "#8b93a7" : "#6b7280",
                border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
                cursor: "pointer",
              }}
            >
              <option value="">Compare with...</option>
              {watches.filter(w => w.id !== selectedWatch?.id).map(w => (
                <option key={w.id} value={w.id}>{w.brand} {w.model}</option>
              ))}
            </select>
          )}
          {watches.length > 0 && (
            <WatchSelector
              watches={watches}
              activeWatch={selectedWatch}
              onChange={setActiveWatch}
            />
          )}
        </div>
      </div>

      {weatherText && (
        <div style={{
          fontSize: 13, color: "#8b93a7", marginBottom: 14,
          padding: "6px 12px", borderRadius: 8,
          background: isDark ? "#0f131a" : "#f3f4f6",
          border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
          display: "inline-block",
        }}>
          Weather: {weatherText}
          {layerRec && layerRec.layer !== "none" && (
            <span style={{ marginLeft: 8, color: "#f97316" }}>&middot; {layerRec.label}</span>
          )}
        </div>
      )}

      {!selectedWatch && (
        <div style={{ color: "#6b7280", fontSize: 14 }}>No watches available.</div>
      )}

      {selectedWatch && (
        <>
          <div style={{ marginBottom: 18 }}>
            <WatchCard watch={selectedWatch} label="Selected" accent="#3b82f6" isDark={isDark} />
          </div>

          <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Outfit built around this watch
          </div>
          <style>{`
            .wa-outfit-grid { display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; margin-bottom:16px; }
            @media (max-width:400px) { .wa-outfit-grid { grid-template-columns:1fr; } }
          `}</style>
          <div className="wa-outfit-grid">
            {["shirt", "sweater", "pants", "shoes", "jacket"].map(slot => {
              if (slot === "sweater" && !outfit.sweater) return null;
              return <OutfitSlot key={slot} slot={slot} garment={outfit[slot]} isDark={isDark} onSelect={setSelectedGarmentId} />;
            })}
          </div>

          <button
            onClick={() => {
              const garmentIds = ["shirt","sweater","pants","shoes","jacket"]
                .map(s => outfit[s]?.id).filter(Boolean);
              if (garmentIds.length === 0) return;
              const addEntry = useHistoryStore.getState().addEntry;
              addEntry({
                id: `dash-${Date.now()}`,
                date: new Date().toISOString().slice(0,10),
                watchId: selectedWatch.id,
                garmentIds,
                context: "smart-casual",
                loggedAt: new Date().toISOString(),
              });
              setOutfitLogged(true);
              setTimeout(() => setOutfitLogged(false), 3000);
            }}
            disabled={outfitLogged}
            style={{
              width: "100%", marginBottom: 12, padding: "10px 0", borderRadius: 8,
              border: "none",
              background: outfitLogged ? "#166534" : "#22c55e",
              color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: outfitLogged ? "default" : "pointer",
              transition: "background 0.3s",
            }}
          >
            {outfitLogged ? "Logged! Check History tab" : "Wear This Outfit"}
          </button>

          <div style={{
            fontSize: 14, lineHeight: 1.6, color: isDark ? "#a1a9b8" : "#4b5563",
            background: isDark ? "#0f131a" : "#f3f4f6", borderRadius: 10,
            padding: "12px 14px", borderLeft: "3px solid #3b82f6",
            marginBottom: 14,
          }}>
            {explanation}
          </div>

          <StrapPanel watch={selectedWatch} isDark={isDark} />

          <button
            onClick={handleAIStylist}
            disabled={aiLoading || garments.length === 0}
            style={{
              width: "100%", marginBottom: 14,
              padding: "10px 16px", borderRadius: 8, border: "1px solid #3b82f6",
              background: aiLoading ? "#1e3a5f" : (isDark ? "#0f131a" : "#f3f4f6"),
              color: "#3b82f6",
              fontSize: 13, fontWeight: 600, cursor: aiLoading ? "wait" : "pointer",
            }}
          >
            {aiLoading ? "Asking Claude..." : "Ask AI Stylist"}
          </button>

          {aiSuggestion && (
            <div style={{
              background: isDark ? "#0f131a" : "#f5f3ff", borderRadius: 10, padding: "12px 14px",
              borderLeft: "3px solid #8b5cf6", fontSize: 13, lineHeight: 1.6, color: isDark ? "#c4b5fd" : "#5b21b6",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ fontWeight: 600, color: "#8b5cf6", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  AI Stylist Suggestion
                </div>
                {aiSuggestion.strapShoeOk === false && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: "#7f1d1d", color: "#fca5a5" }}>
                    ⚠ Strap-shoe mismatch
                  </span>
                )}
                {aiSuggestion.strapShoeOk === true && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: "#14532d", color: "#86efac" }}>
                    ✓ Strap-shoe ok
                  </span>
                )}
              </div>
              {aiSuggestion.explanation && (
                <div style={{ marginBottom: 8, color: isDark ? "#a1a9b8" : "#4b5563" }}>{aiSuggestion.explanation}</div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["shirt", "pants", "shoes", "jacket"].map(slot => {
                  const gName = aiSuggestion[slot];
                  if (!gName) return null;
                  const g = garments.find(x => x.name === gName);
                  const label = g ? `${g.color} ${g.type}` : gName;
                  return (
                    <button
                      key={slot}
                      onClick={() => g && setSelectedGarmentId(g.id)}
                      title={g ? `Go to ${gName} in wardrobe` : gName}
                      style={{
                        fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: g ? "pointer" : "default",
                        background: isDark ? "#2e1065" : "#ede9fe", color: isDark ? "#c4b5fd" : "#5b21b6",
                        border: g ? "1px solid #8b5cf6" : "1px solid transparent",
                        fontWeight: 600, textAlign: "left",
                      }}
                    >
                      {slot}: <span style={{ fontWeight: 400 }}>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* AI Watch Rec — get watch suggestion for the current outfit */}
      {selectedWatch && (
        <div style={{ marginTop: 14 }}>
          <button onClick={async () => {
            if (watchRecLoading) return;
            setWatchRecLoading(true);
            setWatchRecResult(null);
            try {
              const outfit = {
                layers: garments.filter(g => g.type === "shirt" || g.type === "sweater"),
                bottom: garments.find(g => g.type === "pants" || g.type === "jeans"),
                shoes:  garments.find(g => g.type === "shoes"),
              };
              const res = await fetch("/.netlify/functions/watch-rec", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ outfit, watches, context: "smart-casual" }),
              });
              const data = await res.json();
              if (!data.error) setWatchRecResult(data);
            } catch(e) {} finally { setWatchRecLoading(false); }
          }}
          disabled={watchRecLoading}
          style={{ width:"100%", padding:"10px 16px", borderRadius:8,
                   border:"1px solid #f59e0b", background:"transparent",
                   color:"#f59e0b", fontSize:13, fontWeight:700,
                   cursor:watchRecLoading?"wait":"pointer", marginBottom:8 }}>
            {watchRecLoading ? "Finding best watch…" : "🤖 AI Watch Pick for Outfit"}
          </button>
          {watchRecResult && (
            <div style={{ borderRadius:12, padding:14, background:isDark?"#0f131a":"#fffbeb",
                          border:"1px solid #f59e0b44", marginBottom:8 }}>
              <div style={{ fontSize:12, fontWeight:800, color:"#f59e0b", marginBottom:6 }}>
                ⌚ {watchRecResult.top_pick}
              </div>
              <div style={{ fontSize:12, color:isDark?"#e2e8f0":"#1f2937", lineHeight:1.6, marginBottom:6 }}>
                {watchRecResult.top_pick_why}
              </div>
              {watchRecResult.strap_rec && <div style={{ fontSize:11, color:isDark?"#6b7280":"#9ca3af" }}>🔗 {watchRecResult.strap_rec}</div>}
              {watchRecResult.color_logic && <div style={{ fontSize:11, color:"#8b5cf6", marginTop:4 }}>🎨 {watchRecResult.color_logic}</div>}
              {watchRecResult.runner_up && <div style={{ fontSize:11, color:isDark?"#6b7280":"#9ca3af", marginTop:4 }}>2nd: {watchRecResult.runner_up} — {watchRecResult.runner_up_why}</div>}
            </div>
          )}

          {/* Reject current suggestion */}
          <button onClick={() => {
            if (!selectedWatch) return;
            const garmentIds = garments.slice(0,8).map(g => g.id);
            addRejection(selectedWatch.id, garmentIds, "smart-casual");
          }}
          style={{ fontSize:11, color:isDark?"#4b5563":"#9ca3af", background:"none", border:"none",
                   cursor:"pointer", width:"100%", padding:"4px 0", textAlign:"center" }}>
            ✕ Skip this suggestion
          </button>
        </div>
      )}

      {/* Watch ID from photo */}
      <WatchIDPanel />

      {compareWatch && selectedWatch && (
        <WatchCompare
          watches={[selectedWatch, compareWatch]}
          onClose={() => setCompareWatch(null)}
        />
      )}
    </div>
  );
}
