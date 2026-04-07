import React, { useMemo, useState, useEffect } from "react";
import { useWatchStore } from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";

import { buildOutfit, explainOutfitChoice } from "../outfitEngine/outfitBuilder.js";
import { recommendStrap } from "../outfitEngine/strapRecommender.js";
import { fetchWeather, formatWeatherText, getLayerRecommendation } from "../weather/weatherService.js";
import WatchSelector from "../features/watch/WatchSelector.jsx";
import { useStrapStore } from "../stores/strapStore.js";
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
  const activeStrapObj = useStrapStore(s => s.getActiveStrapObj?.(watch.id));
  const strapLabel = activeStrapObj?.label ?? watch.strap ?? null;
  const allStraps = useStrapStore(s => s.getStrapsForWatch(watch.id));
  const setActive = useStrapStore(s => s.setActiveStrap);
  const [showStraps, setShowStraps] = useState(false);

  return (
    <div style={{
      background: isDark ? "#0f131a" : "#f3f4f6",
      borderRadius: 14,
      padding: "14px 16px",
      border: `1px solid ${accent}33`,
    }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{
          width: 52, height: 52, borderRadius: "50%",
          background: swatch,
          border: `3px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
          flexShrink: 0,
          boxShadow: `0 0 12px ${swatch}44`,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: accent, marginBottom: 3, textTransform: "uppercase" }}>{label}</div>
          <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2, color: isDark ? "#e2e8f0" : "#1f2937" }}>{watch.model}</div>
          <div style={{ fontSize: 13, color: "#8b93a7", marginTop: 2 }}>{watch.brand} &middot; {watch.ref}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
            {watch.dualDial
              ? <>{watch.dualDial.sideA} / {watch.dualDial.sideB} dial &middot; </>
              : <>{watch.dial} dial &middot; </>
            }
            {watch.style} &middot; formality {watch.formality}/10
          </div>
          {strapLabel && (
            <div
              onClick={() => allStraps.length > 1 && setShowStraps(s => !s)}
              style={{ fontSize: 11, color: showStraps ? "#3b82f6" : "#6b7280", marginTop: 2,
                       fontStyle: "italic", cursor: allStraps.length > 1 ? "pointer" : "default" }}>
              {strapLabel} {allStraps.length > 1 ? (showStraps ? "▲" : "▼ change") : ""}
            </div>
          )}
        </div>
      </div>
      {/* Inline strap picker */}
      {showStraps && allStraps.length > 1 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10, paddingTop: 10,
                      borderTop: `1px solid ${isDark ? "#2b3140" : "#e5e7eb"}` }}>
          {allStraps.map(s => (
            <button key={s.id}
              onClick={() => { setActive(watch.id, s.id); setShowStraps(false); }}
              style={{
                padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                border: `1px solid ${s.id === activeStrapObj?.id ? "#3b82f6" : (isDark ? "#2b3140" : "#d1d5db")}`,
                background: s.id === activeStrapObj?.id ? "#3b82f622" : "transparent",
                color: s.id === activeStrapObj?.id ? "#3b82f6" : (isDark ? "#8b93a7" : "#6b7280"),
                cursor: "pointer",
              }}>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OutfitSlot({ slot, garment, isDark, onSelect, candidates = [], onSwap, isOverridden, signals }) {
  const [open, setOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const ICONS = { shirt: "\u{1F454}", sweater: "\u{1FAA2}", layer: "\u{1F9E3}", pants: "\u{1F456}", shoes: "\u{1F45F}", jacket: "\u{1F9E5}" };
  const border = isDark ? "#2b3140" : "#d1d5db";
  const accentBorder = isOverridden ? "#8b5cf6" : (open ? "#3b82f6" : border);
  const photo = garment?.thumbnail || garment?.photoUrl;

  // Score chip helper
  const chipColor = (v) => v >= 0.7 ? "#22c55e" : v >= 0.4 ? "#f59e0b" : "#ef4444";
  const chipBg = (v, dark) => {
    const c = v >= 0.7 ? "22c55e" : v >= 0.4 ? "f59e0b" : "ef4444";
    return dark ? `#${c}18` : `#${c}15`;
  };

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
                {signals && (
                  <div style={{ display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap" }}>
                    {[
                      { k: "colorMatch", l: "clr" },
                      { k: "formalityMatch", l: "frm" },
                      { k: "watchCompat", l: "wtch" },
                      ...(slot === "shoes" ? [{ k: "strapShoe", l: "strap" }] : []),
                    ].map(({ k, l }) => {
                      const v = signals[k];
                      if (v == null) return null;
                      return (
                        <span key={k} style={{
                          fontSize: 9, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
                          color: chipColor(v), background: chipBg(v, isDark),
                          lineHeight: 1.4,
                        }}>
                          {v >= 0.7 ? "✓" : v >= 0.4 ? "~" : "✗"} {l}
                        </span>
                      );
                    })}
                  </div>
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
  const watches        = useWatchStore(s => s.watches) ?? [];
  const activeWatch    = useWatchStore(s => s.activeWatch);
  const setActiveWatch = useWatchStore(s => s.setActiveWatch);
  const garments             = useWardrobeStore(s => s.garments) ?? [];
  const setSelectedGarmentId = useWardrobeStore(s => s.setSelectedGarmentId);
  const history        = useHistoryStore(s => s.entries) ?? [];
  const addRejection   = useRejectStore(s => s.addRejection);
  const { mode } = useThemeStore();
  const isDark = mode === "dark";

  const strapStraps     = useStrapStore(s => s.straps) ?? {};
  const strapActiveMap  = useStrapStore(s => s.activeStrap) ?? {};

  const [weather, setWeather] = useState(null);
  const [outfitLogged, setOutfitLogged] = useState(false);
  const [lastCheckinRef, setLastCheckinRef] = useState(null); // for undo
  const [shuffleSeed, setShuffleSeed] = useState(0);
  // Per-slot manual overrides: { shirt: garmentObj, pants: garmentObj, ... }
  const [slotOverrides, setSlotOverrides] = useState({});
  const [showRejectModal, setShowRejectModal] = useState(false);

  useEffect(() => {
    if (!activeWatch && watches.length > 0) {
      setActiveWatch(watches[0]);
    }
  }, [watches, activeWatch, setActiveWatch]);

  useEffect(() => {
    // Delay weather fetch 2s after mount — avoids geolocation-on-page-load
    // Lighthouse flag and gives the main bundle time to hydrate first.
    const t = setTimeout(() => {
      fetchWeather().then(setWeather);
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  const selectedWatch = activeWatch ?? watches.find(w => !w.retired) ?? null;

  // Clear manual overrides when watch changes
  useEffect(() => {
    setSlotOverrides({});
    setShuffleSeed(0);
  }, [selectedWatch?.id]);

  // Enrich watch with the ACTIVE strap — overrides static seed value
  // All engine consumers (buildOutfit, explainOutfitChoice)
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

  const weatherObj = useMemo(() => ({ tempC: weather?.tempC ?? 15 }), [weather]);

  // Determine today's context from weekCtx / onCallDates
  const todayContext = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const onCallDates = useWardrobeStore.getState().onCallDates ?? [];
    const weekCtx = useWardrobeStore.getState().weekCtx ?? [];
    const todayDayIdx = new Date().getDay(); // 0=Sun
    const baseCtx = weekCtx[todayDayIdx] ?? null;
    return onCallDates.includes(todayIso) ? "shift" : baseCtx;
  }, []);

  // Candidates per slot — used by the inline swap pickers
  // normalizeType maps polo→shirt, jeans→pants, sneakers→shoes, blazer→jacket etc.
  const ACCESSORY_EXCL = new Set(["sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);
  const wearable = useMemo(() =>
    garments.filter(g => !ACCESSORY_EXCL.has(g.type) && !g.excludeFromWardrobe),
    [garments]
  );
  const slotCandidates = useMemo(() => {
    const res = {};
    res.shirt = wearable.filter(g => normalizeType(g.type ?? "") === "shirt");
    res.pants = wearable.filter(g => normalizeType(g.type ?? "") === "pants");
    res.shoes = wearable.filter(g => normalizeType(g.type ?? "") === "shoes");
    res.jacket = wearable.filter(g => normalizeType(g.type ?? "") === "jacket");
    // sweater and layer slots both draw from sweater-type garments
    const sweaters = wearable.filter(g => normalizeType(g.type ?? "") === "sweater");
    res.sweater = sweaters;
    res.layer = sweaters;
    return res;
  }, [wearable]);

  const outfit = useMemo(() => {
    if (!enrichedWatch) return {};
    // Shuffle: each increment poisons the previous pick for all slots simultaneously
    // so diversityBonus slice(-5) penalises every slot, not just the last one.
    // Also track excluded garments per slot to prevent cycling back to earlier picks
    // once they fall outside the diversityBonus slice(-5) window.
    let iterHistory = [...history];
    let result = {};
    const shuffleExcluded = {};
    for (const slot of ["shirt","sweater","pants","shoes","jacket"]) shuffleExcluded[slot] = new Set();
    // Pass slotOverrides as pinnedSlots so engine adapts other slots to manual picks
    const hasPins = Object.keys(slotOverrides).length > 0;
    for (let round = 0; round <= shuffleSeed; round++) {
      result = buildOutfit(enrichedWatch, wearable, weatherObj, iterHistory, [], hasPins ? slotOverrides : {}, shuffleExcluded, todayContext);
      if (round < shuffleSeed) {
        const combined = { outfit: {} };
        const allIds = [];
        for (const slot of ["shirt","sweater","pants","shoes","jacket"]) {
          if (result[slot]?.id) {
            combined.outfit[slot] = result[slot].id;
            allIds.push(result[slot].id);
            shuffleExcluded[slot].add(result[slot].id);
          }
        }
        // garmentIds needed so repetitionPenalty (contextMemory.js) also fires
        // on fake shuffle entries — not just diversityBonus which reads .outfit
        combined.garmentIds = allIds;
        for (let i = 0; i < 5; i++) iterHistory.push(combined);
      }
    }
    return result;
  }, [enrichedWatch, garments, weatherObj, history, shuffleSeed, slotOverrides, todayContext]);

  // Merge: engine base + per-slot manual overrides
  const mergedOutfit = useMemo(() => {
    return { ...outfit, ...slotOverrides };
  }, [outfit, slotOverrides]);

  const explanation = useMemo(() => {
    if (!enrichedWatch) return "";
    return explainOutfitChoice(enrichedWatch, mergedOutfit, weather);
  }, [enrichedWatch, mergedOutfit, weather]);

  const weatherText = formatWeatherText(weather);
  const layerRec = weather ? getLayerRecommendation(weather.tempC) : null;

  // Strap recommendation — which strap to wear today based on outfit + context
  const strapRec = useMemo(() => {
    if (!selectedWatch) return null;
    return recommendStrap(selectedWatch, mergedOutfit, todayContext);
  }, [selectedWatch, mergedOutfit, todayContext]);

  // Hide when today already has logged entries — TodayPanel handles that view
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayHasEntries = history.some(e => e.date === todayIso);
  if (todayHasEntries) return null;

  // When on-call, OnCallPlanner (rendered in TodayPanel) handles outfit generation.
  // Showing a second outfit here would be confusing duplicate advice.
  if (todayContext === "shift") return null;

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
        @media (max-width:600px) {
          .wa-dash-header { margin-bottom:12px; }
        }
      `}</style>
      <div className="wa-dash-header">
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937" }}>Today&apos;s Watch</h2>
        <div className="wa-dash-controls">
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

          {/* Strap recommendation for today's outfit */}
          {strapRec && (
            <div style={{
              marginBottom: 14, padding: "10px 14px", borderRadius: 10,
              background: isDark ? "#0f1318" : "#f0fdf4",
              border: `1px solid ${isDark ? "#16a34a33" : "#22c55e33"}`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{ fontSize: 18, flexShrink: 0 }}>🔗</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#86efac" : "#166534" }}>
                  Wear: {strapRec.recommended.label}
                </div>
                <div style={{ fontSize: 11, color: isDark ? "#8b93a7" : "#6b7280", marginTop: 2 }}>
                  {strapRec.reason}
                </div>
                {strapRec.alternatives.length > 0 && (
                  <div style={{ fontSize: 10, color: isDark ? "#4b5563" : "#9ca3af", marginTop: 3 }}>
                    Also: {strapRec.alternatives.map(a => a.label).join(" · ")}
                  </div>
                )}
              </div>
              {strapRec.recommended.id && (
                <button
                  onClick={() => {
                    const setActive = useStrapStore.getState().setActiveStrap;
                    setActive(selectedWatch.id, strapRec.recommended.id);
                  }}
                  style={{
                    fontSize: 10, padding: "3px 8px", borderRadius: 5, cursor: "pointer",
                    border: "1px solid #22c55e", background: "transparent", color: "#22c55e",
                    fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >
                  Set Active
                </button>
              )}
            </div>
          )}

          {/* Quick watch check-in — logs just the watch, no outfit required */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <button
              onClick={() => {
                const todayIso = new Date().toISOString().slice(0,10);
                const activeStrapObj = useStrapStore.getState().getActiveStrapObj?.(selectedWatch.id);
                // Per-watch entry: same watch on same day = update, different watch = new entry
                const entryId = `wear-${todayIso}-${selectedWatch.id}`;
                const existingForWatch = useHistoryStore.getState().entries.find(e => e.id === entryId);
                // Save previous state for undo
                setLastCheckinRef(existingForWatch ? { ...existingForWatch } : null);
                useHistoryStore.getState().upsertEntry({
                  id: entryId,
                  date: todayIso,
                  watchId: selectedWatch.id,
                  garmentIds: existingForWatch?.garmentIds ?? [],
                  context: todayContext ?? existingForWatch?.context ?? null,
                  strapId: activeStrapObj?.id ?? null,
                  strapLabel: activeStrapObj?.label ?? null,
                  notes: existingForWatch?.notes ?? null,
                  loggedAt: new Date().toISOString(),
                });
                setOutfitLogged(true);
                setTimeout(() => { setOutfitLogged(false); setLastCheckinRef(null); }, 10000);
              }}
              disabled={outfitLogged}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 8,
                border: "none", cursor: outfitLogged ? "default" : "pointer",
                background: outfitLogged ? "#166534" : "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                color: "#fff", fontSize: 13, fontWeight: 700,
                boxShadow: outfitLogged ? "none" : "0 2px 8px #3b82f633",
              }}
            >
              {outfitLogged ? "✅ Checked In!" : `⌚ Check In — ${selectedWatch.model}`}
            </button>
            {outfitLogged && (
              <button
                onClick={() => {
                  if (lastCheckinRef) {
                    useHistoryStore.getState().upsertEntry(lastCheckinRef);
                  } else {
                    const todayIso = new Date().toISOString().slice(0,10);
                    const entryId = `wear-${todayIso}-${selectedWatch.id}`;
                    const entry = useHistoryStore.getState().entries.find(e => e.id === entryId);
                    if (entry) useHistoryStore.getState().removeEntry(entry.id);
                  }
                  setOutfitLogged(false);
                  setLastCheckinRef(null);
                }}
                style={{
                  padding: "10px 14px", borderRadius: 8,
                  border: `1px solid ${isDark ? "#374151" : "#d1d5db"}`,
                  background: "transparent", color: isDark ? "#9ca3af" : "#6b7280",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                Undo
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Outfit built around this watch
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={() => setShowRejectModal(true)}
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
              {(Object.keys(slotOverrides).length > 0 || shuffleSeed > 0) && (
                <button
                  onClick={() => { setSlotOverrides({}); setShuffleSeed(0); }}
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
                  signals={mergedOutfit._slotSignals?.[slot] ?? null}
                  onSwap={(s, g) => {
                    if (!g) {
                      setSlotOverrides(prev => { const n = {...prev}; delete n[s]; return n; });
                    } else {
                      setSlotOverrides(prev => ({ ...prev, [s]: g }));
                    }
                  }}
                  onSelect={setSelectedGarmentId}
                />
              );
            })}

            {/* Belt — auto-derived from shoes, not swappable */}
            {mergedOutfit.belt && (
              <div style={{
                display:"flex", alignItems:"center", gap:8, padding:"4px 8px",
                borderRadius:6, border:`1px solid ${isDark?"#374151":"#e5e7eb"}`,
                background:isDark?"#1f2937":"#f9fafb", fontSize:12, marginTop:2,
                color:isDark?"#9ca3af":"#6b7280",
              }}>
                <span style={{fontSize:14}}>🪢</span>
                <span>{mergedOutfit.belt.name}</span>
                <span style={{marginLeft:"auto",opacity:0.6,fontSize:11}}>matches shoes</span>
              </div>
            )}

            {/* Dual-dial recommendation (Reverso) */}
            {mergedOutfit._recommendedDial && (
              <div style={{
                display:"flex", alignItems:"center", gap:8, padding:"6px 10px",
                borderRadius:8, marginTop:4,
                border:`1px solid ${isDark?"#312e81":"#c7d2fe"}`,
                background:isDark?"#1e1b4b":"#eef2ff", fontSize:12,
                color:isDark?"#a5b4fc":"#4338ca",
              }}>
                <span style={{fontSize:14}}>🔄</span>
                <span style={{fontWeight:600}}>Wear {mergedOutfit._recommendedDial.label}</span>
                <span style={{marginLeft:"auto",opacity:0.7,fontSize:10}}>
                  {mergedOutfit._recommendedDial.side === "B" ? "contrast" : "tonal depth"}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              const slots = ["shirt","sweater","layer","pants","shoes","jacket","belt"];
              const garmentIds = slots.map(s => mergedOutfit[s]?.id).filter(Boolean);
              if (garmentIds.length === 0) return; // never log empty outfits
              // Store slot→id map so diversityBonus + rejectStore can reference it
              const outfitMap = {};
              for (const s of slots) { if (mergedOutfit[s]?.id) outfitMap[s] = mergedOutfit[s].id; }
              // Use upsertEntry (not addEntry) to avoid duplicate rows if TodayPanel already logged today
              const upsertEntry = useHistoryStore.getState().upsertEntry;
              const todayIso = new Date().toISOString().slice(0,10);
              const existingToday = useHistoryStore.getState().entries.find(e => e.date === todayIso);
              const outfitScore = typeof mergedOutfit._score === "number" ? mergedOutfit._score : 7.0;
              upsertEntry({
                id: existingToday?.id ?? `dash-${Date.now()}`,
                date: todayIso,
                watchId: selectedWatch.id,
                garmentIds,
                outfit: outfitMap,
                context: existingToday?.context ?? todayContext ?? null,
                score: outfitScore,
                notes: existingToday?.notes ?? null,
                loggedAt: new Date().toISOString(),
              });
              // Feed style learning — record worn garments so preference weights evolve
              const wornGarments = slots.map(s => mergedOutfit[s]).filter(Boolean);
              if (wornGarments.length > 0) {
                import("../stores/styleLearnStore.js").then(({ useStyleLearnStore }) => {
                  useStyleLearnStore.getState().recordWear(wornGarments);
                }).catch(() => {});
              }
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

          {/* Compact explanation */}
          <div style={{
            fontSize: 12, lineHeight: 1.5, color: isDark ? "#8b93a7" : "#6b7280",
            background: isDark ? "#0f131a" : "#f3f4f6", borderRadius: 8,
            padding: "10px 12px", borderLeft: "3px solid #3b82f6",
            marginBottom: 12, maxHeight: 72, overflow: "hidden",
          }}>
            {explanation}
          </div>

          {/* Inline strap recommendation — not a full panel */}
          {strapRec?.recommended && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
              borderRadius: 8, border: `1px solid ${isDark ? "#2b3140" : "#e5e7eb"}`,
              marginBottom: 12, fontSize: 12,
            }}>
              <span>🔗</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, color: "#3b82f6" }}>Strap: </span>
                <span style={{ color: isDark ? "#a1a9b8" : "#4b5563" }}>
                  {strapRec.recommended.label}
                </span>
                {strapRec.alternatives?.length > 0 && (
                  <span style={{ color: isDark ? "#6b7280" : "#9ca3af", marginLeft: 6, fontSize: 11 }}>
                    · also: {strapRec.alternatives[0].label}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Skip — compact inline */}
          <button onClick={() => setShowRejectModal(true)}
          style={{ fontSize:11, color:isDark?"#4b5563":"#9ca3af", background:"none", border:"none",
                   cursor:"pointer", width:"100%", padding:"4px 0", textAlign:"center", marginBottom: 4 }}>
            ✕ Skip this outfit
          </button>
        </>
      )}

      {/* Rejection reason modal */}
      {showRejectModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center",
        }} onClick={() => setShowRejectModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", maxWidth: 420, background: isDark ? "#171a21" : "#fff",
            borderRadius: "18px 18px 0 0", padding: "18px 16px 24px",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.3)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937", marginBottom: 14 }}>
              Why are you skipping?
            </div>
            {[
              { key: "color", label: "🎨 Colors don't work together" },
              { key: "formality", label: "👔 Wrong formality level" },
              { key: "fit", label: "📐 Something doesn't fit right" },
              { key: "bored", label: "😴 Bored of this combo" },
              { key: "weather", label: "🌡️ Wrong for the weather" },
              { key: "mood", label: "💭 Not my mood today" },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => {
                const garmentIds = ["shirt","sweater","layer","pants","shoes","jacket"]
                  .map(s => mergedOutfit[s]?.id).filter(Boolean);
                if (selectedWatch && garmentIds.length > 0) {
                  addRejection(selectedWatch.id, garmentIds, todayContext ?? null, key);
                }
                setShuffleSeed(s => s + 1);
                setSlotOverrides({});
                setShowRejectModal(false);
              }} style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 12px", marginBottom: 4, borderRadius: 10,
                border: `1px solid ${isDark ? "#2b3140" : "#e5e7eb"}`,
                background: isDark ? "#0f131a" : "#f9fafb",
                color: isDark ? "#e2e8f0" : "#1f2937",
                fontSize: 13, cursor: "pointer",
              }}>{label}</button>
            ))}
            <button onClick={() => {
              setShuffleSeed(s => s + 1);
              setSlotOverrides({});
              setShowRejectModal(false);
            }} style={{
              display: "block", width: "100%", textAlign: "center",
              padding: "8px", marginTop: 8, borderRadius: 8,
              border: "none", background: "transparent",
              color: isDark ? "#6b7280" : "#9ca3af", fontSize: 12, cursor: "pointer",
            }}>Just shuffle (no reason)</button>
          </div>
        </div>
      )}
    </div>
  );
}
