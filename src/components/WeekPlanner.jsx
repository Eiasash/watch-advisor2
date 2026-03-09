import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useStrapStore }   from "../stores/strapStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { genWeekRotation } from "../engine/weekRotation.js";
import { buildOutfit } from "../outfitEngine/outfitBuilder.js";
import { generateOutfit } from "../engine/outfitEngine.js";
import { setCachedState } from "../services/localCache.js";
import { fetchWeatherForecast, getLayerRecommendation } from "../weather/weatherService.js";

const CONTEXTS = [
  { key:"smart-casual",            label:"Smart Casual" },
  { key:"hospital-smart-casual",   label:"Clinic/Hospital" },
  { key:"formal",                  label:"Formal" },
  { key:"casual",                  label:"Casual" },
  { key:"shift",                   label:"On-Call Shift" },
];

const OUTFIT_SLOTS = ["shirt", "sweater", "layer", "pants", "shoes", "jacket"];
const SLOT_ICONS = { shirt:"\u{1F454}", sweater:"\u{1FAA2}", layer:"\u{1F9E3}", pants:"\u{1F456}", shoes:"\u{1F45F}", jacket:"\u{1F9E5}" };
const ACCESSORY_TYPES = new Set(["belt","sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);

const WEATHER_ICONS = {
  "Clear sky": "\u2600\uFE0F",
  "Partly cloudy": "\u26C5",
  "Foggy": "\u{1F32B}\uFE0F",
  "Rain": "\u{1F327}\uFE0F",
  "Snow": "\u{1F328}\uFE0F",
  "Thunderstorm": "\u26C8\uFE0F",
};

/** Compute days since a watch was last worn */
function daysSinceWorn(watchId, history) {
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < history.length; i++) {
    if (history[i].watchId === watchId) {
      const d = history[i].date;
      if (!d) continue;
      return Math.round((new Date(today) - new Date(d)) / 86400000);
    }
  }
  return null;
}

function WatchMini({ watch, label, isDark, isOnCall, daysSince }) {
  if (!watch) return <div style={{ color:"#4b5563", fontSize:12, fontStyle:"italic" }}>No watches</div>;
  const accent = isOnCall ? "#f97316" : "#3b82f6";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{
        width:36, height:36, borderRadius:"50%", flexShrink:0,
        background:`radial-gradient(circle at 35% 35%, ${accent}44, ${accent}11)`,
        border:`2px solid ${accent}55`,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:16,
      }}>
        {watch.emoji ?? "\u231A"}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:11, fontWeight:700, color:isDark?"#e2e8f0":"#111827", lineHeight:1.2 }}>
          {watch.brand ?? ""} {watch.model ?? watch.name ?? "Watch"}
        </div>
        <div style={{ fontSize:10, color:isDark?"#6b7280":"#9ca3af" }}>
          {watch.dial ?? ""} dial
          {label && <span style={{ color:accent, marginLeft:4 }}>{label}</span>}
        </div>
      </div>
      {daysSince !== undefined && daysSince !== null && (
        <div style={{ fontSize:10, fontWeight:700, flexShrink:0,
                      color: daysSince >= 7 ? "#22c55e" : daysSince <= 2 ? "#ef4444" : (isDark?"#6b7280":"#9ca3af") }}>
          {daysSince === 0 ? "today" : `${daysSince}d`}
        </div>
      )}
    </div>
  );
}

