/**
 * OnCallPlanner — dedicated outfit planning for 24hr on-call shifts.
 *
 * Shows:
 *  - Day 1 (arrival) outfit: 3 alternatives, scored for shift context + current weather
 *  - Day 2 (post-call) outfit: 1 suggestion for leaving hospital next day
 *  - Pack list: what to bring
 *  - 2-day weather cards
 */
import React, { useState, useEffect, useMemo } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore }    from "../stores/watchStore.js";
import { useStrapStore }    from "../stores/strapStore.js";
import { useThemeStore }    from "../stores/themeStore.js";
import { useHistoryStore }  from "../stores/historyStore.js";
import { buildOutfit }      from "../outfitEngine/outfitBuilder.js";
import { fetchWeatherForecast } from "../weather/weatherService.js";
import { normalizeType }    from "../classifier/normalizeType.js";
import { scoreWatchForDay } from "../engine/dayProfile.js";

const ACCESSORY_TYPES = new Set(["belt","sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);

function weatherIcon(code) {
  if (code === 0) return "☀️";
  if (code <= 3)  return "⛅";
  if (code <= 49) return "🌫️";
  if (code <= 69) return "🌧️";
  if (code <= 79) return "❄️";
  if (code <= 99) return "⛈️";
  return "🌡️";
}

function rainWarning(precipitation) {
  if (precipitation >= 5) return { label: "Rain gear recommended", color: "#60a5fa" };
  if (precipitation >= 1) return { label: "Light rain possible", color: "#93c5fd" };
  return null;
}

function WeatherCard({ day, label, isDark }) {
  if (!day) return null;
  const border  = isDark ? "#2b3140" : "#d1d5db";
  const bg      = isDark ? "#0f131a" : "#f9fafb";
  const text    = isDark ? "#e2e8f0" : "#1f2937";
  const sub     = isDark ? "#8b93a7" : "#6b7280";
  const rain    = rainWarning(day.precipitation);

  return (
    <div style={{ flex: 1, borderRadius: 10, border: `1px solid ${border}`, background: bg, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 22 }}>{weatherIcon(day.weathercode)}</span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: text }}>{day.tempC}°C</div>
          <div style={{ fontSize: 10, color: sub }}>{day.tempMin}–{day.tempMax}°C</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: sub }}>{day.description}</div>
      {rain && <div style={{ fontSize: 10, color: rain.color, marginTop: 3 }}>🌂 {rain.label}</div>}
    </div>
  );
}

