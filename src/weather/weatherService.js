/**
 * Weather service — Open-Meteo API + browser geolocation.
 * Runs in background — never blocks UI, never throws to callers.
 *
 * Uses Promise.race for timeouts instead of AbortController.
 * AbortController.abort() fires a rejection at the window.fetch level
 * which Netlify RUM intercepts before our catch blocks run.
 * Promise.race rejects with a plain Error that stays within our try/catch.
 */

const TIMEOUT_MS = 8000;

// v1.13.10 — return { source } so callers can show "live" vs "fallback".
// User report: "weather feels static" was caused by silent fallback to
// hardcoded Jerusalem when geolocation was denied/timed out — the user had
// no way to tell it wasn't their actual location.
async function getCoords() {
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, maximumAge: 300000 })
    );
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, source: "live" };
  } catch (_) {
    return { latitude: 31.7683, longitude: 35.2137, source: "fallback" };
  }
}

// Race fetch against a plain-Error timeout — no AbortController.
// Plain Error stays inside our try/catch and never reaches window-level handlers.
function fetchRace(url, options = {}) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, rej) => setTimeout(() => rej(new Error("weather timeout")), TIMEOUT_MS)),
  ]);
}

export async function fetchWeather() {
  try {
    const { latitude, longitude } = await getCoords();
    const res = await fetchRace(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
    );
    const data = await res.json();
    const cw = data.current_weather;
    if (!cw) throw new Error("no current_weather");

    let cityName = null;
    try {
      const geo = await fetchRace(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        { headers: { "Accept-Language": "en" } }
      );
      const gd = await geo.json();
      cityName = gd?.address?.city ?? gd?.address?.town ?? gd?.address?.village ?? gd?.address?.county ?? null;
    } catch (_) {}

    return { tempC: cw.temperature, description: weatherCodeToDesc(cw.weathercode), weathercode: cw.weathercode, cityName, latitude, longitude };
  } catch (err) {
    console.warn("[weather] fetchWeather failed:", err.message);
    return null;
  }
}

