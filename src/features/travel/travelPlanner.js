/**
 * Travel planner — pure helpers.
 *
 * Curates a subset of watches + outfit pairings for a trip. Honors:
 *   - Weather forecast (per-day temp drives layer + watch choice)
 *   - Leather coordination guideline (uses scoring.strapShoeScore — currently
 *     a no-op runtime, but the per-day scorer pre-filters shoes via
 *     filterShoesByStrap so the guideline still nudges results)
 *   - Replica/genuine mix (formal destinations skew genuine via dayProfile)
 *
 * Climate fallback: when geocoding fails, the user picks a climate bucket
 * and we synthesise a plausible temp distribution.
 */

import { scoreWatchForDay } from "../../engine/dayProfile.js";
import { isActiveWatch } from "../../utils/watchFilters.js";

// Temp distributions (°C) by climate bucket — used when forecast unavailable.
// Mean ± half-range; produces a per-day temp via deterministic jitter on date.
export const CLIMATE_PROFILES = {
  tropical:  { meanC: 28, swing: 4,  rainy: true,  desc: "Hot & humid (~24-32°C)" },
  temperate: { meanC: 16, swing: 8,  rainy: false, desc: "Mild (~8-24°C)" },
  cold:      { meanC: 2,  swing: 8,  rainy: false, desc: "Cold (~-6 to +10°C)" },
  desert:    { meanC: 24, swing: 14, rainy: false, desc: "Hot day, cool night (~10-38°C)" },
};

/** Deterministic [0,1) hash — same destination+day always yields same temp. */
function _seed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return (Math.abs(h) % 10000) / 10000;
}

/**
 * Build a per-day temp series. Uses real forecast when available,
 * else falls back to climate bucket.
 *
 * @param {object} trip { destination, startDate, endDate, days, climate }
 * @param {Array} forecast optional — Array<{date, tempC, description}>
 * @returns {Array<{date, tempC, description, source: 'forecast'|'climate'}>}
 */
export function buildTripDays(trip, forecast = null) {
  const { destination, startDate, days, climate } = trip;
  const dayCount = Math.max(1, Math.min(60, days || 1));
  const start = startDate ? new Date(startDate) : new Date();
  if (Number.isNaN(start.getTime())) {
    return [];
  }

  // Index forecast by ISO date for quick lookup
  const fIdx = {};
  if (Array.isArray(forecast)) {
    for (const f of forecast) {
      if (f?.date) fIdx[f.date] = f;
    }
  }

  const profile = CLIMATE_PROFILES[climate] ?? CLIMATE_PROFILES.temperate;
  const out = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const real = fIdx[iso];
    if (real && typeof real.tempC === "number") {
      out.push({
        date: iso,
        tempC: real.tempC,
        description: real.description ?? "",
        source: "forecast",
      });
    } else {
      const j = _seed(`${destination ?? ""}:${iso}`);
      const tempC = Math.round(profile.meanC + (j * 2 - 1) * profile.swing);
      out.push({
        date: iso,
        tempC,
        description: profile.rainy && j > 0.7 ? "Rain likely" : "Typical for climate",
        source: "climate",
      });
    }
  }
  return out;
}

/**
 * Choose a curated watch subset for the trip. Picks up to `count` watches
 * by aggregating per-day scores across the trip.
 */
export function curateWatchesForTrip(watches, tripDays, history = [], count = 3) {
  if (!Array.isArray(watches) || watches.length === 0) return [];
  const active = watches.filter(isActiveWatch);

  // Per-day target profile based on temp:
  //   < 12°C → smart-casual (cooler, layered, formal-ish)
  //   12-22  → smart-casual
  //   > 22   → casual (hot, lighter)
  const profileFor = (tempC) => {
    if (tempC == null) return "smart-casual";
    if (tempC < 12) return "smart-casual";
    if (tempC > 22) return "casual";
    return "smart-casual";
  };

  const totals = active.map(w => {
    let total = 0;
    for (const day of tripDays) {
      total += scoreWatchForDay(w, profileFor(day.tempC), history);
    }
    return { watch: w, total };
  });
  totals.sort((a, b) => b.total - a.total);
  return totals.slice(0, Math.min(count, totals.length)).map(t => t.watch);
}

/**
 * Assign one watch per day from the curated subset using round-robin
 * tempered by per-day score. Pure & deterministic.
 */
export function assignWatchesToDays(curated, tripDays, history = []) {
  if (!curated.length || !tripDays.length) return [];
  const profileFor = (tempC) => (tempC != null && tempC > 22) ? "casual" : "smart-casual";
  const wornCount = new Map(curated.map(w => [w.id, 0]));

  return tripDays.map(day => {
    const scored = curated.map(w => {
      const base = scoreWatchForDay(w, profileFor(day.tempC), history);
      // Spread wear: penalty per prior wear during the trip
      const prior = wornCount.get(w.id) ?? 0;
      const spread = base - prior * 0.2;
      return { watch: w, score: spread };
    }).sort((a, b) => b.score - a.score);
    const pick = scored[0]?.watch ?? curated[0];
    wornCount.set(pick.id, (wornCount.get(pick.id) ?? 0) + 1);
    return { ...day, watchId: pick.id, watch: pick };
  });
}

/**
 * Validate a trip object before persisting.
 * Returns { ok: true } or { ok: false, error: string }.
 */
export function validateTrip(trip) {
  if (!trip) return { ok: false, error: "Missing trip" };
  if (!trip.destination?.trim()) return { ok: false, error: "Destination required" };
  if (!trip.startDate) return { ok: false, error: "Start date required" };
  if (!trip.endDate) return { ok: false, error: "End date required" };
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: "Invalid dates" };
  }
  if (end < start) return { ok: false, error: "End date before start date" };
  if (!trip.days || trip.days < 1) return { ok: false, error: "Days must be >= 1" };
  return { ok: true };
}

/** Compute days between start/end inclusive. Used to prefill the days field. */
export function daysBetween(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const s = new Date(startDate), e = new Date(endDate);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1;
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}
