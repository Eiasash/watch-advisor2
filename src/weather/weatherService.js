/**
 * Weather service — fetches current conditions using Open-Meteo API.
 * Uses browser geolocation. Runs in background — never blocks UI.
 *
 * All external fetches have an 8s AbortSignal timeout so a slow/unreachable
 * API never hangs indefinitely. Errors are swallowed inside the function so
 * callers get null rather than an unhandled rejection that pollutes error logs.
 */

const WEATHER_TIMEOUT_MS = 8000;

function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

async function getCoords() {
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 10000,
        maximumAge: 300000,
      });
    });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch (_) {
    // Geolocation denied or timed out — fallback to Jerusalem
    return { latitude: 31.7683, longitude: 35.2137 };
  }
}

/**
 * Fetch current weather.
 * @returns {{ tempC: number, description: string, weathercode: number } | null}
 */
export async function fetchWeather() {
  const { latitude, longitude } = await getCoords();

  let cw;
  try {
    const res = await timedFetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
    );
    const data = await res.json();
    cw = data.current_weather;
    if (!cw) throw new Error("No current_weather in response");
  } catch (err) {
    // Network error, timeout, or bad response — non-fatal, caller handles null
    console.warn("[weather] fetchWeather failed:", err.message);
    return null;
  }

  // Reverse geocode — best-effort, 5s timeout, never blocks
  let cityName = null;
  try {
    const geo = await timedFetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
      { headers: { "Accept-Language": "en" } }
    );
    const geoData = await geo.json();
    cityName = geoData?.address?.city
      ?? geoData?.address?.town
      ?? geoData?.address?.village
      ?? geoData?.address?.county
      ?? null;
  } catch (_) { /* non-fatal */ }

  return {
    tempC: cw.temperature,
    description: weatherCodeToDescription(cw.weathercode),
    weathercode: cw.weathercode,
    cityName,
    latitude,
    longitude,
  };
}

function weatherCodeToDescription(code) {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 49) return "Foggy";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

/**
 * Weather-based layering rules.
 */
export function getLayerRecommendation(tempC) {
  if (tempC < 10) return { layer: "coat", label: "Heavy coat recommended" };
  if (tempC < 16) return { layer: "sweater", label: "Sweater recommended" };
  if (tempC < 22) return { layer: "light-jacket", label: "Light jacket recommended" };
  return { layer: "none", label: "No extra layer needed" };
}

/**
 * Fetch 7-day weather forecast (daily min/max/avg temp + weather codes).
 * Returns array of { date, tempC, tempMin, tempMax, description } or []
 */
export async function fetchWeatherForecast() {
  const { latitude, longitude } = await getCoords();

  try {
    const res = await timedFetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum&timezone=auto`
    );
    const data = await res.json();
    const daily = data.daily;
    if (!daily?.time) return [];

    return daily.time.map((date, i) => {
      const max = daily.temperature_2m_max[i];
      const min = daily.temperature_2m_min[i];
      return {
        date,
        tempC: Math.round((max + min) / 2),
        tempMin: Math.round(min),
        tempMax: Math.round(max),
        description: weatherCodeToDescription(daily.weathercode[i]),
        precipitation: daily.precipitation_sum?.[i] ?? 0,
        weathercode: daily.weathercode[i],
      };
    });
  } catch (err) {
    console.warn("[weather] fetchWeatherForecast failed:", err.message);
    return [];
  }
}

/**
 * Format weather display text.
 */
export function formatWeatherText(weather) {
  if (!weather) return null;
  const rec = getLayerRecommendation(weather.tempC);
  const city = weather.cityName ? `${weather.cityName} · ` : "";
  return `${city}${weather.tempC}°C ${weather.description} — ${rec.label}`;
}
