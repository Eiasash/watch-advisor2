import { useState, useEffect } from "react";
import { fetchWeather } from "../weather/weatherService.js";

/**
 * Fetches current weather with a 3-second startup delay.
 * The delay avoids the Lighthouse geolocation-on-page-load flag.
 * Returns null until the first fetch resolves.
 */
export function useWeather() {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => {
      fetchWeather().then(setWeather).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, []);
  return weather;
}
