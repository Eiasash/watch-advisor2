/**
 * Fetches current weather using browser geolocation + Open-Meteo API.
 * Runs in background — never blocks UI.
 */

export async function getWeather() {
  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10000,
      maximumAge: 300000, // 5 min cache
    });
  });

  const { latitude, longitude } = position.coords;

  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
  );

  const data = await res.json();
  return data.current_weather;
}