/** Rotation insights: variety score + most/least worn */
function RotationInsights({ rotation, history, isDark }) {
  if (!rotation.length) return null;
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const sub = isDark ? "#6b7280" : "#9ca3af";

  // Count unique watches in the 7-day plan
  const weekWatchIds = new Set(rotation.map(d => d.watch?.id).filter(Boolean));
  const varietyScore = weekWatchIds.size;

  // Wear frequency in last 30 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const recentHistory = history.filter(e => e.date >= cutoffIso && e.watchId);
  const wearCounts = {};
  for (const e of recentHistory) {
    wearCounts[e.watchId] = (wearCounts[e.watchId] ?? 0) + 1;
  }

  // Most and least worn from the week's watches
  const weekWatches = rotation.map(d => d.watch).filter(Boolean);
  const uniqueWeek = [...new Map(weekWatches.map(w => [w.id, w])).values()];
  let mostWorn = null, leastWorn = null;
  for (const w of uniqueWeek) {
    const c = wearCounts[w.id] ?? 0;
    if (!mostWorn || c > (wearCounts[mostWorn.id] ?? 0)) mostWorn = w;
    if (!leastWorn || c < (wearCounts[leastWorn.id] ?? 0)) leastWorn = w;
  }

  // Style streak detection: same watch style 3+ consecutive days
  let streak = 1, maxStreak = 1, streakStyle = null;
  for (let i = 1; i < rotation.length; i++) {
    if (rotation[i].watch?.style && rotation[i].watch?.style === rotation[i - 1].watch?.style) {
      streak++;
      if (streak > maxStreak) { maxStreak = streak; streakStyle = rotation[i].watch.style; }
    } else {
      streak = 1;
    }
  }

  return (
    <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
      <div style={{ padding:"6px 12px", borderRadius:8, background:isDark?"#0f131a":"#f3f4f6",
                    border:`1px solid ${border}`, fontSize:11, color:text }}>
        <span style={{ fontWeight:700, color: varietyScore >= 5 ? "#22c55e" : varietyScore >= 3 ? "#f59e0b" : "#ef4444" }}>
          {varietyScore}
        </span>
        <span style={{ color:sub }}> unique watches this week</span>
      </div>
      {mostWorn && (wearCounts[mostWorn.id] ?? 0) > 0 && (
        <div style={{ padding:"6px 12px", borderRadius:8, background:isDark?"#0f131a":"#f3f4f6",
                      border:`1px solid ${border}`, fontSize:11, color:sub }}>
          Most worn: <span style={{ fontWeight:700, color:text }}>{mostWorn.model}</span> ({wearCounts[mostWorn.id] ?? 0}x/30d)
        </div>
      )}
      {leastWorn && leastWorn.id !== mostWorn?.id && (
        <div style={{ padding:"6px 12px", borderRadius:8, background:isDark?"#0f131a":"#f3f4f6",
                      border:`1px solid ${border}`, fontSize:11, color:sub }}>
          Rested: <span style={{ fontWeight:700, color:"#22c55e" }}>{leastWorn.model}</span> ({wearCounts[leastWorn.id] ?? 0}x/30d)
        </div>
      )}
      {maxStreak >= 3 && (
        <div style={{ padding:"6px 12px", borderRadius:8, background:"#7f1d1d22",
                      border:"1px solid #ef444444", fontSize:11, color:"#ef4444" }}>
          {"\u26A0"} {streakStyle} streak: {maxStreak} days in a row
        </div>
      )}
    </div>
  );
}

// ── Photo Lightbox — full-screen zoom on tap ────────────────────────────────
function PhotoLightbox({ src, alt, onClose }) {
  if (!src) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, cursor: "zoom-out",
      }}
    >
      <img
        src={src}
        alt={alt ?? ""}
        style={{
          maxWidth: "92vw", maxHeight: "85vh",
          borderRadius: 12, objectFit: "contain",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
        }}
      />
      <div style={{
        position: "absolute", top: 16, right: 20,
        color: "#fff", fontSize: 28, fontWeight: 300,
        cursor: "pointer", lineHeight: 1,
        padding: "4px 10px",
      }}>{"\u00D7"}</div>
      {alt && (
        <div style={{
          position: "absolute", bottom: 24, left: 0, right: 0, textAlign: "center",
          color: "#e2e8f0", fontSize: 14, fontWeight: 600,
          textShadow: "0 1px 4px rgba(0,0,0,0.7)",
        }}>{alt}</div>
      )}
    </div>
  );
}

