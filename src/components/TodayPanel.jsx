/**
 * TodayPanel — "What I'm wearing today"
 * Pick garments (multi-select from wardrobe + camera/gallery)
 * Pick a watch + strap
 * Log to history
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
import StreakBadge      from "./today/StreakBadge.jsx";
import NeglectedAlert   from "./today/NeglectedAlert.jsx";
import TomorrowPreview  from "./today/TomorrowPreview.jsx";
import LogButton        from "./today/LogButton.jsx";

import SelfiePanel from "./SelfiePanel.jsx";
import OnCallPlanner from "./OnCallPlanner.jsx";

// Live date key — recomputes every render, rolls over at midnight
function useTodayKey() {
  const [key, setKey] = useState(() => new Date().toISOString().split("T")[0]);
  useEffect(() => {
    // Recalculate time until next midnight and reset then
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
  { key: "smart-casual",          label: "Smart Casual" },
  { key: "hospital-smart-casual", label: "Clinic / Hospital" },
  { key: "formal",                label: "Formal" },
  { key: "casual",                label: "Casual" },
  { key: "shift",                 label: "On-Call" },
];
// Normalised to lowercase to match garment.type values (DB stores lowercase)
const GARMENT_PRIORITY = ["shoes", "pants", "shirt", "sweater", "jacket", "coat"];

/** Compute days since a watch was last worn, or null if never */
function daysSinceWorn(watchId, history) {
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < history.length; i++) {
    if (history[i].watchId === watchId) {
      const d = history[i].date;
      if (!d) continue;
      const diff = Math.round((new Date(today) - new Date(d)) / 86400000);
      return diff;
    }
  }
  return null;
}

/** Get top AI-recommended watches for today's context with scores */
function getWatchRecommendations(watches, history, context) {
  if (!watches.length) return [];
  const scored = watches.map(w => ({
    watch: w,
    score: scoreWatchForDay(w, context, history),
    daysSince: daysSinceWorn(w.id, history),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

/** Explain why a watch is recommended */

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

// ── Garment thumbnail ─────────────────────────────────────────────────────────
function GarmentThumb({ g, selected, onClick, isDark }) {
  const border = isDark ? "#2b3140" : "#d1d5db";
  return (
    <div onClick={onClick}
      style={{ position: "relative", cursor: "pointer", borderRadius: 10, overflow: "hidden",
               border: `2px solid ${selected ? "#3b82f6" : border}`,
               background: isDark ? "#0f131a" : "#f3f4f6",
               transition: "border-color 0.12s" }}>
      {(g.thumbnail || g.photoUrl) ? (
        <img src={g.thumbnail || g.photoUrl} alt={g.name}
          style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: "100%", aspectRatio: "3/4", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 4 }}>
          <div style={{ fontSize: 24 }}>👕</div>
          <div style={{ fontSize: 11, color: isDark ? "#6b7280" : "#9ca3af", textAlign: "center", padding: "0 4px" }}>
            {g.name?.slice(0,18)}
          </div>
        </div>
      )}
      {selected && (
        <div style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%",
                      background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "#fff", fontWeight: 700 }}>✓</div>
      )}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,#00000088)",
                    padding: "12px 4px 4px", fontSize: 11, color: "#fff", textAlign: "center", fontWeight: 600 }}>
        {g.type?.toUpperCase()}
      </div>
    </div>
  );
}