export async function fetchWeatherForecast() {
  try {
    const { latitude, longitude, source } = await getCoords();
    const res = await fetchRace(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum&hourly=temperature_2m&timezone=Asia/Jerusalem`
    );
    const data = await res.json();
    const daily = data.daily;
    const hourly = data.hourly;
    if (!daily?.time) return [];

    // v1.13.10 — fire a reverse-geocode in parallel so the planner header can
    // show "Tel Aviv (live)" or "Jerusalem (default)" without an extra hop.
    let cityName = null;
    try {
      const geo = await fetchRace(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        { headers: { "Accept-Language": "en" } }
      );
      const gd = await geo.json();
      cityName = gd?.address?.city ?? gd?.address?.town ?? gd?.address?.village ?? gd?.address?.county ?? null;
    } catch (_) { /* reverse-geocode is non-fatal */ }

    return daily.time.map((date, i) => {
      const dayAvg = Math.round((daily.temperature_2m_max[i] + daily.temperature_2m_min[i]) / 2);

      // Extract hourly temps for this day (morning 7-10, midday 11-14, evening 17-20)
      let tempMorning = null, tempMidday = null, tempEvening = null;
      if (hourly?.time && hourly?.temperature_2m) {
        const dayHours = hourly.time.reduce((acc, t, idx) => {
          if (t.startsWith(date)) acc.push({ hour: parseInt(t.slice(11, 13), 10), temp: hourly.temperature_2m[idx] });
          return acc;
        }, []);
        const avg = (hours) => {
          const vals = dayHours.filter(h => hours.includes(h.hour)).map(h => h.temp);
          return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        };
        tempMorning = avg([7, 8, 9, 10]);
        tempMidday = avg([11, 12, 13, 14]);
        tempEvening = avg([17, 18, 19, 20]);
      }

      // Dressing-hours range — min/max across the buckets Eias is actually
      // outside in (7-10am, 11-14pm, 17-20pm). The 24h tempMin/tempMax
      // includes the overnight low (often 4-5am) which is irrelevant: he's
      // asleep. Showing it in the UI ("10°-25°C") created the 2026-05-07
      // confusion — chip implied morning was 10°C when morning was actually
      // 16°C and the 10°C was the 4am low. Falls back to 24h range only
      // when hourly data isn't available.
      const dressingTemps = [tempMorning, tempMidday, tempEvening].filter(t => t != null);
      const tempDressingMin = dressingTemps.length
        ? Math.min(...dressingTemps)
        : Math.round(daily.temperature_2m_min[i]);
      const tempDressingMax = dressingTemps.length
        ? Math.max(...dressingTemps)
        : Math.round(daily.temperature_2m_max[i]);

      return {
        date,
        tempC: tempMorning ?? dayAvg, // Use morning temp as primary — you dress for the morning
        tempAvg: dayAvg,
        tempMin: Math.round(daily.temperature_2m_min[i]),
        tempMax: Math.round(daily.temperature_2m_max[i]),
        tempDressingMin,
        tempDressingMax,
        tempMorning,
        tempMidday,
        tempEvening,
        description: weatherCodeToDesc(daily.weathercode[i]),
        precipitation: daily.precipitation_sum?.[i] ?? 0,
        weathercode: daily.weathercode[i],
        // v1.13.10 — geolocation provenance + city. Same value on every day's
        // forecast entry; cheap to duplicate, simple for callers to read.
        cityName,
        locationSource: source,
      };
    });
  } catch (err) {
    console.warn("[weather] fetchWeatherForecast failed:", err.message);
    return [];
  }
}

function weatherCodeToDesc(code) {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 49) return "Foggy";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

/**
 * Layer recommendation aligned with the actual outfit-engine thresholds
 * (`outfitBuilder._fillSweaterLayer` / `_fillJacket`) AND the system prompt
 * in `netlify/functions/daily-pick.js`. All three must agree — otherwise the
 * UI badge promises one thing, the AI's prose promises another, and the
 * engine ships a third combo.
 *
 *   morning < 10°C   → coat (heavy: sweater + jacket + extra layer)
 *   morning < 14°C   → sweater + jacket
 *   morning < 22°C   → light jacket only — NO sweater on the Mediterranean
 *                       coast at this temp (Eias-calibrated 2026-05-02)
 *   morning ≥ 22°C   → no extra layer
 *
 * The previous v1.13.7 version only had 3 tiers (coat/sweater/none) with the
 * sweater band at 12–22°C. That contradicted both the engine (which gates
 * sweater at <14°C since the same calibration) and the system prompt's
 * "NO sweater at ≥14°C" rule, so the badge said "Sweater + jacket" at 16°C
 * morning while the engine refused to add a sweater — the user got conflicting
 * advice on the same screen (the 2026-05-07 incident).
 */
export function getLayerRecommendation(tempC) {
  if (tempC < 10) return { layer: "coat", label: "Heavy coat — sweater + jacket + extra layer" };
  if (tempC < 13) return { layer: "sweater", label: "Sweater or light layer" };
  return { layer: "none", label: "No extra layer needed" };
}

/**
 * Pick the right hourly temp for a given day-context — "you dress for what
 * you'll actually be doing." Morning shifts/work → tempMorning; evening
 * occasions → tempEvening; midday social → tempMidday; default → tempMorning.
 *
 * Falls back through Morning → Midday → Evening → tempC so partial forecasts
 * still produce a usable answer.
 */
export function pickContextualTemp(forecast, ctx) {
  if (!forecast) return null;
  const m = forecast.tempMorning, mid = forecast.tempMidday, ev = forecast.tempEvening;
  const fb = forecast.tempC;
  const eveningCtx = new Set(["date-night", "family-event", "eid-celebration"]);
  const middayCtx  = new Set(["casual"]);
  if (eveningCtx.has(ctx)) return ev ?? mid ?? m ?? fb ?? null;
  if (middayCtx.has(ctx))  return mid ?? m ?? ev ?? fb ?? null;
  // Default: work / shift / smart-casual / null → morning is when you dress
  return m ?? mid ?? ev ?? fb ?? null;
}

/**
 * Transition-aware layer advice using hourly temps.
 * Shows what to wear at different times of day.
 */
export function getLayerTransition(forecast) {
  if (!forecast) return null;
  const { tempMorning, tempMidday, tempEvening } = forecast;
  if (tempMorning == null) return null;

  const morningLayer = getLayerRecommendation(tempMorning);
  const middayLayer = tempMidday != null ? getLayerRecommendation(tempMidday) : null;
  const eveningLayer = tempEvening != null ? getLayerRecommendation(tempEvening) : null;

  const parts = [];
  parts.push(`${tempMorning}°C morning → ${morningLayer.label.toLowerCase()}`);

  // 3-tier model (v1.13.7): coat / sweater / none. Transitions either
  // shed (warmer) or grab (colder) one tier at a time.
  if (middayLayer && middayLayer.layer !== morningLayer.layer) {
    if (middayLayer.layer === "none") {
      parts.push(`${tempMidday}°C midday → shed the ${morningLayer.layer}`);
    } else {
      parts.push(`${tempMidday}°C midday → ${middayLayer.label.toLowerCase()}`);
    }
  }

  if (eveningLayer && eveningLayer.layer !== (middayLayer?.layer ?? morningLayer.layer)) {
    if (eveningLayer.layer === "coat" || eveningLayer.layer === "sweater") {
      parts.push(`${tempEvening}°C evening → grab a ${eveningLayer.layer}`);
    } else {
      parts.push(`${tempEvening}°C evening → ${eveningLayer.label.toLowerCase()}`);
    }
  }

  return parts.join(" · ");
}

export function formatWeatherText(weather, forecast = null) {
  if (!weather) return null;
  const rec = getLayerRecommendation(weather.tempC);
  const city = weather.cityName ? `${weather.cityName} · ` : "";
  const transition = forecast ? getLayerTransition(forecast) : null;
  return transition
    ? `${city}${weather.tempC}°C ${weather.description} — ${transition}`
    : `${city}${weather.tempC}°C ${weather.description} — ${rec.label}`;
}