// ── Outfit Slot Chip — tap to swap garment, long-press photo to zoom ────────
function OutfitSlotChip({ slot, garment, isDark, border, onSwap, candidates }) {
  const [open, setOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const icon = SLOT_ICONS[slot] ?? "\u2022";
  const sub = isDark ? "#6b7280" : "#9ca3af";
  const photo = garment?.thumbnail || garment?.photoUrl;

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => candidates.length > 0 && setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 10px", borderRadius: 8,
          border: `1px solid ${border}`,
          background: isDark ? "#0f131a" : "#f9fafb",
          cursor: candidates.length > 0 ? "pointer" : "default",
          minHeight: 36,
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt={garment.name ?? ""}
            onClick={e => { e.stopPropagation(); setLightbox({ src: photo, alt: `${garment.color ?? ""} ${garment.type ?? ""}`.trim() }); }}
            style={{ width: 28, height: 28, borderRadius: 5, objectFit: "cover", cursor: "zoom-in" }}
          />
        ) : (
          <span style={{ fontSize: 16, width: 28, textAlign: "center" }}>{icon}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: sub, textTransform: "uppercase", letterSpacing: "0.06em" }}>{slot}</div>
          {garment ? (
            <div style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#e2e8f0" : "#1f2937",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {garment.color} {garment.type}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: sub, fontStyle: "italic" }}>None</div>
          )}
        </div>
        {candidates.length > 0 && (
          <span style={{ fontSize: 10, color: sub }}>{open ? "\u25B2" : "\u25BC"}</span>
        )}
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          maxHeight: 180, overflowY: "auto",
          background: isDark ? "#171a21" : "#fff",
          border: `1px solid ${border}`, borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}>
          {candidates.map(c => {
            const cPhoto = c.thumbnail || c.photoUrl;
            return (
              <div key={c.id}
                onClick={() => { onSwap(slot, c); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", cursor: "pointer",
                  background: c.id === garment?.id ? (isDark ? "#0c1f3f" : "#eff6ff") : "transparent",
                  borderBottom: `1px solid ${isDark ? "#2b3140" : "#e5e7eb"}`,
                }}
              >
                {cPhoto ? (
                  <img
                    src={cPhoto}
                    alt={c.name ?? ""}
                    onClick={e => { e.stopPropagation(); setLightbox({ src: cPhoto, alt: `${c.color ?? ""} ${c.type ?? ""}`.trim() }); }}
                    style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover", cursor: "zoom-in" }}
                  />
                ) : (
                  <span style={{ fontSize: 14, width: 24, textAlign: "center" }}>{icon}</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#e2e8f0" : "#1f2937",
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.color} {c.type}
                  </div>
                  {c.brand && <div style={{ fontSize: 10, color: sub }}>{c.brand}</div>}
                </div>
                {c.id === garment?.id && <span style={{ color: "#3b82f6", fontWeight: 700, fontSize: 12 }}>{"\u2713"}</span>}
              </div>
            );
          })}
        </div>
      )}
      {lightbox && <PhotoLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
    </div>
  );
}

// ── Weather Badge ───────────────────────────────────────────────────────────
function WeatherBadge({ forecast, isDark }) {
  if (!forecast) return null;
  const icon = WEATHER_ICONS[forecast.description] ?? "\u{1F321}\uFE0F";
  const layer = getLayerRecommendation(forecast.tempC);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      fontSize: 11, color: isDark ? "#8b93a7" : "#6b7280",
      padding: "3px 8px", borderRadius: 6,
      background: isDark ? "#171a2188" : "#f3f4f688",
    }}>
      <span>{icon}</span>
      <span>{forecast.tempMin}{"\u00B0"}{"\u2013"}{forecast.tempMax}{"\u00B0"}C</span>
      {layer.layer !== "none" && (
        <span style={{ color: "#f97316", fontWeight: 600 }}>{"\u00B7"} {layer.label.replace(" recommended", "")}</span>
      )}
    </div>
  );
}

