/**
 * TravelTab — "Travel" tab.
 *
 * User enters destination + date range + day count; we curate a watch
 * subset and per-day outfit pairings honoring forecast (or climate fallback)
 * and the leather coordination guideline (via filterShoesByStrap inside
 * buildOutfit, which is dynamically loaded so this tab stays light).
 *
 * Trips persist via useTravelStore (Zustand → IDB).
 */

import React, { useState, useMemo, useEffect } from "react";
import { useTravelStore } from "../stores/travelStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { buildOutfit } from "../outfitEngine/outfitBuilder.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import {
  buildTripDays, curateWatchesForTrip, assignWatchesToDays,
  validateTrip, daysBetween, CLIMATE_PROFILES,
} from "../features/travel/travelPlanner.js";
import { fetchWeatherForecast } from "../weather/weatherService.js";

const ACCESSORY_TYPES = new Set([
  "outfit-photo", "outfit-shot", "belt", "sunglasses", "hat", "scarf", "bag", "accessory",
]);

// outfitBuilder is statically imported elsewhere (OnCallPlanner, WatchDashboard,
// WeekPlanner) so the dynamic-load wrapper here saved nothing — the module is
// always already in the main bundle. Static import + Vite warning cleared.

function TripForm({ onSave, isDark }) {
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState(1);
  const [climate, setClimate] = useState("temperate");
  const [error, setError] = useState(null);

  // Auto-update days when date range changes
  useEffect(() => {
    if (startDate && endDate) {
      setDays(daysBetween(startDate, endDate));
    }
  }, [startDate, endDate]);

  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#8b93a7" : "#6b7280";
  const card = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const input = {
    background: isDark ? "#0f131a" : "#f9fafb", border: `1px solid ${border}`,
    borderRadius: 8, padding: "8px 10px", color: text, fontSize: 13, width: "100%",
    outline: "none", boxSizing: "border-box",
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trip = { destination, startDate, endDate, days, climate };
    const v = validateTrip(trip);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setError(null);
    onSave(trip);
    setDestination(""); setStartDate(""); setEndDate(""); setDays(1); setClimate("temperate");
  };

  return (
    <form onSubmit={handleSubmit} style={{
      background: card, border: `1px solid ${border}`, borderRadius: 14,
      padding: 16, marginBottom: 16,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase",
                    letterSpacing: "0.06em", marginBottom: 12 }}>New trip</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input style={input} placeholder="Destination (e.g. Paris)"
          value={destination} onChange={e => setDestination(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <input style={input} type="date" value={startDate}
            onChange={e => setStartDate(e.target.value)} aria-label="Start date" />
          <input style={input} type="date" value={endDate}
            onChange={e => setEndDate(e.target.value)} aria-label="End date" />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: muted, minWidth: 50 }}>Days</label>
          <input style={{ ...input, width: 80 }} type="number" min="1" max="60" value={days}
            onChange={e => setDays(Number(e.target.value) || 1)} />
          <select style={{ ...input, flex: 1 }} value={climate}
            onChange={e => setClimate(e.target.value)} aria-label="Climate">
            {Object.entries(CLIMATE_PROFILES).map(([k, p]) => (
              <option key={k} value={k}>{k} — {p.desc}</option>
            ))}
          </select>
        </div>
        {error && (
          <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>{error}</div>
        )}
        <button type="submit" style={{
          padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer",
          background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", color: "#fff",
          fontSize: 13, fontWeight: 700, minHeight: 44,
        }}>Plan trip</button>
      </div>
    </form>
  );
}

