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

async function getCoords() {
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, maximumAge: 300000 })
    );
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch (_) {
    return { latitude: 31.7683, longitude: 35.2137 };
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
    const { latitude, longitude } = await getCoords();
    const res = await fetchRace(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum&hourly=temperature_2m&timezone=Asia/Jerusalem`
    );
    const data = await res.json();
    const daily = data.daily;
    const hourly = data.hourly;
    if (!daily?.time) return [];

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

      return {
        date,
        tempC: tempMorning ?? dayAvg, // Use morning temp as primary — you dress for the morning
        tempAvg: dayAvg,
        tempMin: Math.round(daily.temperature_2m_min[i]),
        tempMax: Math.round(daily.temperature_2m_max[i]),
        tempMorning,
        tempMidday,
        tempEvening,
        description: weatherCodeToDesc(daily.weathercode[i]),
        precipitation: daily.precipitation_sum?.[i] ?? 0,
        weathercode: daily.weathercode[i],
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

export function getLayerRecommendation(tempC) {
  if (tempC < 10) return { layer: "coat", label: "Heavy coat recommended" };
  if (tempC < 16) return { layer: "sweater", label: "Sweater recommended" };
  if (tempC < 22) return { layer: "light-jacket", label: "Light layer recommended" };
  return { layer: "none", label: "No extra layer needed" };
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

  if (middayLayer && middayLayer.layer !== morningLayer.layer) {
    if (middayLayer.layer === "none" || middayLayer.layer === "light-jacket" && morningLayer.layer === "coat") {
      parts.push(`${tempMidday}°C midday → shed the ${morningLayer.layer}`);
    } else {
      parts.push(`${tempMidday}°C midday → ${middayLayer.label.toLowerCase()}`);
    }
  }

  if (eveningLayer && eveningLayer.layer !== (middayLayer?.layer ?? morningLayer.layer)) {
    if (eveningLayer.layer === "coat" || eveningLayer.layer === "sweater") {
      parts.push(`${tempEvening}°C evening → grab a ${eveningLayer.layer}`);
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
