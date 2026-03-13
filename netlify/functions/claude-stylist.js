import { callClaude } from "./_claudeClient.js";
/**
 * Netlify serverless function — Claude AI Stylist.
 * Validates/improves the engine's outfit pick around the selected watch.
 * Enforces strap-shoe rule, dial color coordination, formality match.
 *
 * POST body: { garments, watch, weather, engineOutfit, dayProfile, pinnedSlots }
 * Returns: { shirt, pants, shoes, jacket, explanation, strapShoeOk }
 */

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*" /* supports preview deploys + local dev */,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { garments = [], watch, weather, engineOutfit = {}, dayProfile = "smart-casual", pinnedSlots = {} } = JSON.parse(event.body);

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }, body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }) };
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

    // Describe the engine's current picks, marking pinned (user-chosen) slots
    const engineLines = ["shirt", "sweater", "pants", "shoes", "jacket"]
      .map(slot => {
        const g = engineOutfit[slot];
        const isPinned = !!pinnedSlots[slot];
        if (!g) return `  ${slot}: (none available)`;
        return `  ${slot}: ID:${g.name} — ${g.color ?? ""} ${g.type ?? ""}${isPinned ? " [PINNED — user chose this, keep it]" : ""}`;
      })
      .join("\n");

    const hasPinned = Object.keys(pinnedSlots).length > 0;
    const pinnedInstruction = hasPinned
      ? `\nIMPORTANT: Slots marked [PINNED] are the user's deliberate choice — do NOT change them. Only suggest improvements for unpinned slots to best complement the pinned items.`
      : "";

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
${pinnedInstruction}

FULL WARDROBE (ID — description):
${garmentLines}

TASK:
1. Respect ALL [PINNED] slots — return their exact ID unchanged.
2. For unpinned slots: evaluate the engine's pick against dial color, formality, strap rule, and pinned items. Improve if a clearly better match exists in the wardrobe.
3. Enforce the strap-shoe rule strictly — fix violations in unpinned shoe slot only.
4. Return IDs exactly as they appear (the "ID:XXXXX" values, without the "ID:" prefix).
5. In the explanation, specifically mention dial color coordination and any pinned-item logic you used.

Return ONLY valid JSON, no markdown, no commentary outside the JSON:
{
  "shirt": "<garment ID or null>",
  "sweater": "<garment ID or null>",
  "pants": "<garment ID or null>",
  "shoes": "<garment ID or null>",
  "jacket": "<garment ID or null>",
  "strapShoeOk": true or false,
  "explanation": "<2-3 sentences: why these pieces work with the specific watch, dial color, context and pinned choices. Direct and specific.>"
}`;

    const data = await callClaude(apiKey, {
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      });

    const text = data?.content?.[0]?.text ?? "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return {
          statusCode: 200,
          headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
          body: JSON.stringify(JSON.parse(jsonMatch[0])),
        };
      } catch (_) {
        // Truncated JSON — attempt repair
        let repaired = jsonMatch[0];
        const opens = (repaired.match(/\{/g) || []).length;
        const closes = (repaired.match(/\}/g) || []).length;
        for (let i = 0; i < opens - closes; i++) repaired += "}";
        repaired = repaired.replace(/,\s*([}\]])/g, "$1");
        try {
          return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
            body: JSON.stringify({ ...JSON.parse(repaired), _repaired: true }),
          };
        } catch (__) { /* fall through to text response */ }
      }
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ shirt: null, pants: null, shoes: null, jacket: null, explanation: text }),
    };
  } catch (err) {
    const isClaudeError = err.message?.startsWith('Claude API error') || err.message?.startsWith('BILLING:');
    return {
      statusCode: isClaudeError ? 502 : 500,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