export default function TodayPanel() {
  const TODAY_ISO    = useTodayKey();
  const { mode }     = useThemeStore();
  const isDark       = mode === "dark";
  const garments     = useWardrobeStore(s => s.garments);
  const updateGarment = useWardrobeStore(s => s.updateGarment);
  const watches      = useWatchStore(s => s.watches);
  const straps       = useStrapStore(s => s.straps);
  const activeStrap  = useStrapStore(s => s.activeStrap);
  const upsertEntry  = useHistoryStore(s => s.upsertEntry);
  const entries      = useHistoryStore(s => s.entries);

  // Today's logged entries (multiple watches per day supported)
  const todayEntries = useMemo(() => entries.filter(e => e.date === TODAY_ISO), [entries, TODAY_ISO]);
  const todayEntry = todayEntries[todayEntries.length - 1] ?? null; // latest, for form init

  // Rotation intelligence — derived from history only
  const neglected = useMemo(() => neglectedGenuine(watches, entries), [watches, entries]);
  const streak    = useMemo(() => wearStreak(entries), [entries]);

  // Weather must be declared BEFORE useRecommendationEngine which receives it as a prop.
  // Declaring it after caused a TDZ crash in Rollup's minified output (const S used before init).
  const [weather,   setWeather]   = useState(null);

  // Tomorrow preview — logic encapsulated in hook
  const { tomorrowPreview } = useRecommendationEngine({ watches, garments, entries, weather });

  // Default watch: prefer today's already-logged watch, else top recommendation
  const defaultWatchId = useMemo(() => {
    if (todayEntry?.watchId) return todayEntry.watchId;
    const recs = getWatchRecommendations(watches, entries, "smart-casual");
    return recs[0]?.watch?.id ?? watches[0]?.id ?? null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Form state — encapsulated in hook
  const {
    selected, setSelected, toggleGarment,
    watchId,  setWatchId,
    context,  setContext,
    notes,    setNotes,
    extraImgs, setExtraImgs,
    logged,   setLogged,
    filter,   setFilter,
  } = useTodayFormState({ todayEntry, watches, defaultWatchId });

  const cameraRef = useRef();

  useEffect(() => {
    // Delay 3s to avoid geolocation-on-page-load Lighthouse flag.
    // UI renders with tempC=22 default until real weather arrives.
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

  const activeGarments = useMemo(() =>
    garments.filter(g => !g.excludeFromWardrobe && g.type !== "outfit-photo" && g.type !== "outfit-shot"),
    [garments]
  );

  const garmentTypes = useMemo(() => {
    const types = new Set(activeGarments.map(g => (g.type ?? "").toLowerCase()).filter(Boolean));
    return ["all", ...GARMENT_PRIORITY.filter(t => types.has(t)), ...[...types].filter(t => !GARMENT_PRIORITY.includes(t))];
  }, [activeGarments]);

  const visible = filter === "all"
    ? activeGarments
    : activeGarments.filter(g => (g.type ?? "").toLowerCase() === filter);

  const selectedWatch = watches.find(w => w.id === watchId);
  const watchStraps   = Object.values(straps).filter(s => s.watchId === watchId);
  const activeStrapId = activeStrap[watchId];
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
    // Per-watch entry: same watch on same day = update, different watch = new entry
    const entryId = `wear-${TODAY_ISO}-${watchId}`;
    const entry = {
      id: entryId,
      date: TODAY_ISO,
      watchId,
      strapId: activeStrapId ?? null,
      strapLabel: activeStrapObj?.label ?? null,
      garmentIds: [...selected],
      context,
      notes: notes.trim() || null,
      outfitPhoto: extraImgs[0] ?? null,
      outfitPhotos: extraImgs.length ? extraImgs : null,
      loggedAt: new Date().toISOString(),
    };
    upsertEntry(entry);

    // Update lastWorn on each worn garment
    const wornIds = [...selected];
    wornIds.forEach(id => updateGarment(id, { lastWorn: TODAY_ISO }));

    // Style learning — writes to the store that scoreGarment actually reads from.
    // Previously wrote to prefStore which was siloed from scoring (scoreGarment
    // reads useStyleLearnStore). The wear→learn→score loop was broken.
    try {
      const { useStyleLearnStore } = await import("../stores/styleLearnStore.js");
      const wornG = garments.filter(g => selected.has(g.id));
      useStyleLearnStore.getState().recordWear(wornG);
    } catch(_) {}

    setLogged(true);
  }, [watchId, activeStrapId, activeStrapObj, selected, context, notes, extraImgs,
      upsertEntry, updateGarment, garments, todayEntry, TODAY_ISO]);

  // ── Summary card when already logged ────────────────────────────────────────
  if (logged && todayEntries.length > 0) {
    return (
      <div style={{ padding: "0 0 80px" }}>
        <div style={{ background: card, borderRadius: 16, border: `1px solid ${border}`, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: text, marginBottom: 4 }}>
            Today ✅ {todayEntries.length > 1 && <span style={{ fontSize: 13, fontWeight: 600, color: muted }}>· {todayEntries.length} watches</span>}
          </div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>{TODAY_ISO}</div>

          {todayEntries.map((te, teIdx) => {
            const watch = watches.find(w => w.id === te.watchId);
            const wornGarments = garments.filter(g => (te.garmentIds ?? []).includes(g.id));
            const slotLabel = te.timeSlot
              ? { morning: "\u{1F305} Morning", afternoon: "\u2600\uFE0F Afternoon", evening: "\u{1F306} Evening", night: "\u{1F319} Night" }[te.timeSlot]
              : null;
            return (
              <div key={te.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${border}` }}>
                {(slotLabel || todayEntries.length > 1) && (
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6,
                                color: te.timeSlot ? "#3b82f6" : "#22c55e" }}>
                    {slotLabel ?? (teIdx === 0 ? "Primary" : `Outfit ${teIdx + 1}`)}
                  </div>
                )}
                {watch && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10,
                                padding: "10px 14px", borderRadius: 10, background: isDark ? "#0f131a" : "#f3f4f6",
                                border: `1px solid ${border}` }}>
                    <div style={{ fontSize: 28 }}>{watch.emoji ?? "⌚"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{watch.brand} {watch.model}</div>
                      <div style={{ fontSize: 11, color: muted }}>
                        {te.strapLabel ?? watch.dial + " dial"} · {te.context ?? "smart-casual"}
                      </div>
                    </div>
                  </div>
                )}
                {wornGarments.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(80px,1fr))", gap: 8 }}>
                    {wornGarments.map(g => (
                      <div key={g.id} style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${border}` }}>
                        {(g.thumbnail || g.photoUrl) ? (
                          <img src={g.thumbnail || g.photoUrl} alt={g.name ?? g.color ?? ""} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: "100%", aspectRatio: "3/4", display: "flex", alignItems: "center",
                                        justifyContent: "center", background: isDark ? "#0f131a" : "#f3f4f6", fontSize: 20 }}>👕</div>
                        )}
                        <div style={{ padding: "2px 4px", fontSize: 11, color: muted, textAlign: "center" }}>{g.name?.slice(0,14)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {(te.outfitPhotos?.length || te.outfitPhoto) && (
                  <div style={{ marginTop: 8, display: "grid",
                                gridTemplateColumns: (te.outfitPhotos?.length ?? 1) > 1 ? "repeat(2, 1fr)" : "1fr", gap: 6 }}>
                    {(te.outfitPhotos ?? (te.outfitPhoto ? [te.outfitPhoto] : [])).map((src, i) => (
                      <img key={i} src={src} alt={`outfit ${i + 1}`}
                        style={{ width: "100%", borderRadius: 10, objectFit: "cover", maxHeight: 300, display: "block" }} />
                    ))}
                  </div>
                )}
                {te.notes && (
                  <div style={{ marginTop: 8, fontSize: 12, color: muted, fontStyle: "italic" }}>{te.notes}</div>
                )}
              </div>
            );
          })}
        </div>

        <SelfiePanel context={todayEntry?.context ?? "smart-casual"} watchId={todayEntry?.watchId ?? null} />

        {/* Quick watch check-in — adds a NEW entry, doesn't overwrite */}
        <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", textTransform: "uppercase",
                        letterSpacing: "0.06em", marginBottom: 10 }}>
            ⌚ Log another watch
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
            {watches.filter(w => !todayEntries.some(te => te.watchId === w.id)).slice(0, 8).map(w => {
              const strapObj = activeStrap[w.id] && straps[activeStrap[w.id]];
              return (
                <button key={w.id}
                  onClick={() => {
                    upsertEntry({
                      id: `wear-${TODAY_ISO}-${w.id}`,
                      date: TODAY_ISO,
                      watchId: w.id,
                      garmentIds: [],
                      quickLog: true,
                      context: "smart-casual",
                      strapId: activeStrap[w.id] ?? null,
                      strapLabel: strapObj?.label ?? null,
                      loggedAt: new Date().toISOString(),
                    });
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                           borderRadius: 8, border: `1px solid ${border}`, background: isDark ? "#0f131a" : "#f9fafb",
                           color: text, fontSize: 11, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{w.emoji ?? "⌚"}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {w.model}
                    </div>
                    <div style={{ fontSize: 10, color: muted }}>
                      {w.replica ? "replica" : "genuine"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {watches.length > todayEntries.length + 8 && (
            <button
              onClick={() => { setLogged(false); }}
              style={{ marginTop: 8, fontSize: 11, color: "#3b82f6", background: "none", border: "none", cursor: "pointer" }}>
              Show all {watches.length} watches →
            </button>
          )}
        </div>

        <button onClick={() => {
          // Reload form state from the latest logged entry before switching to edit mode
          if (todayEntry) {
            setSelected(new Set(todayEntry.garmentIds ?? []));
            setWatchId(todayEntry.watchId ?? watches[0]?.id ?? null);
            setContext(todayEntry.context ?? "smart-casual");
            setNotes(todayEntry.notes ?? "");
            setExtraImgs(todayEntry.outfitPhotos ?? (todayEntry.outfitPhoto ? [todayEntry.outfitPhoto] : []));
          }
          setLogged(false);
        }} style={{ width: "100%", padding: "12px 0", borderRadius: 10,
          border: `1px solid ${border}`, background: "transparent", color: muted, fontSize: 13, cursor: "pointer" }}>
          Edit today's log
        </button>
      </div>
    );
  }

  // ── Build ────────────────────────────────────────────────────────────────────
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
            <button key={c.key} onClick={() => setContext(c.key)}
              style={{ padding: "6px 12px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 600,
                       cursor: "pointer",
                       background: context === c.key ? "#3b82f6" : (isDark ? "#1a1f2b" : "#f3f4f6"),
                       color: context === c.key ? "#fff" : muted }}>{c.label}</button>
          ))}
        </div>
      </div>

      {/* OnCall Planner — shown when shift context selected */}
      {context === "shift" && (
        <div style={{ background: card, borderRadius: 14, border: "1px solid #f9731640", padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f97316", textTransform: "uppercase",
                        letterSpacing: "0.06em", marginBottom: 12 }}>🏥 On-Call Planner</div>
          <OnCallPlanner isDark={isDark} />
        </div>
      )}

      {/* Watch picker */}
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: "uppercase",
                      letterSpacing: "0.06em", marginBottom: 10 }}>Watch</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {watches.map(w => {
            const dsw = daysSinceWorn(w.id, entries);
            return (
            <div key={w.id} onClick={() => setWatchId(w.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10,
                       border: `2px solid ${watchId === w.id ? "#3b82f6" : border}`, cursor: "pointer",
                       background: watchId === w.id ? (isDark ? "#0c1f3f" : "#eff6ff") : "transparent" }}>
              <div style={{ fontSize: 22 }}>{w.emoji ?? "\u231A"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{w.brand} {w.model}</div>
                <div style={{ fontSize: 11, color: muted }}>{w.dualDial ? `${w.dualDial.sideA}/${w.dualDial.sideB}` : w.dial} dial{w.replica ? " \u00B7 replica" : " \u00B7 genuine"}</div>
              </div>
              {dsw !== null && (
                <div style={{ fontSize: 10, fontWeight: 600, color: dsw >= 7 ? "#22c55e" : dsw <= 2 ? "#ef4444" : muted }}>
                  {dsw === 0 ? "today" : `${dsw}d`}
                </div>
              )}
              {watchId === w.id && <div style={{ color: "#3b82f6", fontWeight: 700, fontSize: 16 }}>{"\u2713"}</div>}
            </div>
            );
          })}
        </div>

        {/* Strap picker for selected watch */}
        {watchStraps.length > 0 && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${border}`, paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: muted, fontWeight: 600, marginBottom: 8 }}>STRAP</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {watchStraps.map(s => (
                <button key={s.id}
                  onClick={() => useStrapStore.getState().setActiveStrap(watchId, s.id)}
                  style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${activeStrapId === s.id ? "#3b82f6" : border}`,
                           background: activeStrapId === s.id ? "#3b82f622" : "transparent",
                           color: activeStrapId === s.id ? "#3b82f6" : muted,
                           fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Garments {selected.size > 0 && <span style={{ color: "#3b82f6" }}>({selected.size})</span>}
          </div>
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())}
              style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}>
              Clear all
            </button>
          )}
        </div>

        {/* Type filter */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 4 }}>
          {garmentTypes.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              style={{ padding: "4px 10px", borderRadius: 14, border: "none", fontSize: 11, fontWeight: 600,
                       whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0,
                       background: filter === t ? "#3b82f6" : (isDark ? "#1a1f2b" : "#f3f4f6"),
                       color: filter === t ? "#fff" : muted }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(88px,1fr))", gap: 8 }}>
          {visible.map(g => (
            <GarmentThumb key={g.id} g={g} selected={selected.has(g.id)}
              onClick={() => toggleGarment(g.id)} isDark={isDark} />
          ))}
        </div>
      </div>

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

      {/* Rotation nudge — neglected genuine + streak */}
      {!logged && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <NeglectedAlert neglected={neglected} watchId={watchId} onSelect={setWatchId} />
          <StreakBadge streak={streak} />
        </div>
      )}

      {/* Tomorrow Preview */}
      {!logged && <TomorrowPreview preview={tomorrowPreview} />}

      {/* Log button */}
      <LogButton onLog={handleLog} disabled={!watchId} />
    </div>
  );
}