// ── OnCall Calendar ───────────────────────────────────────────────────────────
function OnCallCalendar({ onCallDates, onToggle, isDark }) {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  function isoOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  const today = new Date();
  const todayIso = isoOf(today);

  function buildGrid(year, month) {
    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);
    const days  = [];
    for (let i = (first.getDay() + 6) % 7; i > 0; i--) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
    return days;
  }

  const { year, month } = viewDate;
  const grid = buildGrid(year, month);
  const monthLabel = new Date(year, month, 1).toLocaleString("default", { month:"long", year:"numeric" });

  const bg = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text = isDark ? "#e2e8f0" : "#1f2937";

  return (
    <div style={{ padding:"14px 16px", borderRadius:14, background:bg, border:`1px solid ${border}`, marginTop:14 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <span style={{ fontWeight:700, fontSize:14, color:text }}>On-Call Dates</span>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={() => setViewDate(({ year:y, month:m }) => m===0 ? {year:y-1,month:11} : {year:y,month:m-1})}
            style={{ background:"none", border:"none", color:text, cursor:"pointer", fontSize:16 }}>{"\u2039"}</button>
          <span style={{ fontSize:12, fontWeight:600, color:text, minWidth:120, textAlign:"center" }}>{monthLabel}</span>
          <button onClick={() => setViewDate(({ year:y, month:m }) => m===11 ? {year:y+1,month:0} : {year:y,month:m+1})}
            style={{ background:"none", border:"none", color:text, cursor:"pointer", fontSize:16 }}>{"\u203A"}</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:2, marginBottom:4 }}>
        {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
          <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:700, color:"#6b7280", padding:"2px 0" }}>{d}</div>
        ))}
        {grid.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = isoOf(d);
          const isOC = onCallDates.includes(iso);
          const isToday = iso === todayIso;
          const isPast = d < today && !isToday;
          return (
            <button
              key={i} onClick={() => !isPast && onToggle(iso)}
              disabled={isPast}
              style={{
                borderRadius:6, border:"none", fontSize:11, fontWeight:isToday?700:400,
                padding:"4px 2px", cursor:isPast?"default":"pointer",
                background: isOC ? "#f97316" : isToday ? (isDark?"#2b3140":"#dbeafe") : "transparent",
                color: isOC ? "#fff" : isPast ? "#4b5563" : text,
                opacity: isPast ? 0.4 : 1,
              }}
            >{d.getDate()}</button>
          );
        })}
      </div>

      {onCallDates.length > 0 && (
        <div style={{ fontSize:11, color:"#f97316", marginTop:6 }}>
          {"\u{1F7E0}"} {onCallDates.filter(d => d >= todayIso).sort().slice(0,4).join("  ")}
          {onCallDates.filter(d => d >= todayIso).length > 4 ? " \u2026" : ""}
        </div>
      )}
    </div>
  );
}

