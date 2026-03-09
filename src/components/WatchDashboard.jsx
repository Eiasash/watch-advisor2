import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
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
import { normalizeType } from "../classifier/normalizeType.js";

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

function OutfitSlot({ slot, garment, isDark, onSelect, candidates = [], onSwap, isOverridden }) {
  const [open, setOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const ICONS = { shirt: "\u{1F454}", sweater: "\u{1FAA2}", layer: "\u{1F9E3}", pants: "\u{1F456}", shoes: "\u{1F45F}", jacket: "\u{1F9E5}" };
  const border = isDark ? "#2b3140" : "#d1d5db";
  const accentBorder = isOverridden ? "#8b5cf6" : (open ? "#3b82f6" : border);
  const photo = garment?.thumbnail || garment?.photoUrl;

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => { if (candidates.length > 0) setOpen(o => !o); }}
        style={{
          background: isDark ? "#0f131a" : "#f3f4f6", borderRadius: 12,
          border: `1px solid ${accentBorder}`,
          overflow: "hidden", cursor: candidates.length > 0 ? "pointer" : "default",
          minHeight: 90, transition: "border-color 0.15s",
          boxShadow: open ? `0 0 0 2px ${isDark ? "#3b82f622" : "#3b82f611"}` : "none",
        }}
      >
        {photo ? (
          <img
            src={photo} alt={garment?.name ?? ""}
            onClick={e => { e.stopPropagation(); setLightbox({ src: photo, alt: `${garment.color ?? ""} ${garment.type ?? ""}`.trim() }); }}
            style={{ width: "100%", height: 110, objectFit: "cover", display: "block", cursor: "zoom-in" }}
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
        <div style={{ padding: "6px 10px 8px", display: "flex", alignItems: "flex-start", gap: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
              {slot}{isOverridden ? " ✎" : ""}
            </div>
            {garment ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937",
                              lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
          {candidates.length > 0 && (
            <span style={{ fontSize: 10, color: "#6b7280", flexShrink: 0, marginTop: 2 }}>{open ? "▲" : "▼"}</span>
          )}
        </div>
      </div>

      {/* Swap dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
          maxHeight: 200, overflowY: "auto",
          background: isDark ? "#171a21" : "#fff",
          border: `1px solid ${border}`, borderRadius: 8, marginTop: 2,
          boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
        }}>
          {isOverridden && (
            <div
              onClick={() => { onSwap && onSwap(slot, null); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                cursor: "pointer", borderBottom: `1px solid ${isDark ? "#2b3140" : "#e5e7eb"}`,
                color: "#ef4444", fontSize: 11, fontWeight: 600,
              }}
            >
              ↩ Reset to engine pick
            </div>
          )}
          {candidates.map(c => {
            const cPhoto = c.thumbnail || c.photoUrl;
            const isCurrent = c.id === garment?.id;
            return (
              <div key={c.id}
                onClick={() => { onSwap && onSwap(slot, c); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                  cursor: "pointer",
                  background: isCurrent ? (isDark ? "#0c1f3f" : "#eff6ff") : "transparent",
                  borderBottom: `1px solid ${isDark ? "#2b3140" : "#e5e7eb"}`,
                }}
              >
                {cPhoto ? (
                  <img src={cPhoto} alt={c.name ?? ""}
                    onClick={e => { e.stopPropagation(); setLightbox({ src: cPhoto, alt: `${c.color ?? ""} ${c.type ?? ""}`.trim() }); }}
                    style={{ width: 28, height: 28, borderRadius: 5, objectFit: "cover", cursor: "zoom-in", flexShrink: 0 }}
                  />
                ) : (
                  <span style={{ fontSize: 16, width: 28, textAlign: "center", flexShrink: 0 }}>{ICONS[slot] ?? "\u{1F455}"}</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#e2e8f0" : "#1f2937",
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.color} {c.type}
                  </div>
                  {c.brand && <div style={{ fontSize: 10, color: "#8b93a7" }}>{c.brand}</div>}
                </div>
                {isCurrent && <span style={{ color: "#3b82f6", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>✓</span>}
              </div>
            );
          })}
          {candidates.length === 0 && (
            <div style={{ padding: "10px 12px", color: "#6b7280", fontSize: 11, fontStyle: "italic" }}>No other options</div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.88)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out",
        }}>
          <img src={lightbox.src} alt={lightbox.alt ?? ""} style={{
            maxWidth: "92vw", maxHeight: "85vh", borderRadius: 12, objectFit: "contain",
            boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          }} />
          <div style={{ position: "absolute", top: 16, right: 20, color: "#fff", fontSize: 28, fontWeight: 300, padding: "4px 10px" }}>{"\u00D7"}</div>
        </div>
      )}
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
  const [overrideOutfit, setOverrideOutfit] = useState(null);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  // Per-slot manual overrides: { shirt: garmentObj, pants: garmentObj, ... }
  const [slotOverrides, setSlotOverrides] = useState({});
  // Debounce timer ref for auto AI re-trigger
  const aiDebounceRef = useRef(null);

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

  // Clear AI override outfit and manual overrides when watch changes
  useEffect(() => {
    setOverrideOutfit(null);
    setAiSuggestion(null);
    setSlotOverrides({});
    setShuffleSeed(0);
  }, [selectedWatch?.id]);

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

  // Determine today's context from weekCtx / onCallDates
  const todayContext = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const onCallDates = useWardrobeStore.getState().onCallDates ?? [];
    const weekCtx = useWardrobeStore.getState().weekCtx ?? [];
    const todayDayIdx = new Date().getDay(); // 0=Sun
    const baseCtx = weekCtx[todayDayIdx] ?? "smart-casual";
    return onCallDates.includes(todayIso) ? "shift" : baseCtx;
  }, []);

  // Candidates per slot — used by the inline swap pickers
  // normalizeType maps polo→shirt, jeans→pants, sneakers→shoes, blazer→jacket etc.
  const ACCESSORY_EXCL = new Set(["belt","sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);
  const wearable = useMemo(() =>
    garments.filter(g => !ACCESSORY_EXCL.has(g.type ?? g.category) && !g.excludeFromWardrobe),
    [garments]
  );
  const slotCandidates = useMemo(() => {
    const res = {};
    res.shirt = wearable.filter(g => normalizeType(g.type ?? g.category ?? "") === "shirt");
    res.pants = wearable.filter(g => normalizeType(g.type ?? g.category ?? "") === "pants");
    res.shoes = wearable.filter(g => normalizeType(g.type ?? g.category ?? "") === "shoes");
    res.jacket = wearable.filter(g => normalizeType(g.type ?? g.category ?? "") === "jacket");
    // sweater and layer slots both draw from sweater-type garments
    const sweaters = wearable.filter(g => normalizeType(g.type ?? g.category ?? "") === "sweater");
    res.sweater = sweaters;
    res.layer = sweaters;
    return res;
  }, [wearable]);

  const outfit = useMemo(() => {
    if (!enrichedWatch) return {};
    // Shuffle: each increment poisons the previous pick for all slots simultaneously
    // so diversityBonus slice(-5) penalises every slot, not just the last one.
    let iterHistory = [...history];
    let result = {};
    // Pass slotOverrides as pinnedSlots so engine adapts other slots to manual picks
    const hasPins = Object.keys(slotOverrides).length > 0;
    for (let round = 0; round <= shuffleSeed; round++) {
      const built = buildOutfit(enrichedWatch, garments, weatherObj, iterHistory, [], hasPins ? slotOverrides : {}, {}, todayContext);
      const hasItems = Object.values(built).some(Boolean);
      result = hasItems ? built : generateOutfit(enrichedWatch, garments, weatherObj, { context: todayContext }, iterHistory);
      if (round < shuffleSeed) {
        const combined = { outfit: {} };
        for (const slot of ["shirt","sweater","pants","shoes","jacket"]) {
          if (result[slot]?.id) combined.outfit[slot] = result[slot].id;
        }
        for (let i = 0; i < 5; i++) iterHistory.push(combined);
      }
    }
    return result;
  }, [enrichedWatch, garments, weatherObj, history, shuffleSeed, slotOverrides, todayContext]);

  // Merge: engine base + per-slot manual overrides
  const mergedOutfit = useMemo(() => {
    const base = overrideOutfit ?? outfit;
    return { ...base, ...slotOverrides };
  }, [outfit, overrideOutfit, slotOverrides]);

  const explanation = useMemo(() => {
    if (!enrichedWatch) return "";
    return explainOutfitChoice(enrichedWatch, mergedOutfit, weather);
  }, [enrichedWatch, mergedOutfit, weather]);

  const weatherText = formatWeatherText(weather);
  const layerRec = weather ? getLayerRecommendation(weather.tempC) : null;

  const handleAIStylist = useCallback(async (overridePinned) => {
    if (!enrichedWatch || garments.length === 0) return;
    setAiLoading(true);
    setAiSuggestion(null);
    try {
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
      // Use provided pinned overrides (from auto-retrigger) or current slotOverrides
      const pinned = overridePinned ?? slotOverrides;
      const suggestion = await getAISuggestion(garments, enrichedWatch, weather, mergedOutfit, contextProfile, pinned);
      setAiSuggestion(suggestion);
    } catch (err) {
      console.warn("[aiStylist] failed:", err.message);
    }
    setAiLoading(false);
  }, [enrichedWatch, garments, weather, mergedOutfit, slotOverrides]);

  // Auto re-trigger AI when user manually swaps a slot (debounced 800ms)
  // Only fires if AI was already active (aiSuggestion exists or aiLoading)
  useEffect(() => {
    if (Object.keys(slotOverrides).length === 0) return;
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    aiDebounceRef.current = setTimeout(() => {
      handleAIStylist(slotOverrides);
    }, 800);
    return () => clearTimeout(aiDebounceRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotOverrides]);

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
              isDark={isDark}
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

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: overrideOutfit ? "#8b5cf6" : "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {overrideOutfit ? "AI Stylist outfit" : "Outfit built around this watch"}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={() => { setShuffleSeed(s => (s + 1) % 8); setSlotOverrides({}); setOverrideOutfit(null); setAiSuggestion(null); }}
                title="Shuffle to next best outfit"
                style={{
                  fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${shuffleSeed > 0 ? "#6366f1" : (isDark ? "#2b3140" : "#d1d5db")}`,
                  background: shuffleSeed > 0 ? "#6366f122" : "transparent",
                  color: shuffleSeed > 0 ? "#818cf8" : (isDark ? "#6b7280" : "#9ca3af"),
                  fontWeight: 600,
                }}
              >
                🔀 Shuffle{shuffleSeed > 0 ? ` (${shuffleSeed})` : ""}
              </button>
              {(Object.keys(slotOverrides).length > 0 || shuffleSeed > 0 || overrideOutfit) && (
                <button
                  onClick={() => { setSlotOverrides({}); setShuffleSeed(0); setOverrideOutfit(null); setAiSuggestion(null); }}
                  style={{
                    fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                    border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
                    background: "transparent", color: "#ef4444", fontWeight: 600,
                  }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          <style>{`
            .wa-outfit-grid { display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; margin-bottom:16px; }
            @media (max-width:400px) { .wa-outfit-grid { grid-template-columns:1fr; } }
          `}</style>
          <div className="wa-outfit-grid">
            {["shirt", "sweater", "layer", "pants", "shoes", "jacket"].map(slot => {
              if ((slot === "sweater" || slot === "layer") && !mergedOutfit[slot]) return null;
              return (
                <OutfitSlot
                  key={slot}
                  slot={slot}
                  garment={mergedOutfit[slot]}
                  isDark={isDark}
                  isOverridden={!!slotOverrides[slot]}
                  candidates={slotCandidates[slot] ?? []}
                  onSwap={(s, g) => {
                    if (!g) {
                      setSlotOverrides(prev => { const n = {...prev}; delete n[s]; return n; });
                    } else {
                      setSlotOverrides(prev => ({ ...prev, [s]: g }));
                      setOverrideOutfit(null);
                    }
                  }}
                  onSelect={setSelectedGarmentId}
                />
              );
            })}
          </div>
          {overrideOutfit && (
            <button
              onClick={() => setOverrideOutfit(null)}
              style={{
                width: "100%", marginBottom: 8, padding: "6px 0", borderRadius: 6,
                border: `1px solid ${isDark ? "#4b5563" : "#d1d5db"}`,
                background: "transparent", color: isDark ? "#8b93a7" : "#6b7280",
                fontSize: 11, cursor: "pointer",
              }}
            >
              ↩ Back to engine outfit
            </button>
          )}

          <button
            onClick={() => {
              const slots = ["shirt","sweater","layer","pants","shoes","jacket"];
              const garmentIds = slots.map(s => mergedOutfit[s]?.id).filter(Boolean);
              if (garmentIds.length === 0) return;
              // Store slot→id map so diversityBonus + rejectStore can reference it
              const outfitMap = {};
              for (const s of slots) { if (mergedOutfit[s]?.id) outfitMap[s] = mergedOutfit[s].id; }
              // Use upsertEntry (not addEntry) to avoid duplicate rows if TodayPanel already logged today
              const upsertEntry = useHistoryStore.getState().upsertEntry;
              const todayIso = new Date().toISOString().slice(0,10);
              const existingToday = useHistoryStore.getState().entries.find(e => e.date === todayIso);
              upsertEntry({
                id: existingToday?.id ?? `dash-${Date.now()}`,
                date: todayIso,
                watchId: selectedWatch.id,
                garmentIds,
                outfit: outfitMap,
                context: existingToday?.context ?? "smart-casual",
                notes: existingToday?.notes ?? null,
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
                {["shirt", "sweater", "pants", "shoes", "jacket"].map(slot => {
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
              <button
                onClick={() => {
                  const built = {};
                  for (const slot of ["shirt", "sweater", "pants", "shoes", "jacket"]) {
                    const gName = aiSuggestion[slot];
                    if (gName) {
                      const g = garments.find(x => x.name === gName);
                      if (g) built[slot] = g;
                    }
                  }
                  // Preserve sweater from engine outfit if present
                  if (outfit.sweater) built.sweater = outfit.sweater;
                  if (Object.keys(built).length > 0) setOverrideOutfit(built);
                }}
                style={{
                  width: "100%", marginTop: 10, padding: "8px 0", borderRadius: 7,
                  border: "none", background: "#8b5cf6", color: "#fff",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                Apply This Outfit
              </button>
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
              // Use the current engine-built outfit, not all garments
              const recOutfit = {
                layers: [mergedOutfit.shirt, mergedOutfit.sweater, mergedOutfit.layer].filter(Boolean),
                bottom: mergedOutfit.pants ?? null,
                shoes:  mergedOutfit.shoes ?? null,
              };
              const res = await fetch("/.netlify/functions/watch-rec", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ outfit: recOutfit, watches, context: "smart-casual" }),
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
            const garmentIds = ["shirt","sweater","layer","pants","shoes","jacket"]
              .map(s => mergedOutfit[s]?.id).filter(Boolean);
            if (garmentIds.length === 0) return;
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
