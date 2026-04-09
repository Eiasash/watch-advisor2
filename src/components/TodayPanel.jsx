/**
 * TodayPanel — "What I'm wearing today"
 * Thin orchestrator: state + data wiring only.
 * UI is split across src/components/today/ sub-components.
 */
import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore }    from "../stores/watchStore.js";
import { useStrapStore }    from "../stores/strapStore.js";
import { useHistoryStore }  from "../stores/historyStore.js";
import { useThemeStore }    from "../stores/themeStore.js";
import { scoreWatchForDay } from "../engine/dayProfile.js";
import { fetchWeather }     from "../weather/weatherService.js";
import { neglectedGenuine, wearStreak } from "../domain/rotationStats.js";
import { useRecommendationEngine } from "../hooks/useRecommendationEngine.js";
import { useTodayFormState }       from "../hooks/useTodayFormState.js";

import WatchPicker, { daysSinceWorn } from "./today/WatchPicker.jsx";
import GarmentPicker    from "./today/GarmentPicker.jsx";
import RotationNudges   from "./today/RotationNudges.jsx";
import LoggedSummary    from "./today/LoggedSummary.jsx";
import StreakBadge      from "./today/StreakBadge.jsx";
import NeglectedAlert   from "./today/NeglectedAlert.jsx";
import TomorrowPreview  from "./today/TomorrowPreview.jsx";
import LogButton        from "./today/LogButton.jsx";
import NeverWornSpotlight from "./today/NeverWornSpotlight.jsx";
import SeasonalTransition from "./today/SeasonalTransition.jsx";
import LastWornWithWatch from "./today/LastWornWithWatch.jsx";
import StrapSuggestion  from "./today/StrapSuggestion.jsx";
import QuickStrapSwap   from "./today/QuickStrapSwap.jsx";
import NeglectedWatchNudge from "./today/NeglectedWatchNudge.jsx";
import TailorCountdown  from "./today/TailorCountdown.jsx";
import { getTailorPickupDate } from "../config/tailorConfig.js";

import SelfiePanel  from "./SelfiePanel.jsx";
import OnCallPlanner from "./OnCallPlanner.jsx";
import ClaudePick   from "./ClaudePick.jsx";

// Live date key — recomputes every render, rolls over at midnight
function useTodayKey() {
  const [key, setKey] = useState(() => new Date().toISOString().split("T")[0]);
  useEffect(() => {
    function scheduleRollover() {
      const now = new Date();
      const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
      const t = setTimeout(() => {
        setKey(new Date().toISOString().split("T")[0]);
        scheduleRollover();
      }, msUntilMidnight + 100);
      return t;
    }
    const t = scheduleRollover();
    return () => clearTimeout(t);
  }, []);
  return key;
}

const CONTEXT_OPTIONS = [
  { key: null,            label: "Any" },
  { key: "clinic",       label: "Clinic" },
  { key: "casual",       label: "Casual" },
  { key: "date-night",   label: "Date Night" },
  { key: "shift",        label: "On-Call" },
];