// ── Main WeekPlanner ──────────────────────────────────────────────────────────
export default function WeekPlanner() {
  const watches    = useWatchStore(s => s.watches);
  const history    = useHistoryStore(s => s.entries);
  const addEntry   = useHistoryStore(s => s.addEntry);
  const weekCtx    = useWardrobeStore(s => s.weekCtx);
  const onCallDates= useWardrobeStore(s => s.onCallDates);
  const setWeekCtx = useWardrobeStore(s => s.setWeekCtx);
  const setOnCallDates = useWardrobeStore(s => s.setOnCallDates);
  const garments     = useWardrobeStore(s => s.garments);
  const straps       = useStrapStore(s => s.straps);
  const activeStrap  = useStrapStore(s => s.activeStrap);
  const { mode }     = useThemeStore();
  const isDark     = mode === "dark";
  const [showCalendar, setShowCalendar] = useState(false);
  const [showOutfits, setShowOutfits]   = useState(true);
  const [watchOverrides, setWatchOverrides] = useState({});
  const [strapOverrides, setStrapOverrides] = useState({});
  // Shuffle seeds: per-day counter that forces re-scoring with randomized tie-breaking
  const [shuffleSeeds, setShuffleSeeds]   = useState({});
  const [pickingDay, setPickingDay]         = useState(null);
  // Per-day per-slot garment overrides: { [offset]: { shirt: garmentId, ... } }
  const [outfitOverrides, setOutfitOverrides] = useState(() => {
    // Restore from IDB on mount (sync read from wardrobeStore cache)
    try {
      const cached = useWardrobeStore.getState();
      return cached._outfitOverrides ?? {};
    } catch { return {}; }
  });

  // Persist outfit overrides to IDB when they change
  useEffect(() => {
    setCachedState({ _outfitOverrides: outfitOverrides }).catch(() => {});
  }, [outfitOverrides]);

  // 7-day weather forecast with IDB caching (1-hour TTL)
  const [forecast, setForecast] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const { getCachedState: getCache } = await import("../services/localCache.js");
        const cached = await getCache();
        const now = Date.now();
        if (cached._forecast && cached._forecastTs && (now - cached._forecastTs) < 3600000) {
          setForecast(cached._forecast);
          return;
        }
      } catch {}
      try {
        const data = await fetchWeatherForecast();
        setForecast(data);
        setCachedState({ _forecast: data, _forecastTs: Date.now() }).catch(() => {});
      } catch (err) {
        console.warn("[weather] forecast failed:", err.message);
      }
    })();
  }, []);

  const rawRotation = useMemo(
    () => genWeekRotation(watches, history, weekCtx, onCallDates),
    [watches, history, weekCtx, onCallDates]
  );

  const rotation = useMemo(() =>
    rawRotation.map(day => {
      const oid = watchOverrides[day.offset];
      if (!oid) return day;
      const w = watches.find(x => x.id === oid);
      return w ? { ...day, watch: w, isOverridden: true } : day;
    }),
    [rawRotation, watchOverrides, watches]
  );

  // Wearable garments (exclude accessories)
  const wearable = useMemo(() =>
    garments.filter(g => !ACCESSORY_TYPES.has(g.type ?? g.category) && !g.excludeFromWardrobe),
    [garments]
  );

  // Candidates per slot type for swap dropdowns
  const slotCandidates = useMemo(() => {
    const result = {};
    for (const slot of OUTFIT_SLOTS) {
      result[slot] = wearable.filter(g => {
        const t = g.type ?? g.category;
        return t === slot;
      });
    }
    return result;
  }, [wearable]);

  // Generate outfits per day — uses watch + strap, weather forecast, and diversity penalty
  // Cross-day diversity: track per-slot garment usage across the week to avoid
  // wearing the same shirt/pants/shoes on consecutive days. Each day's fake history
  // injects previously-picked garments with correct slot placement so the diversity
  // penalty (-0.12 per appearance) triggers naturally in the scoring engine.
  const weekOutfits = useMemo(() => {
    const usedPerSlot = {}; // { shirt: [g1, g2], pants: [...], ... }
    for (const slot of OUTFIT_SLOTS) usedPerSlot[slot] = [];

    return rotation.map(day => {
      if (!day.watch) return {};
      const dayForecast = forecast.find(f => f.date === day.date);
      const weather = dayForecast ? { tempC: dayForecast.tempC } : { tempC: 22 };

      // Enrich watch with active strap for this day (shoe-strap coordination)
      const dayWatchId = watchOverrides[day.offset] ?? day.watch?.id;
      const dayStrapId = strapOverrides[day.offset]
        ?? (dayWatchId && activeStrap[dayWatchId]) ?? null;
      const dayStrapObj = dayStrapId ? straps[dayStrapId] : null;
      let enrichedWatch = day.watch;
      if (dayStrapObj) {
        const strapStr = dayStrapObj.type === "bracelet" || dayStrapObj.type === "integrated"
          ? dayStrapObj.type
          : `${dayStrapObj.color} ${dayStrapObj.type}`;
        enrichedWatch = { ...day.watch, strap: strapStr };
      }

      // Build proper per-slot fake history so diversity penalty fires per-slot
      // Each fake entry places the used garment ID in the correct slot only
      const fakeHistory = [...history];
      for (const slot of OUTFIT_SLOTS) {
        for (const gId of usedPerSlot[slot]) {
          fakeHistory.push({ outfit: { [slot]: gId } });
        }
      }

      // Shuffle: each shuffle press adds heavy fake-history entries for previous picks,
      // forcing the scoring engine to penalize them and surface alternatives.
      // shuffleSeed N means "skip the top N combinations" — each increment adds
      // 5 fake appearances per slot, enough to push -0.60 penalty and force next-best.
      // Extract pinned garments for this day so engine complements them
      const dayOverrides = outfitOverrides[day.offset] ?? {};
      const pinnedSlotGarments = {};
      for (const slot of OUTFIT_SLOTS) {
        if (dayOverrides[slot]) {
          const g = garments.find(x => x.id === dayOverrides[slot]);
          if (g) pinnedSlotGarments[slot] = g;
        }
      }

      const shuffleSeed = shuffleSeeds[day.offset] ?? 0;
      let iterHistory = [...fakeHistory];
      let outfit = {};
      for (let round = 0; round <= shuffleSeed; round++) {
        const adv = buildOutfit(enrichedWatch, wearable, weather, iterHistory, [], pinnedSlotGarments);
        const hasItems = Object.values(adv).some(Boolean);
        outfit = hasItems ? adv : generateOutfit(enrichedWatch, wearable, weather, { context: day.ctx }, iterHistory);
        if (round < shuffleSeed) {
          // Poison this round's picks so next iteration picks runner-up
          for (const slot of OUTFIT_SLOTS) {
            if (outfit[slot]?.id) {
              for (let i = 0; i < 5; i++) {
                iterHistory.push({ outfit: { [slot]: outfit[slot].id } });
              }
            }
          }
        }
      }

      // Apply manual overrides
      const overrides = outfitOverrides[day.offset] ?? {};
      for (const slot of OUTFIT_SLOTS) {
        if (overrides[slot]) {
          const g = garments.find(x => x.id === overrides[slot]);
          if (g) outfit[slot] = g;
        }
      }

      // Track used garments per-slot for cross-day diversity
      for (const slot of OUTFIT_SLOTS) {
        if (outfit[slot]?.id) usedPerSlot[slot].push(outfit[slot].id);
      }

      return outfit;
    });
  }, [rotation, wearable, garments, history, forecast, outfitOverrides, watchOverrides, strapOverrides, straps, activeStrap, shuffleSeeds]);

  const today = new Date().toISOString().slice(0, 10);

  function handleCtxChange(offset, ctx) {
    const dayIdx = (new Date().getDay() + offset) % 7;
    const next   = [...weekCtx];
    next[dayIdx] = ctx;
    setWeekCtx(next);
    setCachedState({ weekCtx: next }).catch(() => {});
  }

  function handleToggleOnCall(iso) {
    const next = onCallDates.includes(iso)
      ? onCallDates.filter(d => d !== iso)
      : [...onCallDates, iso].sort();
    setOnCallDates(next);
    setCachedState({ onCallDates: next }).catch(() => {});
  }

  const handleSwapGarment = useCallback((offset, slot, garment) => {
    setOutfitOverrides(prev => ({
      ...prev,
      [offset]: { ...(prev[offset] ?? {}), [slot]: garment.id },
    }));
  }, []);

  const handleShuffle = useCallback((offset) => {
    setShuffleSeeds(prev => ({ ...prev, [offset]: ((prev[offset] ?? 0) + 1) % 6 }));
  }, []);

  const handleResetOutfit = useCallback((offset) => {
    setShuffleSeeds(prev => { const n = { ...prev }; delete n[offset]; return n; });
    setOutfitOverrides(prev => {
      const next = { ...prev };
      delete next[offset];
      return next;
    });
  }, []);

  const bg     = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const sub    = isDark ? "#6b7280" : "#9ca3af";

  return (
    <div style={{ padding:"18px 20px", borderRadius:16, background:bg, border:`1px solid ${border}`, marginBottom:16 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:8 }}>
        <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:text }}>7-Day Rotation</h2>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          <button onClick={() => setShowOutfits(v => !v)} style={{
            background:showOutfits?"#3b82f622":"transparent", border:`1px solid ${showOutfits?"#3b82f6":border}`,
            color:showOutfits?"#3b82f6":sub, borderRadius:8, padding:"5px 12px",
            fontSize:12, fontWeight:600, cursor:"pointer",
          }}>
            {"\u{1F454}"} Outfits {showOutfits ? "ON" : "OFF"}
          </button>
          <button onClick={() => setShowCalendar(v => !v)} style={{
            background:showCalendar?"#f9731622":"transparent", border:`1px solid ${showCalendar?"#f97316":border}`,
            color:showCalendar?"#f97316":sub, borderRadius:8, padding:"5px 12px",
            fontSize:12, fontWeight:600, cursor:"pointer",
          }}>
            {"\u{1F7E0}"} On-Call {onCallDates.length > 0 ? `(${onCallDates.filter(d=>d>=today).length})` : ""}
          </button>
        </div>
      </div>

      <RotationInsights rotation={rotation} history={history} isDark={isDark} />

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {rotation.map((day, dayIdx) => {
          const isToday = day.date === today;
          const cardBg = day.isOnCall
            ? (isDark ? "#1a1400" : "#fff8f0")
            : isToday ? (isDark ? "#0d1929" : "#eff6ff")
            : (isDark ? "#0f131a" : "#f9fafb");
          const cardBorder = day.isOnCall ? "#f97316" : isToday ? "#3b82f6" : border;
          const dayForecast = forecast.find(f => f.date === day.date);
          const dayOutfit = weekOutfits[dayIdx] ?? {};
          const hasOverrides = !!outfitOverrides[day.offset];

          return (
            <div key={day.offset} style={{
              borderRadius:12, padding:"12px 14px",
              background:cardBg, border:`1px solid ${cardBorder}`,
            }}>
              {/* Day header */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8, flexWrap:"wrap", gap:6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontWeight:700, fontSize:13, color:text }}>
                    {isToday ? "Today" : day.dayName}
                  </span>
                  <span style={{ fontSize:11, color:sub }}>{day.date.slice(5)}</span>
                  {day.isOnCall && (
                    <span style={{ fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:4,
                                   background:"#f97316", color:"#fff" }}>ON-CALL</span>
                  )}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <WeatherBadge forecast={dayForecast} isDark={isDark} />
                  <select
                    value={day.ctx}
                    onChange={e => handleCtxChange(day.offset, e.target.value)}
                    style={{
                      fontSize:11, padding:"2px 6px", borderRadius:6,
                      border:`1px solid ${border}`, background:isDark?"#171a21":"#f3f4f6",
                      color:text, cursor:"pointer",
                    }}
                  >
                    {CONTEXTS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Watch */}
              <WatchMini watch={day.watch} isDark={isDark} isOnCall={day.isOnCall}
                label={day.isOverridden ? "overridden" : null}
                daysSince={day.watch ? daysSinceWorn(day.watch.id, history) : null} />

              {/* Watch override picker */}
              <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => setPickingDay(pickingDay === day.offset ? null : day.offset)}
                  style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
                            border: `1px solid ${day.isOverridden ? "#3b82f6" : border}`,
                            background: day.isOverridden ? "#3b82f622" : "transparent",
                            color: day.isOverridden ? "#3b82f6" : sub, fontWeight: 600 }}>
                  {day.isOverridden ? "\u231A Change" : "\u231A Override"}
                </button>
                {day.isOverridden && (
                  <button onClick={() => setWatchOverrides(o => { const n = {...o}; delete n[day.offset]; return n; })}
                    style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
                              border: `1px solid ${border}`, background: "transparent", color: "#ef4444", fontWeight: 600 }}>
                    Reset
                  </button>
                )}
              </div>

              {/* Watch picker dropdown */}
              {pickingDay === day.offset && (
                <div style={{ marginTop: 8, border: `1px solid ${border}`, borderRadius: 10,
                              background: isDark ? "#171a21" : "#fff", overflow: "hidden" }}>
                  {watches.map(w => {
                    const isSelected = (watchOverrides[day.offset] ?? day.watch?.id) === w.id;
                    return (
                      <div key={w.id}>
                        <div onClick={() => {
                          setWatchOverrides(o => ({ ...o, [day.offset]: w.id }));
                          setPickingDay(null);
                        }}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer",
                                    background: isSelected ? (isDark ? "#0c1f3f" : "#eff6ff") : "transparent",
                                    borderBottom: `1px solid ${border}` }}>
                          <span style={{ fontSize: 16 }}>{w.emoji ?? "\u231A"}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: text }}>{w.brand} {w.model}</div>
                            <div style={{ fontSize: 10, color: sub }}>{w.dial} {"\u00B7"} {w.replica ? "replica" : "genuine"}</div>
                          </div>
                          {isSelected && <span style={{ color: "#3b82f6", fontWeight: 700 }}>{"\u2713"}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Strap picker */}
              {(() => {
                const dayWatchId = watchOverrides[day.offset] ?? day.watch?.id;
                if (!dayWatchId) return null;
                const dayStraps = Object.values(straps).filter(s => s.watchId === dayWatchId);
                if (dayStraps.length <= 1) return null;
                const activeStrapId = strapOverrides[day.offset]
                  ?? Object.values(straps).find(s => s.watchId === dayWatchId && activeStrap[dayWatchId] === s.id)?.id
                  ?? dayStraps[0]?.id;
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: sub, fontWeight: 600, marginBottom: 5 }}>STRAP</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {dayStraps.map(s => {
                        const isActive = activeStrapId === s.id;
                        return (
                          <button key={s.id}
                            onClick={() => setStrapOverrides(o => ({ ...o, [day.offset]: s.id }))}
                            style={{ padding: "4px 9px", borderRadius: 7, fontSize: 10, fontWeight: 600,
                                      border: `1px solid ${isActive ? "#3b82f6" : border}`,
                                      background: isActive ? "#3b82f622" : "transparent",
                                      color: isActive ? "#3b82f6" : sub, cursor: "pointer" }}>
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                    {activeStrapId && straps[activeStrapId] && (
                      <div style={{ fontSize: 10, color: sub, marginTop: 4 }}>
                        {straps[activeStrapId].useCase}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Clothing rotation — outfit per day */}
              {showOutfits && day.watch && wearable.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${border}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      OUTFIT
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => handleShuffle(day.offset)}
                        title="Shuffle for alternative outfit"
                        style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, cursor: "pointer",
                                  border: `1px solid ${isDark ? "#4f46e5" : "#6366f1"}`,
                                  background: shuffleSeeds[day.offset] ? "#6366f122" : "transparent",
                                  color: isDark ? "#818cf8" : "#6366f1", fontWeight: 600 }}>
                        {"\u{1F500}"} Shuffle{shuffleSeeds[day.offset] ? ` (${shuffleSeeds[day.offset]})` : ""}
                      </button>
                      {(hasOverrides || shuffleSeeds[day.offset]) && (
                        <button onClick={() => handleResetOutfit(day.offset)}
                          style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, cursor: "pointer",
                                    border: `1px solid ${border}`, background: "transparent", color: "#ef4444", fontWeight: 600 }}>
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <style>{`
                    .wa-week-outfit-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
                    @media (max-width:500px) { .wa-week-outfit-grid { grid-template-columns:1fr; } }
                  `}</style>
                  <div className="wa-week-outfit-grid">
                    {OUTFIT_SLOTS.map(slot => (
                      <OutfitSlotChip
                        key={slot}
                        slot={slot}
                        garment={dayOutfit[slot]}
                        isDark={isDark}
                        border={border}
                        candidates={slotCandidates[slot]}
                        onSwap={(s, g) => handleSwapGarment(day.offset, s, g)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Wear This Outfit — save to history (today only) */}
              {showOutfits && isToday && day.watch && (
                <button
                  onClick={() => {
                    const garmentIds = OUTFIT_SLOTS
                      .map(s => dayOutfit[s]?.id)
                      .filter(Boolean);
                    addEntry({
                      id: `rotation-${Date.now()}`,
                      date: day.date,
                      watchId: day.watch.id,
                      garmentIds,
                      context: day.ctx,
                      loggedAt: new Date().toISOString(),
                    });
                  }}
                  style={{
                    width: "100%", marginTop: 10, padding: "9px 0", borderRadius: 8,
                    border: "none", background: "#22c55e", color: "#fff",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Wear This Outfit
                </button>
              )}

              {day.backup && (
                <div style={{ marginTop:6, paddingTop:6, borderTop:`1px solid ${border}` }}>
                  <div style={{ fontSize:10, color:sub, marginBottom:3 }}>Backup</div>
                  <WatchMini watch={day.backup} isDark={isDark} isOnCall={false}
                    daysSince={day.backup ? daysSinceWorn(day.backup.id, history) : null} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showCalendar && (
        <OnCallCalendar
          onCallDates={onCallDates}
          onToggle={handleToggleOnCall}
          isDark={isDark}
        />
      )}
    </div>
  );
}
