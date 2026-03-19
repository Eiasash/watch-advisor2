/**
 * Thin wrapper around weatherService for backwards compatibility.
 * Uses browser geolocation + Open-Meteo API.
 */

export async function getWeather() {
  const coords = await new Promise((res, rej) =>
    navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
  );
  const { latitude, longitude } = coords.coords;
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
  );
  const data = await response.json();
  return data.current_weather;
}
