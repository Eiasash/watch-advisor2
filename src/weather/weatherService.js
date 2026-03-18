/**
 * Weather service — fetches current conditions using Open-Meteo API.
 * Uses browser geolocation. Runs in background — never blocks UI.
 *
 * Network errors are fully swallowed inside each exported function.
 * The Netlify RUM window.fetch monkey-patch is bypassed by catching
 * rejections at the lowest level before they propagate to global handlers.
 */

const WEATHER_TIMEOUT_MS = 8000;

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
    return { latitude: 31.7683, longitude: 35.2137 };
  }
}

/**
 * fetch() wrapped so all errors — including network failures — are caught
 * before the Netlify RUM window.fetch proxy can intercept them.
 * Returns a settled promise that always resolves (to response or null).
 */
async function safeFetchWeather(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (_) {
    return null; // network error or abort — caller handles null
  } finally {
    clearTimeout(id);
  }
}

/**
 * Fetch current weather.
 * @returns {{ tempC, description, weathercode, cityName, latitude, longitude } | null}
 */
export async function fetchWeather() {
  try {
    const { latitude, longitude } = await getCoords();

    const res = await safeFetchWeather(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
    );
    if (!res) throw new Error("network unavailable");
    const data = await res.json();
    const cw = data.current_weather;
    if (!cw) throw new Error("no current_weather in response");

    let cityName = null;
    try {
      const geo = await safeFetchWeather(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        { headers: { "Accept-Language": "en" } }
      );
      if (geo) {
        const geoData = await geo.json();
        cityName = geoData?.address?.city
          ?? geoData?.address?.town
          ?? geoData?.address?.village
          ?? geoData?.address?.county
          ?? null;
      }
    } catch (_) { /* non-fatal */ }

    return {
      tempC: cw.temperature,
      description: weatherCodeToDescription(cw.weathercode),
      weathercode: cw.weathercode,
      cityName,
      latitude,
      longitude,
    };
  } catch (err) {
    console.warn("[weather] fetchWeather failed:", err.message);
    return null;
  }
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

export function getLayerRecommendation(tempC) {
  if (tempC < 10) return { layer: "coat", label: "Heavy coat recommended" };
  if (tempC < 16) return { layer: "sweater", label: "Sweater recommended" };
  if (tempC < 22) return { layer: "light-jacket", label: "Light jacket recommended" };
  return { layer: "none", label: "No extra layer needed" };
}

/**
 * Fetch 7-day forecast.
 * @returns {Array}
 */
export async function fetchWeatherForecast() {
  try {
    const { latitude, longitude } = await getCoords();
    const res = await safeFetchWeather(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum&timezone=auto`
    );
    if (!res) return [];
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

export function formatWeatherText(weather) {
  if (!weather) return null;
  const rec = getLayerRecommendation(weather.tempC);
  const city = weather.cityName ? `${weather.cityName} · ` : "";
  return `${city}${weather.tempC}°C ${weather.description} — ${rec.label}`;
}