/** Get top AI-recommended watches for today's context with scores */
function getWatchRecommendations(watches, history, context) {
  if (!watches.length) return [];
  const active = watches.filter(w => !w.retired);
  const scored = active.map(w => ({
    watch: w,
    score: scoreWatchForDay(w, context, history),
    daysSince: daysSinceWorn(w.id, history),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

function resizeImage(file, maxPx = 480) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        c.width  = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function TodayPanel() {
  const TODAY_ISO    = useTodayKey();
  const { mode }     = useThemeStore();
  const isDark       = mode === "dark";
  const garments     = useWardrobeStore(s => s.garments) ?? [];
  const updateGarment = useWardrobeStore(s => s.updateGarment);
  const watches      = useWatchStore(s => s.watches) ?? [];
  const straps       = useStrapStore(s => s.straps) ?? {};
  const activeStrap  = useStrapStore(s => s.activeStrap) ?? {};
  const upsertEntry  = useHistoryStore(s => s.upsertEntry);
  const removeEntry  = useHistoryStore(s => s.removeEntry);
  const entries      = useHistoryStore(s => s.entries) ?? [];

  const todayEntries = useMemo(() => entries.filter(e => e.date === TODAY_ISO), [entries, TODAY_ISO]);
  const todayEntry = todayEntries[todayEntries.length - 1] ?? null;

  const neglected = useMemo(() => neglectedGenuine(watches, entries), [watches, entries]);
  const streak    = useMemo(() => wearStreak(entries), [entries]);

  // Weather must be declared BEFORE useRecommendationEngine (avoids TDZ crash in minified output).
  const [weather, setWeather] = useState(null);

  const { tomorrowPreview } = useRecommendationEngine({ watches, garments, entries, weather });

  const defaultWatchId = useMemo(() => {
    if (todayEntry?.watchId) return todayEntry.watchId;
    const recs = getWatchRecommendations(watches, entries, null);
    return recs[0]?.watch?.id ?? watches.find(w => !w.retired)?.id ?? null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    selected, setSelected, toggleGarment,
    watchId,  setWatchId,
    context,  setContext,
    notes,    setNotes,
    extraImgs, setExtraImgs,
    logged,   setLogged,
    filter,   setFilter,
  } = useTodayFormState({ todayEntry, watches, defaultWatchId });

  const [outfitScore, setOutfitScore] = useState(null);
  const cameraRef = useRef();

  useEffect(() => {
    // Delay 3s to avoid geolocation-on-page-load Lighthouse flag.
    const t = setTimeout(() => {
      fetchWeather().then(setWeather).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  const bg     = isDark ? "#101114" : "#f9fafb";
  const card   = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const muted  = isDark ? "#8b93a7" : "#9ca3af";

  const active         = watches.filter(w => !w.retired);
  const selectedWatch  = watches.find(w => w.id === watchId);
  const watchStraps    = Object.values(straps).filter(s => s.watchId === watchId);
  const activeStrapId  = activeStrap[watchId];
  const activeStrapObj = activeStrapId ? straps[activeStrapId] : null;

  const handleCamera = useCallback(async (e) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const thumbs = await Promise.all(files.map(f => resizeImage(f, 600)));
    setExtraImgs(prev => [...prev, ...thumbs]);
    e.target.value = "";
  }, []);

  const handleLog = useCallback(async () => {
    if (!watchId) return;
    if (selected.size < 2) return;
    if (!context) return;
    const entryId = `wear-${TODAY_ISO}-${watchId}`;
    const entry = {
      id: entryId,
      date: TODAY_ISO,
      watchId,
      strapId: activeStrapId ?? null,
      strapLabel: activeStrapObj?.label ?? null,
      garmentIds: [...selected],
      context,
      score: typeof outfitScore === "number" ? outfitScore : 7.0,
      watch: selectedWatch ? `${selectedWatch.brand} ${selectedWatch.model}` : null,
      notes: notes.trim() || null,
      outfitPhoto: extraImgs[0] ?? null,
      outfitPhotos: extraImgs.length ? extraImgs : null,
      loggedAt: new Date().toISOString(),
    };
    upsertEntry(entry);

    const wornIds = [...selected];
    wornIds.forEach(id => updateGarment(id, { lastWorn: TODAY_ISO }));

    // Style learning — writes to the store that scoreGarment reads from.
    try {
      const { useStyleLearnStore } = await import("../stores/styleLearnStore.js");
      const wornG = garments.filter(g => selected.has(g.id));
      useStyleLearnStore.getState().recordWear(wornG);
    } catch(_) {}

    if (activeStrapId) {
      try {
        useStrapStore.getState().incrementWearCount(activeStrapId);
      } catch (_) {}
    }

    setLogged(true);
  }, [watchId, activeStrapId, activeStrapObj, selected, context, notes, extraImgs,
      outfitScore, selectedWatch, upsertEntry, updateGarment, garments, todayEntry, TODAY_ISO]);

  // ── Already logged ───────────────────────────────────────────────────────────
  if (logged && todayEntries.length > 0) {
    return (
      <LoggedSummary
        todayEntries={todayEntries}
        todayEntry={todayEntry}
        watches={watches}
        garments={garments}
        weather={weather}
        straps={straps}
        activeStrap={activeStrap}
        upsertEntry={upsertEntry}
        removeEntry={removeEntry}
        context={context}
        setSelected={setSelected}
        setWatchId={setWatchId}
        setContext={setContext}
        setNotes={setNotes}
        setExtraImgs={setExtraImgs}
        setLogged={setLogged}
        isDark={isDark}
        card={card}
        border={border}
        text={text}
        muted={muted}
        TODAY_ISO={TODAY_ISO}
      />
    );
  }

  // ── Pre-log form ─────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: text, marginBottom: 4 }}>Today</div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>{TODAY_ISO} — What are you wearing?</div>

      {/* Context */}
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: "uppercase",
                      letterSpacing: "0.06em", marginBottom: 10 }}>Context</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CONTEXT_OPTIONS.map(c => (
            <button key={c.key ?? "__any"} onClick={() => setContext(c.key)}
              style={{ padding: "6px 12px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 600,
                       cursor: "pointer",
                       background: context === c.key ? "#3b82f6" : (isDark ? "#1a1f2b" : "#f3f4f6"),
                       color: context === c.key ? "#fff" : muted }}>{c.label}</button>
          ))}
        </div>
      </div>

      {/* Never Worn Spotlight + Seasonal Transition */}
      <NeverWornSpotlight
        garments={garments}
        history={entries}
        isDark={isDark}
        onSelect={(id) => setSelected(prev => new Set([...prev, id]))}
      />
      <SeasonalTransition garments={garments} isDark={isDark} />
      <TailorCountdown garments={garments} isDark={isDark} pickupDate={getTailorPickupDate()} />

      {/* OnCall Planner — shown when shift context selected */}
      {context === "shift" && (
        <div style={{ background: card, borderRadius: 14, border: "1px solid #f9731640", padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f97316", textTransform: "uppercase",
                        letterSpacing: "0.06em", marginBottom: 12 }}>🏥 On-Call Planner</div>
          <OnCallPlanner isDark={isDark} />
        </div>
      )}

      {/* Watch + strap picker */}
      <WatchPicker
        watches={active}
        watchId={watchId}
        onSelectWatch={setWatchId}
        entries={entries}
        straps={straps}
        activeStrap={activeStrap}
        isDark={isDark}
        card={card}
        border={border}
        text={text}
        muted={muted}
      />

      {/* Last worn with this watch + strap suggestion */}
      {watchId && !logged && (
        <>
          <LastWornWithWatch watchId={watchId} history={entries} garments={garments} isDark={isDark} />
          <StrapSuggestion watchId={watchId} watches={watches} straps={straps} weather={weather} context={context} isDark={isDark} />
          {watchId && <QuickStrapSwap watchId={watchId} isDark={isDark} />}
        </>
      )}

      {/* Quick watch check-in — one tap, no garments needed */}
      {watchId && !logged && (
        <button
          onClick={() => {
            const entryId = todayEntry?.id ?? `today-${Date.now()}`;
            upsertEntry({
              id: entryId,
              date: TODAY_ISO,
              watchId,
              strapId: activeStrapId ?? null,
              strapLabel: activeStrapObj?.label ?? null,
              garmentIds: todayEntry?.garmentIds ?? [],
              quickLog: !(todayEntry?.garmentIds?.length > 0),
              context,
              notes: todayEntry?.notes ?? null,
              outfitPhoto: todayEntry?.outfitPhoto ?? null,
              outfitPhotos: todayEntry?.outfitPhotos ?? null,
              loggedAt: new Date().toISOString(),
            });
            setLogged(true);
          }}
          style={{
            width: "100%", marginBottom: 14, padding: "12px 0", borderRadius: 10,
            border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            color: "#fff",
            boxShadow: "0 2px 8px #3b82f633",
          }}
        >
          ⌚ Check In — {watches.find(w => w.id === watchId)?.model ?? "Watch"}
        </button>
      )}

      {/* Garment picker */}
      <GarmentPicker
        garments={garments}
        selected={selected}
        toggleGarment={toggleGarment}
        onClearAll={() => setSelected(new Set())}
        filter={filter}
        setFilter={setFilter}
        isDark={isDark}
        card={card}
        border={border}
        muted={muted}
      />

      {/* Outfit photo */}
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: "uppercase",
                      letterSpacing: "0.06em", marginBottom: 10 }}>
          Outfit Photos (optional){extraImgs.length > 0 && <span style={{ color: "#3b82f6", marginLeft: 6 }}>{extraImgs.length}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: extraImgs.length ? 10 : 0 }}>
          <label style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px dashed ${border}`,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          cursor: "pointer", color: muted, fontSize: 13 }}>
            📁 Gallery
            <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleCamera} />
          </label>
          <label style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px dashed ${border}`,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          cursor: "pointer", color: muted, fontSize: 13 }}>
            📷 Camera
            <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleCamera} />
          </label>
        </div>
        {extraImgs.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
            {extraImgs.map((src, i) => (
              <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "1/1" }}>
                <img src={src} alt={`outfit ${i + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <button onClick={() => setExtraImgs(prev => prev.filter((_, j) => j !== i))}
                  style={{ position: "absolute", top: 4, right: 4, background: "#ef4444", color: "#fff",
                           border: "none", borderRadius: "50%", width: 20, height: 20,
                           fontSize: 11, cursor: "pointer", lineHeight: 1, display: "flex",
                           alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 20 }}>
        <textarea placeholder="Notes (optional)…" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          style={{ width: "100%", background: "transparent", border: "none", outline: "none",
                   color: text, fontSize: 13, resize: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
      </div>

      {/* Rotation nudges — neglected genuine + streak */}
      {!logged && (
        <RotationNudges
          watches={watches}
          history={entries}
          neglected={neglected}
          streak={streak}
          currentWatchId={watchId}
          onSelectWatch={setWatchId}
          isDark={isDark}
        />
      )}

      {/* Tomorrow Preview */}
      {!logged && <TomorrowPreview preview={tomorrowPreview} />}

      {/* Outfit Score — required 1-tap rating */}
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${outfitScore == null ? "#f59e0b" : border}`, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: outfitScore == null ? "#f59e0b" : muted, textTransform: "uppercase",
                      letterSpacing: "0.06em", marginBottom: 8 }}>{outfitScore == null ? "⚡ Rate this outfit to log" : "Rate this outfit"}</div>
        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
          {[5, 6, 7, 8, 9, 10].map(s => (
            <button key={s} onClick={() => setOutfitScore(s)}
              style={{
                width: 40, height: 36, borderRadius: 8, border: "none", fontSize: 14, fontWeight: 700,
                cursor: "pointer",
                background: outfitScore === s ? "#3b82f6" : (isDark ? "#1a1f2b" : "#f3f4f6"),
                color: outfitScore === s ? "#fff" : muted,
              }}>{s}</button>
          ))}
        </div>
      </div>

      {/* Strap warning */}
      {watchId && !activeStrapId && (
        <div style={{ fontSize: 11, color: "#f59e0b", textAlign: "center", marginBottom: 8 }}>
          ⚠️ No strap selected — tap the watch above to pick a strap for better tracking
        </div>
      )}

      {/* Validation errors */}
      {watchId && selected.size === 0 && (
        <div style={{ fontSize: 11, color: "#ef4444", textAlign: "center", marginBottom: 8, fontWeight: 600 }}>
          Add at least 2 garments (not counting watch) to log an outfit
        </div>
      )}
      {watchId && selected.size === 1 && (
        <div style={{ fontSize: 11, color: "#ef4444", textAlign: "center", marginBottom: 8, fontWeight: 600 }}>
          Add at least 2 garments (not counting watch) to log an outfit
        </div>
      )}
      {watchId && selected.size > 0 && !context && (
        <div style={{ fontSize: 11, color: "#ef4444", textAlign: "center", marginBottom: 8, fontWeight: 600 }}>
          Select a context before logging
        </div>
      )}

      <LogButton onLog={handleLog} disabled={!watchId || selected.size < 2 || !context} />
    </div>
  );
}
