/**
 * Weather service — fetches current conditions using Open-Meteo API.
 * Uses browser geolocation. Runs in background — never blocks UI.
 */

/**
 * Fetch current weather.
 * @returns {{ tempC: number, description: string, weathercode: number }}
 */
export async function fetchWeather() {
  let latitude, longitude;
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 10000,
        maximumAge: 300000,
      });
    });
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;
  } catch (_) {
    // Geolocation denied or timed out — fallback to Jerusalem
    latitude = 31.7683;
    longitude = 35.2137;
  }

  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
  );
  const data = await res.json();
  const cw = data.current_weather;

  // Reverse geocode — best-effort, never blocks
  let cityName = null;
  try {
    const geo = await fetch(
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
 * temp < 10 → coat
 * temp < 16 → sweater
 * temp < 22 → light jacket
 * else → no layer
 */
export function getLayerRecommendation(tempC) {
  if (tempC < 10) return { layer: "coat", label: "Heavy coat recommended" };
  if (tempC < 16) return { layer: "sweater", label: "Sweater recommended" };
  if (tempC < 22) return { layer: "light-jacket", label: "Light jacket recommended" };
  return { layer: "none", label: "No extra layer needed" };
}

/**
 * Fetch 7-day weather forecast (daily min/max/avg temp + weather codes).
 * Returns array of { date, tempC, tempMin, tempMax, description }
 */
export async function fetchWeatherForecast() {
  let latitude, longitude;
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 10000,
        maximumAge: 300000,
      });
    });
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;
  } catch (_) {
    latitude = 31.7683;
    longitude = 35.2137;
  }
  const res = await fetch(
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
