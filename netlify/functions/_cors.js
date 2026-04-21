/**
 * Shared CORS configuration for browser-called Netlify functions.
 *
 * Locks requests to the production domain + Netlify deploy previews.
 * Local dev (localhost:5173) included for Vite dev server.
 *
 * Usage in every browser-called function:
 *   import { cors } from "./_cors.js";
 *   const CORS = cors(event);
 */

const ALLOWED_ORIGINS = new Set([
  "https://watch-advisor2.netlify.app",
  "http://localhost:5173",
  "http://localhost:4173",
]);

/**
 * Returns CORS headers with origin validation.
 * Deploy-preview URLs (*.netlify.app) are also allowed.
 *
 * @param {object} event — Netlify function event
 * @returns {object} headers object with validated origin
 */
export function cors(event) {
  const origin = event?.headers?.origin ?? "";
  const allowed =
    ALLOWED_ORIGINS.has(origin) ||
    /^https:\/\/[a-z0-9-]+--watch-advisor2\.netlify\.app$/.test(origin);

  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://watch-advisor2.netlify.app",
    "Access-Control-Allow-Headers": "Content-Type, x-api-secret",
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}
