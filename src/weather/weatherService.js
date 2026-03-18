/**
 * Weather service — fetches current conditions using Open-Meteo API.
 * Uses browser geolocation. Runs in background — never blocks UI.
 *
 * All network errors are caught inside fetchWeather/fetchWeatherForecast
 * and converted to null/[] returns. Callers never see rejections.
 * Netlify RUM cannot intercept errors that are caught before propagating.
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

// Wraps fetch with a race-based timeout — avoids AbortController which
// can fire unhandled rejections that Netlify RUM intercepts at window.fetch
// before our catch blocks run.
function fetchWithTimeout(url, options = {}) {
  const fetchPromise = fetch(url, options);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("weather fetch timeout")), WEATHER_TIMEOUT_MS)
  );
  return Promise.race([fetchPromise, timeoutPromise]);
}

/**
 * Fetch current weather.
 * @returns {{ tempC, description, weathercode, cityName, latitude, longitude } | null}
 */
export async function fetchWeather() {
  try {
    const { latitude, longitude } = await getCoords();

    const res = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
    );
    const data = await res.json();
    const cw = data.current_weather;
    if (!cw) throw new Error("No current_weather in response");

    // Reverse geocode — best-effort
    let cityName = null;
    try {
      const geo = await fetchWithTimeout(
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
 * @returns {Array<{date, tempC, tempMin, tempMax, description, precipitation, weathercode}>}
 */
export async function fetchWeatherForecast() {
  try {
    const { latitude, longitude } = await getCoords();
    const res = await fetchWithTimeout(
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

export function formatWeatherText(weather) {
  if (!weather) return null;
  const rec = getLayerRecommendation(weather.tempC);
  const city = weather.cityName ? `${weather.cityName} · ` : "";
  return `${city}${weather.tempC}°C ${weather.description} — ${rec.label}`;
}
