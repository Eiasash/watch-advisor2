import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useWatchStore } from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { generateOutfit, explainOutfit } from "../engine/outfitEngine.js";
import { buildOutfit, explainOutfitChoice } from "../outfitEngine/outfitBuilder.js";
import { fetchWeather, formatWeatherText, getLayerRecommendation } from "../weather/weatherService.js";
import { getAISuggestion } from "../aiStylist/claudeStylist.js";
import WatchSelector from "../features/watch/WatchSelector.jsx";

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
};

function WatchCard({ watch, label, accent = "#3b82f6" }) {
  if (!watch) return null;
  const swatch = DIAL_SWATCH[watch.dial] ?? "#444";

  return (
    <div style={{
      background: "#0f131a",
      borderRadius: 14,
      padding: "14px 16px",
      border: `1px solid ${accent}33`,
      display: "flex", gap: 14, alignItems: "flex-start",
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        background: swatch,
        border: "3px solid #2b3140",
        flexShrink: 0,
        boxShadow: `0 0 12px ${swatch}44`,
      }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: accent, marginBottom: 3, textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>{watch.model}</div>
        <div style={{ fontSize: 13, color: "#8b93a7", marginTop: 2 }}>{watch.brand} &middot; {watch.ref}</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
          {watch.dial} dial &middot; {watch.style} &middot; formality {watch.formality}/10
        </div>
      </div>
    </div>
  );
}

function OutfitSlot({ slot, garment }) {
  const ICONS = { shirt: "\u{1F454}", pants: "\u{1F456}", shoes: "\u{1F45F}", jacket: "\u{1F9E5}" };
  return (
    <div style={{
      background: "#0f131a", borderRadius: 12, padding: "12px 14px",
      border: "1px solid #2b3140", minHeight: 90,
    }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{ICONS[slot] ?? "\u{2022}"}</div>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{slot}</div>
      {garment ? (
        <>
          <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{garment.name}</div>
          <div style={{ fontSize: 12, color: "#8b93a7", marginTop: 2 }}>{garment.color}</div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: "#4b5563", fontStyle: "italic" }}>No garments yet</div>
      )}
    </div>
  );
}

export default function WatchDashboard() {
  const watches        = useWatchStore(s => s.watches);
  const activeWatch    = useWatchStore(s => s.activeWatch);
  const setActiveWatch = useWatchStore(s => s.setActiveWatch);
  const garments       = useWardrobeStore(s => s.garments);
  const history        = useHistoryStore(s => s.entries);

  const [weather, setWeather] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Auto-select first watch if none selected
  useEffect(() => {
    if (!activeWatch && watches.length > 0) {
      setActiveWatch(watches[0]);
    }
  }, [watches, activeWatch, setActiveWatch]);

  // Fetch weather in background
  useEffect(() => {
    fetchWeather()
      .then(setWeather)
      .catch(err => console.warn("[weather] failed:", err.message));
  }, []);

  const selectedWatch = activeWatch ?? watches[0] ?? null;

  // Generate outfit using both engines — prefer the new one
  const weatherObj = useMemo(() => ({ tempC: weather?.tempC ?? 22 }), [weather]);

  const outfit = useMemo(() => {
    if (!selectedWatch) return {};
    // Use new outfit builder
    const newOutfit = buildOutfit(selectedWatch, garments, weatherObj, history);
    // Fallback to legacy engine if new one returns empty
    const hasItems = Object.values(newOutfit).some(Boolean);
    if (hasItems) return newOutfit;
    return generateOutfit(selectedWatch, garments, weatherObj, {}, history);
  }, [selectedWatch, garments, weatherObj, history]);

  const explanation = useMemo(() => {
    if (!selectedWatch) return "";
    return explainOutfitChoice(selectedWatch, outfit, weather);
  }, [selectedWatch, outfit, weather]);

  const weatherText = formatWeatherText(weather);
  const layerRec = weather ? getLayerRecommendation(weather.tempC) : null;

  // AI Stylist
  const handleAIStylist = useCallback(async () => {
    if (!selectedWatch || garments.length === 0) return;
    setAiLoading(true);
    setAiSuggestion(null);
    try {
      const suggestion = await getAISuggestion(garments, selectedWatch, weather);
      setAiSuggestion(suggestion);
    } catch (err) {
      console.warn("[aiStylist] failed:", err.message);
    }
    setAiLoading(false);
  }, [selectedWatch, garments, weather]);

  return (
    <div style={{
      padding: "18px 20px", borderRadius: 18, marginBottom: 20,
      background: "#171a21", border: "1px solid #2b3140",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Today's Watch</h2>
        {watches.length > 0 && (
          <WatchSelector
            watches={watches}
            activeWatch={selectedWatch}
            onChange={setActiveWatch}
          />
        )}
      </div>

      {/* Weather display */}
      {weatherText && (
        <div style={{
          fontSize: 13, color: "#8b93a7", marginBottom: 14,
          padding: "6px 12px", borderRadius: 8,
          background: "#0f131a", border: "1px solid #2b3140",
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
          {/* Watch card */}
          <div style={{ marginBottom: 18 }}>
            <WatchCard watch={selectedWatch} label="Selected" accent="#3b82f6" />
          </div>

          {/* Outfit slots */}
          <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Outfit built around this watch
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            {["shirt", "pants", "shoes", "jacket"].map(slot => (
              <OutfitSlot key={slot} slot={slot} garment={outfit[slot]} />
            ))}
          </div>

          {/* Explanation */}
          <div style={{
            fontSize: 14, lineHeight: 1.6, color: "#a1a9b8",
            background: "#0f131a", borderRadius: 10,
            padding: "12px 14px", borderLeft: "3px solid #3b82f6",
            marginBottom: 14,
          }}>
            {explanation}
          </div>

          {/* AI Stylist button */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <button
              onClick={handleAIStylist}
              disabled={aiLoading || garments.length === 0}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "1px solid #3b82f6",
                background: aiLoading ? "#1e3a5f" : "#0f131a", color: "#3b82f6",
                fontSize: 13, fontWeight: 600, cursor: aiLoading ? "wait" : "pointer",
              }}
            >
              {aiLoading ? "Asking Claude..." : "Ask AI Stylist"}
            </button>
          </div>

          {/* AI Suggestion */}
          {aiSuggestion && (
            <div style={{
              background: "#0f131a", borderRadius: 10, padding: "12px 14px",
              borderLeft: "3px solid #8b5cf6", fontSize: 13, lineHeight: 1.6, color: "#c4b5fd",
            }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: "#8b5cf6", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                AI Stylist Suggestion
              </div>
              {aiSuggestion.explanation && (
                <div style={{ marginBottom: 8, color: "#a1a9b8" }}>{aiSuggestion.explanation}</div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["shirt", "pants", "shoes", "jacket"].map(slot =>
                  aiSuggestion[slot] ? (
                    <span key={slot} style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 6,
                      background: "#2e1065", color: "#c4b5fd",
                    }}>
                      {slot}: {aiSuggestion[slot]}
                    </span>
                  ) : null
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
