/**
 * Netlify function — seasonal-audit
 * Analyzes wardrobe usage for the current season and returns:
 * - Never-worn garments this season
 * - Over-worn garments (10+ times)
 * - Wardrobe gaps (missing color/category combos)
 * - Watch utilization stats
 *
 * POST body: { season?: "spring"|"summer"|"autumn"|"winter" }
 */
import { createClient } from "@supabase/supabase-js";
import { cors } from "./_cors.js";
import { requireUser } from "./_auth.js";


function getCurrentSeason() {
  const month = new Date().getMonth(); // 0-11
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

function sb() {
  return createClient(
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  );
}

export async function handler(event) {
  const CORS = cors(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "POST only" }) };

  const auth = await requireUser(event);
  if (auth.error) return { statusCode: auth.statusCode, headers: CORS, body: JSON.stringify({ error: auth.error }) };

  try {
    const body = JSON.parse(event.body ?? "{}");
    const season = body.season ?? getCurrentSeason();
    const supabase = sb();

    // Get all active garments
    const { data: garments } = await supabase
      .from("garments")
      .select("id,name,type,category,color,brand,seasons,contexts,material,weight,notes")
      .or("exclude_from_wardrobe.is.null,exclude_from_wardrobe.eq.false")
      .not("type", "in", "(outfit-photo,outfit-shot,watch)");

    // Get history for last 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const { data: history } = await supabase
      .from("history")
      .select("date,watch_id,payload")
      .gte("date", ninetyDaysAgo)
      .order("date", { ascending: false });

    // Count garment wear frequency
    const wearCount = {};
    for (const entry of (history ?? [])) {
      const ids = entry.payload?.garmentIds ?? [];
      for (const id of ids) {
        wearCount[id] = (wearCount[id] ?? 0) + 1;
      }
    }

    // Categorize garments
    const activeGarments = (garments ?? []).filter(g => {
      const cat = g.type ?? g.category;
      return !["belt", "sunglasses", "hat", "scarf", "bag", "accessory"].includes(cat);
    });

    const neverWorn = activeGarments.filter(g => !wearCount[g.id]);
    const overWorn = activeGarments
      .filter(g => (wearCount[g.id] ?? 0) >= 10)
      .map(g => ({ name: g.name, color: g.color, category: g.type ?? g.category, count: wearCount[g.id] }))
      .sort((a, b) => b.count - a.count);

    // Season-inappropriate items being worn
    const seasonMismatch = activeGarments.filter(g => {
      if (!wearCount[g.id]) return false;
      const seasons = g.seasons ?? [];
      if (!seasons.length) return false;
      return !seasons.includes(season) && !seasons.includes("all-season");
    }).map(g => ({ name: g.name, seasons: g.seasons, wornCount: wearCount[g.id] }));

    // Wardrobe gaps — color families per category
    const colorsByCategory = {};
    for (const g of activeGarments) {
      const cat = g.type ?? g.category;
      if (!colorsByCategory[cat]) colorsByCategory[cat] = new Set();
      colorsByCategory[cat].add((g.color ?? "").toLowerCase());
    }

    const gaps = [];
    const desiredColors = {
      shirt: ["white", "light blue", "navy", "olive", "teal", "cream"],
      sweater: ["navy", "black", "cream", "olive", "burgundy", "grey"],
      pants: ["navy", "khaki", "grey", "stone", "olive"],
    };
    for (const [cat, colors] of Object.entries(desiredColors)) {
      const have = colorsByCategory[cat] ?? new Set();
      for (const c of colors) {
        if (![...have].some(h => h.includes(c))) {
          gaps.push({ category: cat, missingColor: c });
        }
      }
    }

    // Watch utilization
    const watchWears = {};
    for (const entry of (history ?? [])) {
      if (entry.watch_id) {
        watchWears[entry.watch_id] = (watchWears[entry.watch_id] ?? 0) + 1;
      }
    }

    const result = {
      season,
      periodDays: 90,
      totalGarments: activeGarments.length,
      totalOutfits: (history ?? []).length,
      neverWorn: neverWorn.map(g => ({
        name: g.name, color: g.color, category: g.type ?? g.category, brand: g.brand,
      })),
      neverWornCount: neverWorn.length,
      neverWornPct: Math.round((neverWorn.length / activeGarments.length) * 100),
      overWorn,
      seasonMismatch,
      gaps,
      watchUtilization: watchWears,
    };

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
}
