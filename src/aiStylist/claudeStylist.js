/**
 * Claude AI Stylist client.
 * Sends engine's current outfit to the Netlify function for validation/improvement.
 */

export async function getAISuggestion(garments, watch, weather, engineOutfit = {}, dayProfile = "smart-casual", pinnedSlots = {}) {
  try {
    const res = await fetch("/.netlify/functions/claude-stylist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        garments: garments
          .filter(g => !["outfit-photo","outfit-shot","belt","sunglasses","hat","scarf","bag","accessory"].includes(g.type ?? g.category))
          .map(g => ({
            name: g.name,
            type: g.type ?? g.category,
            color: g.color,
            formality: g.formality,
          })),
        watch,
        weather,
        engineOutfit: {
          shirt:   engineOutfit.shirt   ? { name: engineOutfit.shirt.name,   type: engineOutfit.shirt.type,   color: engineOutfit.shirt.color   } : null,
          sweater: engineOutfit.sweater ? { name: engineOutfit.sweater.name, type: engineOutfit.sweater.type, color: engineOutfit.sweater.color } : null,
          pants:   engineOutfit.pants   ? { name: engineOutfit.pants.name,   type: engineOutfit.pants.type,   color: engineOutfit.pants.color   } : null,
          shoes:   engineOutfit.shoes   ? { name: engineOutfit.shoes.name,   type: engineOutfit.shoes.type,   color: engineOutfit.shoes.color   } : null,
          jacket:  engineOutfit.jacket  ? { name: engineOutfit.jacket.name,  type: engineOutfit.jacket.type,  color: engineOutfit.jacket.color  } : null,
        },
        pinnedSlots: Object.fromEntries(
          Object.entries(pinnedSlots).map(([k, g]) => [k, g ? { name: g.name, type: g.type, color: g.color } : null])
        ),
        dayProfile,
      }),
    });

    if (!res.ok) {
      console.warn("[aiStylist] request failed:", res.status);
      return null;
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) {
      console.warn("[aiStylist] non-JSON response:", ct);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.warn("[aiStylist] error:", err.message);
    return null;
  }
}
