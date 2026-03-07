/**
 * Weather service — fetches current conditions using Open-Meteo API.
 * Uses browser geolocation. Runs in background — never blocks UI.
 */

/**
 * Fetch current weather.
 * @returns {{ tempC: number, description: string, weathercode: number }}
 */
export async function fetchWeather() {
  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10000,
      maximumAge: 300000,
    });
  });

  const { latitude, longitude } = position.coords;
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
  );
  const data = await res.json();
  const cw = data.current_weather;

  return {
    tempC: cw.temperature,
    description: weatherCodeToDescription(cw.weathercode),
    weathercode: cw.weathercode,
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
 * Format weather display text.
 */
export function formatWeatherText(weather) {
  if (!weather) return null;
  const rec = getLayerRecommendation(weather.tempC);
  return `${weather.tempC}°C ${weather.description} — ${rec.label}`;
}
