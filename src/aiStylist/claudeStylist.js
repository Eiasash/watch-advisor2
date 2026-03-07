/**
 * Claude AI Stylist client.
 * Sends engine's current outfit to the Netlify function for validation/improvement.
 */

export async function getAISuggestion(garments, watch, weather, engineOutfit = {}, dayProfile = "smart-casual") {
  try {
    const res = await fetch("/.netlify/functions/claude-stylist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        garments: garments
          .filter(g => g.type !== "outfit-photo" && g.type !== "outfit-shot")
          .map(g => ({
            name: g.name,
            type: g.type ?? g.category,
            color: g.color,
            formality: g.formality,
          })),
        watch,
        weather,
        engineOutfit: {
          shirt:  engineOutfit.shirt  ? { name: engineOutfit.shirt.name,  type: engineOutfit.shirt.type,  color: engineOutfit.shirt.color  } : null,
          pants:  engineOutfit.pants  ? { name: engineOutfit.pants.name,  type: engineOutfit.pants.type,  color: engineOutfit.pants.color  } : null,
          shoes:  engineOutfit.shoes  ? { name: engineOutfit.shoes.name,  type: engineOutfit.shoes.type,  color: engineOutfit.shoes.color  } : null,
          jacket: engineOutfit.jacket ? { name: engineOutfit.jacket.name, type: engineOutfit.jacket.type, color: engineOutfit.jacket.color } : null,
        },
        dayProfile,
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