function OutfitCard({ outfit, watch, label, note, isDark, isAlternate }) {
  const border  = isDark ? "#2b3140" : "#d1d5db";
  const bg      = isDark ? (isAlternate ? "#171a21" : "#0f131a") : (isAlternate ? "#f9fafb" : "#fff");
  const text    = isDark ? "#e2e8f0" : "#1f2937";
  const sub     = isDark ? "#8b93a7" : "#6b7280";
  const accent  = isAlternate ? "#8b93a7" : "#3b82f6";

  const slots = [
    { key: "shirt",   label: "Top" },
    { key: "sweater", label: "Mid" },
    { key: "jacket",  label: "Outer" },
    { key: "pants",   label: "Pants" },
    { key: "shoes",   label: "Shoes" },
  ].filter(s => outfit[s.key]);

  if (!slots.length) return null;

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${border}`, background: bg, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: accent }}>{label}</span>
        {note && <span style={{ fontSize: 10, color: sub }}>{note}</span>}
      </div>
      {watch && (
        <div style={{ fontSize: 11, color: text, marginBottom: 4, fontWeight: 600 }}>
          ⌚ {watch.brand} {watch.model}
          {outfit._strap && <span style={{ color: sub, fontWeight: 400 }}> · {outfit._strap}</span>}
        </div>
      )}
      {slots.map(s => {
        const g = outfit[s.key];
        return (
          <div key={s.key} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
            <span style={{ fontSize: 10, color: sub, minWidth: 34 }}>{s.label}</span>
            <span style={{ fontSize: 11, color: text }}>{g.name}</span>
            <span style={{ fontSize: 10, color: sub }}>· {g.color}</span>
          </div>
        );
      })}
    </div>
  );
}

function PackList({ outfitDay1, outfitDay2, weather, isDark }) {
  const border = isDark ? "#2b3140" : "#d1d5db";
  const bg     = isDark ? "#0f131a" : "#f9fafb";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const sub    = isDark ? "#8b93a7" : "#6b7280";

  const items = [
    { icon: "👔", label: "Day 1 outfit (on your body)" },
    { icon: "👗", label: "Day 2 change of clothes (packed)" },
    { icon: "👟", label: "Comfortable shoes for overnight" },
    { icon: "⌚", label: "Watch — genuine, tool-capable" },
  ];

  const day2Strap = outfitDay2?.shoes?.color;
  if (day2Strap) items.push({ icon: "🪢", label: `Strap for Day 2 shoes (${day2Strap})` });

  if (weather?.day2?.precipitation >= 1)
    items.push({ icon: "☂️", label: "Umbrella / rain jacket" });
  if (weather?.day1?.tempC < 14 || weather?.day2?.tempC < 14)
    items.push({ icon: "🧥", label: "Extra warm layer" });

  items.push(
    { icon: "🪥", label: "Toiletry kit" },
    { icon: "🔋", label: "Phone charger" },
  );

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${border}`, background: bg, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#60a5fa" : "#2563eb", marginBottom: 8 }}>
        🎒 Pack List
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
          <span>{item.icon}</span>
          <span style={{ fontSize: 11, color: text }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function OnCallPlanner({ isDark: propDark }) {
  const { mode }   = useThemeStore();
  const isDark     = propDark ?? mode === "dark";

  const garments   = useWardrobeStore(s => s.garments);
  const watches    = useWatchStore(s => s.watches);
  const history    = useHistoryStore(s => s.entries);
  const strapStore = useStrapStore(s => s.straps);
  const activeStrap = useStrapStore(s => s.activeStrap);

  const [forecast,  setForecast]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [alt,       setAlt]       = useState(0); // 0/1/2 — which Day 1 alternative

  useEffect(() => {
    fetchWeatherForecast()
      .then(data => setForecast(data?.slice(0, 2) ?? []))
      .catch(() => setForecast([]))
      .finally(() => setLoading(false));
  }, []);

  const wearable = useMemo(() =>
    garments.filter(g => !ACCESSORY_TYPES.has(g.type ?? g.category) && !g.excludeFromWardrobe),
    [garments]
  );

  // Pick best genuine watch for shift using the same scoring engine as the rotation picker.
  // Only shift-flagged watches are candidates — Speedmaster, BB41, Hanhart.
  // shiftWatch flag in watchSeed.js is the single source of truth.
  const shiftWatch = useMemo(() => {
    const candidates = watches.filter(w => !w.retired && w.shiftWatch);
    if (!candidates.length) return watches.find(w => w.genuine !== false && !w.retired) ?? watches.find(w => !w.retired) ?? null;
    const scored = candidates.map(w => ({
      watch: w,
      score: scoreWatchForDay(w, "shift", history),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0].watch;
  }, [watches, history]);

  // Enrich watch with active strap
  const enrichedWatch = useMemo(() => {
    if (!shiftWatch) return null;
    const strapId  = activeStrap?.[shiftWatch.id];
    const strapObj = strapId ? strapStore[strapId] : null;
    if (!strapObj) return shiftWatch;
    const strapStr = strapObj.type === "bracelet" || strapObj.type === "integrated"
      ? strapObj.type
      : `${strapObj.color} ${strapObj.type}`;
    return { ...shiftWatch, strap: strapStr, _activeStrapLabel: strapObj.label };
  }, [shiftWatch, activeStrap, strapStore]);

  const day1Weather = forecast?.[0] ?? null;
  const day2Weather = forecast?.[1] ?? null;

  // Generate 3 Day 1 outfits (different shuffles)
  const day1Outfits = useMemo(() => {
    if (!enrichedWatch || !wearable.length) return [];
    const weatherObj = { tempC: day1Weather?.tempC ?? 18 };
    const outfits = [];
    const fakeHistory = [];
    for (let seed = 0; seed < 3; seed++) {
      const o = buildOutfit(enrichedWatch, wearable, weatherObj, fakeHistory, [], {}, {}, "shift");
      if (Object.values(o).some(Boolean)) {
        outfits.push(o);
        // Poison history to force variety
        const ghost = { outfit: {} };
        for (const slot of ["shirt","sweater","pants","shoes","jacket"]) {
          if (o[slot]?.id) ghost.outfit[slot] = o[slot].id;
        }
        for (let i = 0; i < 4; i++) fakeHistory.push(ghost);
      }
    }
    return outfits;
  }, [enrichedWatch, wearable, day1Weather]);

  // Day 2 outfit — smart-casual, day after call
  const day2Outfit = useMemo(() => {
    if (!enrichedWatch || !wearable.length) return null;
    const weatherObj = { tempC: day2Weather?.tempC ?? 18 };
    // Day 2: casual/smart-casual, avoid what's in Day 1 primary
    const day1Used = new Set(Object.values(day1Outfits[0] ?? {}).map(g => g?.id).filter(Boolean));
    const freshWearable = wearable.filter(g => !day1Used.has(g.id));
    const o = buildOutfit(enrichedWatch, freshWearable.length >= 5 ? freshWearable : wearable, weatherObj, [], [], {}, {}, "smart-casual");
    return Object.values(o).some(Boolean) ? o : null;
  }, [enrichedWatch, wearable, day2Weather, day1Outfits]);

  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const sub    = isDark ? "#8b93a7" : "#6b7280";
  const border = isDark ? "#2b3140" : "#d1d5db";

  const day1Selected = day1Outfits[alt] ?? day1Outfits[0];

  if (loading) {
    return (
      <div style={{ padding: "16px 0", color: sub, fontSize: 13 }}>
        ⏳ Loading forecast…
      </div>
    );
  }

  return (
    <div>
      {/* Weather strip */}
      {(day1Weather || day2Weather) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <WeatherCard day={day1Weather} label="Today (Day 1)" isDark={isDark} />
          <WeatherCard day={day2Weather} label="Tomorrow (Day 2)" isDark={isDark} />
        </div>
      )}

      {/* Day 1 outfits */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#f97316" }}>🏥 Day 1 — Arrival outfit</span>
          <div style={{ display: "flex", gap: 4 }}>
            {day1Outfits.map((_, i) => (
              <button key={i} onClick={() => setAlt(i)} style={{
                width: 28, height: 28, borderRadius: 6,
                border: `1px solid ${alt === i ? "#3b82f6" : border}`,
                background: alt === i ? "#1d4ed822" : "transparent",
                color: alt === i ? "#3b82f6" : sub,
                fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
        {day1Selected
          ? <OutfitCard outfit={day1Selected} watch={enrichedWatch} label={`Option ${alt + 1}`} note="Shift context" isDark={isDark} />
          : <div style={{ fontSize: 12, color: sub }}>No outfit generated — add more garments.</div>
        }
      </div>

      {/* Day 2 outfit */}
      {day2Outfit && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", marginBottom: 8 }}>
            🌅 Day 2 — Post-call (pack in bag)
          </div>
          <OutfitCard outfit={day2Outfit} watch={enrichedWatch} label="Change of clothes" note="Smart casual" isDark={isDark} isAlternate />
        </div>
      )}

      {/* Pack list */}
      <PackList
        outfitDay1={day1Selected}
        outfitDay2={day2Outfit}
        weather={{ day1: day1Weather, day2: day2Weather }}
        isDark={isDark}
      />
    </div>
  );
}
