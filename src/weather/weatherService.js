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
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum&timezone=auto`
    );
    const data = await res.json();
    const daily = data.daily;
    if (!daily?.time) return [];
    return daily.time.map((date, i) => ({
      date,
      tempC: Math.round((daily.temperature_2m_max[i] + daily.temperature_2m_min[i]) / 2),
      tempMin: Math.round(daily.temperature_2m_min[i]),
      tempMax: Math.round(daily.temperature_2m_max[i]),
      description: weatherCodeToDesc(daily.weathercode[i]),
      precipitation: daily.precipitation_sum?.[i] ?? 0,
      weathercode: daily.weathercode[i],
    }));
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
  if (tempC < 22) return { layer: "light-jacket", label: "Light jacket recommended" };
  return { layer: "none", label: "No extra layer needed" };
}

export function formatWeatherText(weather) {
  if (!weather) return null;
  const rec = getLayerRecommendation(weather.tempC);
  const city = weather.cityName ? `${weather.cityName} · ` : "";
  return `${city}${weather.tempC}°C ${weather.description} — ${rec.label}`;
}