function TripDetail({ trip, onRemove, isDark }) {
  const watches = useWatchStore(s => s.watches) ?? [];
  const garments = useWardrobeStore(s => s.garments) ?? [];
  const entries = useHistoryStore(s => s.entries) ?? [];
  const [forecast, setForecast] = useState(null);
  const [outfits, setOutfits] = useState({});

  // Try to fetch a real forecast (silently — falls back to climate when missing)
  useEffect(() => {
    let cancelled = false;
    fetchWeatherForecast()
      .then(f => { if (!cancelled) setForecast(f); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [trip.id]);

  const tripDays = useMemo(() => buildTripDays(trip, forecast), [trip, forecast]);
  const curated = useMemo(() => curateWatchesForTrip(watches, tripDays, entries, 4), [watches, tripDays, entries]);
  const assigned = useMemo(() => assignWatchesToDays(curated, tripDays, entries), [curated, tripDays, entries]);

  // Build per-day outfits asynchronously; cache by day index
  useEffect(() => {
    let cancelled = false;
    if (!assigned.length || !garments.length) return;
    const wearable = garments.filter(g => !ACCESSORY_TYPES.has(g.type) && !g.excludeFromWardrobe);
    if (!wearable.length) return;

    const result = {};
    for (const day of assigned) {
      try {
        const ctx = (day.tempC != null && day.tempC > 22) ? "casual" : "smart-casual";
        const o = buildOutfit(day.watch, wearable, { tempC: day.tempC ?? 18 }, entries, [], {}, {}, ctx);
        result[day.date] = o ?? null;
      } catch (_) {
        result[day.date] = null;
      }
    }
    if (!cancelled) setOutfits(result);
    return () => { cancelled = true; };
  }, [assigned, garments, entries]);

  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#8b93a7" : "#6b7280";
  const card = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";

  return (
    <div style={{
      background: card, border: `1px solid ${border}`, borderRadius: 14,
      padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: text }}>
            {trip.destination || "Untitled trip"}
          </div>
          <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
            {trip.startDate} → {trip.endDate} · {trip.days} day{trip.days === 1 ? "" : "s"} · {trip.climate}
          </div>
        </div>
        <button onClick={() => onRemove(trip.id)} style={{
          background: "transparent", border: `1px solid ${border}`, borderRadius: 8,
          padding: "4px 10px", color: muted, fontSize: 11, cursor: "pointer",
        }}>Remove</button>
      </div>

      {/* Curated watch subset */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase",
          letterSpacing: "0.06em", marginBottom: 6,
        }}>Pack {curated.length} watches</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {curated.map(w => (
            <div key={w.id} style={{
              padding: "5px 10px", borderRadius: 16,
              background: isDark ? "#0f131a" : "#f3f4f6",
              border: `1px solid ${border}`, fontSize: 11, color: text, fontWeight: 600,
            }}>
              {w.brand} {w.model}
            </div>
          ))}
          {curated.length === 0 && (
            <div style={{ fontSize: 12, color: muted, fontStyle: "italic" }}>No watches available.</div>
          )}
        </div>
      </div>

      {/* Per-day plan */}
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase",
          letterSpacing: "0.06em", marginBottom: 6,
        }}>Day-by-day</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {assigned.map((day, i) => {
            const outfit = outfits[day.date];
            return (
              <div key={day.date} style={{
                padding: "10px 12px", borderRadius: 8, border: `1px solid ${border}`,
                background: isDark ? "#0f131a" : "#f9fafb",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: text }}>
                    Day {i + 1} · {day.date}
                  </div>
                  <div style={{ fontSize: 11, color: muted }}>
                    {day.tempC}°C{day.source === "climate" ? " (est)" : ""}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: text, marginTop: 4 }}>
                  {day.watch?.brand} {day.watch?.model}
                </div>
                {outfit && (
                  <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>
                    {Object.entries(outfit)
                      .filter(([k, v]) => v && typeof v === "object" && v.name && k !== "watch")
                      .slice(0, 4)
                      .map(([k, g]) => `${k}: ${g.name}`)
                      .join(" · ") || "No outfit suggestion"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function TravelTab() {
  const trips = useTravelStore(s => s.trips) ?? [];
  const addTrip = useTravelStore(s => s.addTrip);
  const removeTrip = useTravelStore(s => s.removeTrip);
  const { mode } = useThemeStore();
  const isDark = mode === "dark";

  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#8b93a7" : "#9ca3af";

  return (
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: text, marginBottom: 4 }}>Travel</div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>
        Pack the right watches. Plan a trip — we'll curate a subset and pair outfits per day.
      </div>

      <TripForm onSave={addTrip} isDark={isDark} />

      {trips.length === 0 && (
        <div style={{
          fontSize: 13, color: muted, textAlign: "center", padding: 24,
          border: `1px dashed ${isDark ? "#2b3140" : "#d1d5db"}`, borderRadius: 12,
        }}>
          No trips yet. Plan one above.
        </div>
      )}

      {trips.map(t => (
        <TripDetail key={t.id} trip={t} onRemove={removeTrip} isDark={isDark} />
      ))}
    </div>
  );
}
