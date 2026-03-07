/**
 * Claude AI Stylist client.
 * Calls the Netlify function to get AI-powered outfit suggestions.
 */

/**
 * Request an AI outfit suggestion from Claude.
 *
 * @param {Array} garments - User's wardrobe garments
 * @param {object} watch - Selected watch
 * @param {object} weather - Current weather { tempC, description }
 * @returns {{ shirt, pants, shoes, jacket, explanation }}
 */
export async function getAISuggestion(garments, watch, weather) {
  try {
    const res = await fetch("/.netlify/functions/claude-stylist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        garments: garments.map(g => ({
          name: g.name,
          type: g.type ?? g.category,
          color: g.color,
          formality: g.formality,
        })),
        watch,
        weather,
      }),
    });

    if (!res.ok) {
      console.warn("[aiStylist] request failed:", res.status);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.warn("[aiStylist] error:", err.message);
    return null;
  }
}
