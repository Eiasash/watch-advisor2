import { callClaude } from "./_claudeClient.js";
/**
 * Netlify serverless function — Claude AI Stylist.
 * Validates/improves the engine's outfit pick around the selected watch.
 * Enforces strap-shoe rule, dial color coordination, formality match.
 *
 * POST body: { garments, watch, weather, engineOutfit, dayProfile }
 * Returns: { shirt, pants, shoes, jacket, explanation, strapShoeOk }
 */

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { garments = [], watch, weather, engineOutfit = {}, dayProfile = "smart-casual" } = JSON.parse(event.body);

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }) };
    }

    // Build a readable garment list with type+color context
    const garmentLines = garments
      .filter(g => !["outfit-photo","outfit-shot","belt","sunglasses","hat","scarf","bag","accessory"].includes(g.type ?? g.category))
      .map(g => {
        const type  = g.type ?? g.category ?? "?";
        const color = g.color ?? "unknown color";
        const form  = g.formality ?? 5;
        return `  ID:${g.name} — ${color} ${type} (formality ${form}/10)`;
      })
      .join("\n");

    // Describe the engine's current picks
    const engineLines = ["shirt", "pants", "shoes", "jacket"]
      .map(slot => {
        const g = engineOutfit[slot];
        if (!g) return `  ${slot}: (none available)`;
        return `  ${slot}: ID:${g.name} — ${g.color ?? ""} ${g.type ?? ""}`;
      })
      .join("\n");

    // watch.strap = active strap string enriched by WatchDashboard (e.g. "brown leather", "teal leather", "bracelet")
    // watch._activeStrapLabel = human label (e.g. "Dark teal Buttero leather", "Steel bracelet")
    const activeStrapLabel = watch?._activeStrapLabel ?? watch?.strap ?? "bracelet";
    const watchDesc = watch
      ? `${watch.brand} ${watch.model} · ${watch.dial} dial · ${watch.style} style · formality ${watch.formality}/10 · active strap: ${activeStrapLabel}`
      : "No watch";

    const strapRule = (() => {
      const strap = (watch?.strap ?? "").toLowerCase();
      const isLeather = strap.includes("leather") || strap.includes("alligator")
        || strap.includes("calfskin") || strap.includes("nato")
        || strap.includes("canvas") || strap.includes("suede");
      if (isLeather) {
        const strapColor = strap.includes("black") ? "black"
          : (strap.includes("brown") || strap.includes("tan") || strap.includes("cognac")
             || strap.includes("honey") || strap.includes("caramel")) ? "brown"
          : null; // non-standard color
        if (!strapColor) {
          return "STRAP-SHOE RULE: non-standard strap color (" + activeStrapLabel + "). Prefer white sneakers. Avoid strict black/brown shoe enforcement.";
        }
        return "STRAP-SHOE RULE (non-negotiable): " + activeStrapLabel + " strap — shoes MUST be " + strapColor + " leather. Flag any violation.";
      }
      return "Strap-shoe rule: " + activeStrapLabel + " — bracelet/integrated, shoe color unrestricted.";
    })();

    const contextLabel = {
      "hospital-smart-casual": "hospital smart casual (professional medical environment)",
      "smart-casual":  "smart casual",
      "formal":        "formal",
      "casual":        "casual / weekend",
      "travel":        "travel",
    }[dayProfile] ?? dayProfile;

    const prompt = `You are an expert menswear stylist specializing in watch-first coordination.

WATCH:
${watchDesc}

STRAP RULE:
${strapRule}

CONTEXT: ${contextLabel}
WEATHER: ${weather?.tempC != null ? `${weather.tempC}°C, ${weather.description ?? ""}` : "unknown"}

ENGINE'S CURRENT OUTFIT PICK:
${engineLines}

FULL WARDROBE (ID — description):
${garmentLines}

TASK:
1. Evaluate whether the engine's outfit is well-matched to the watch dial color, formality level, and strap rule.
2. If it's good, keep those items and explain why.
3. If a slot can be improved, swap to a specific better item from the wardrobe and explain the reason.
4. Check the strap-shoe rule strictly — if violated, flag it and fix it.
5. Return IDs exactly as they appear (the "ID:XXXXX" values, without the "ID:" prefix).

Return ONLY valid JSON, no markdown, no commentary outside the JSON:
{
  "shirt": "<garment ID or null>",
  "pants": "<garment ID or null>",
  "shoes": "<garment ID or null>",
  "jacket": "<garment ID or null>",
  "strapShoeOk": true or false,
  "explanation": "<2-3 sentences: why these pieces work with the specific watch, dial color, and context. Be direct and specific — mention the dial color, strap, and any formality trade-offs.>"
}`;

    const data = await callClaude(apiKey, {
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      });

    const text = data?.content?.[0]?.text ?? "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(JSON.parse(jsonMatch[0])),
      };
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ shirt: null, pants: null, shoes: null, jacket: null, explanation: text }),
    };
  } catch (err) {
    const isClaudeError = err.message?.startsWith("Claude API error");
    return {
      statusCode: isClaudeError ? 502 : 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
