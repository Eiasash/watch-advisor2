/**
 * extract-outfit — Netlify function
 * Takes a selfie/outfit photo + user's wardrobe, returns garment matches.
 * Called from SelfiePanel "👕 Use as Today's Outfit" button.
 */
import { callClaude, extractText } from "./_claudeClient.js";
import { cors } from "./_cors.js";
import { requireUser } from "./_auth.js";


export async function handler(event) {
  const CORS = cors(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS };
  }

  const auth = await requireUser(event);
  if (auth.error) return { statusCode: auth.statusCode, headers: CORS, body: JSON.stringify({ error: auth.error }) };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }) };
  }

  let image, garments;
  try {
    ({ image, garments } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!image) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing image" }) };
  }

  // Strip data URL prefix if present
  const base64 = image.includes(",") ? image.split(",")[1] : image;

  // Build garment list — filter out non-wearable items
  const wearable = (garments ?? []).filter(g => !g.excludeFromWardrobe && g.type !== "outfit-photo");

  // Build garment reference with richer metadata
  const garmentList = wearable
    .map(g => `  [${g.id}] ${g.name ?? "?"} — ${g.color ?? "?"} ${g.type ?? "?"} (formality ${g.formality ?? 5}${g.material ? `, ${g.material}` : ""}${g.subtype ? `, ${g.subtype}` : ""})`)
    .join("\n");

  // Include garment thumbnails for visual matching — up to 20 most relevant
  // Sort by type priority (outfit slot types first) then limit to control payload size
  const TYPE_PRIORITY = { shirt: 0, sweater: 1, pants: 2, shoes: 3, jacket: 4, belt: 5 };
  const withThumbnails = wearable
    .filter(g => g.thumbnail && g.thumbnail.startsWith("data:"))
    .sort((a, b) => (TYPE_PRIORITY[a.type] ?? 9) - (TYPE_PRIORITY[b.type] ?? 9))
    .slice(0, 20);

  // Build image blocks for garment thumbnails
  const garmentImageBlocks = [];
  for (const g of withThumbnails) {
    const b64 = g.thumbnail.replace(/^data:image\/\w+;base64,/, "");
    const mediaType = g.thumbnail.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    garmentImageBlocks.push(
      { type: "text", text: `--- GARMENT [${g.id}] "${g.name}" (${g.color} ${g.type}) ---` },
      { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } }
    );
  }

  const prompt = `You are analyzing an outfit/selfie photo to identify which SPECIFIC garments from the user's wardrobe are being worn.

USER'S WARDROBE (match against these EXACT items):
${garmentList}

${withThumbnails.length > 0 ? `GARMENT REFERENCE PHOTOS: ${withThumbnails.length} garment thumbnails are shown above. Use these to VISUALLY match texture, pattern, color, and material against what you see in the outfit photo.\n` : ""}
TASK:
1. Examine the outfit photo carefully — identify every visible garment by type, color, texture, and pattern.
2. For each visible garment, compare against BOTH the text descriptions AND the reference photos.
3. Match by: visual similarity (most important), then color match, type match, and texture/pattern cues.
4. Only return matches with reasonable confidence. Skip items you can't identify.

COLOR PRECISION:
- navy ≠ black, cream ≠ white, olive ≠ khaki, charcoal ≠ black
- Look at the actual color in the photo, not assumptions
- Consider lighting conditions — indoor photos may shift colors

TEXTURE/PATTERN MATCHING:
- Cable knit vs ribbed vs smooth knit — these are distinct, don't confuse them
- Plaid vs checked vs windowpane — look at the scale and pattern
- Match visible fabric weight: chunky knit ≠ thin jersey

Return ONLY a JSON array, no markdown:
[
  { "garmentId": "<exact ID from wardrobe list>", "confidence": <1-10>, "reason": "<what you see that matches — mention color, texture, pattern observations>" },
  ...
]

Focus on: outermost top layer, mid-layer (sweater/knit), base shirt, pants, shoes, belt. Skip accessories unless clearly visible.`;

  try {
    // Build content: selfie photo first, then garment reference photos, then prompt
    const contentBlocks = [
      { type: "text", text: "OUTFIT PHOTO TO ANALYZE:" },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
      ...garmentImageBlocks,
      { type: "text", text: prompt },
    ];

    const resp = await callClaude(apiKey, {
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: contentBlocks,
      }],
    }, { maxAttempts: 1 });

    const raw = extractText(resp, "[]");
    let detected;
    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      detected = JSON.parse(clean);
    } catch {
      detected = [];
    }

    // Claude returns garmentId directly — validate they exist in the wardrobe
    const validIds = new Set((garments ?? []).map(g => g.id));
    const matches = (Array.isArray(detected) ? detected : [])
      .filter(d => d.garmentId && validIds.has(d.garmentId) && (d.confidence ?? 0) >= 4)
      .map(d => ({ garmentId: d.garmentId, confidence: d.confidence, reason: d.reason }));

    // Deduplicate — keep highest confidence per garmentId
    const deduped = [];
    const seen = new Set();
    for (const m of matches.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))) {
      if (!seen.has(m.garmentId)) {
        seen.add(m.garmentId);
        deduped.push(m);
      }
    }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ matches: deduped, detected }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
