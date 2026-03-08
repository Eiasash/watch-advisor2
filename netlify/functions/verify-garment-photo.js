/**
 * Netlify function — AI garment photo verifier.
 * Takes a garment's thumbnail + current labels, asks Claude Vision if they're correct.
 * Returns: { ok, correctedType, correctedColor, correctedName, confidence, reason }
 *
 * POST body: { imageUrl, imageBase64, currentType, currentColor, currentName, garmentId, hash }
 *
 * Cache: Results are stored in Netlify Blobs keyed by garment hash.
 * Same photo = instant cache hit, zero Claude API call.
 */

import { cacheGet, cacheSet } from "./_blobCache.js";
import { callClaude } from "./_claudeClient.js";

const VALID_TYPES  = ["shirt","pants","shoes","jacket","sweater","belt","sunglasses","hat","scarf","bag","accessory","watch","outfit-photo"];
const VALID_COLORS = ["black","white","navy","blue","grey","brown","tan","beige","cream","ecru",
                      "green","olive","teal","khaki","stone","burgundy","red","pink","orange",
                      "yellow","purple","charcoal","dark brown","light blue","dark navy","coral",
                      "multicolor","camel","rust","maroon","ivory","slate","mint","lavender",
                      "sage","wine","taupe","cognac","sand","pewter","silver","gold","denim"];

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type" } };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { imageUrl, imageBase64, currentType, currentColor, currentName, garmentId, hash, neighbors: rawNeighbors } = JSON.parse(event.body ?? "{}");

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "CLAUDE_API_KEY not set" }) };

    // ── Cache check ──────────────────────────────────────────────────────────
    // Key by garment hash (dHash of photo) — same image = same result forever.
    const cacheKey = hash ? `verify:${hash}` : null;
    if (cacheKey) {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "X-Cache": "HIT" },
          body: JSON.stringify({ garmentId, ...cached, _cached: true }),
        };
      }
    }

    // Build image content block — prefer base64, fall back to URL
    let imageBlock;
    if (imageBase64) {
      const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const mediaType = imageBase64.startsWith("data:image/png") ? "image/png" : "image/jpeg";
      imageBlock = { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } };
    } else if (imageUrl) {
      // Fetch the image and convert to base64
      const imgRes = await fetch(imageUrl);
      const buf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const ct = imgRes.headers.get("content-type") || "image/jpeg";
      imageBlock = { type: "image", source: { type: "base64", media_type: ct, data: b64 } };
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: "No image provided" }) };
    }

    // Build neighbor context for angle/dupe detection
    const neighbors = Array.isArray(rawNeighbors) ? rawNeighbors : [];
    const neighborCtx = neighbors.length > 0
      ? `\nNEARBY GARMENTS (same hash neighborhood — check for duplicates/angles):\n${neighbors.map(n => `- [${n.id}] "${n.name}" type=${n.type} color=${n.color} hash=${n.hash ?? "none"}`).join("\n")}\n`
      : "";

    const prompt = `You are a wardrobe AI classifying garment photos. Current labels for this item:
- Type: ${currentType ?? "unknown"}
- Color: ${currentColor ?? "unknown"}
- Name: ${currentName ?? "unknown"}
- Hash: ${hash ?? "none"}
${neighborCtx}
Look at the photo carefully and respond with ONLY a JSON object (no markdown, no extra text):

{
  "ok": true/false,
  "correctedType": "${currentType ?? "shirt"}" (use current if correct, else one of: ${VALID_TYPES.join(", ")}),
  "correctedColor": "${currentColor ?? "black"}" (use current if correct, else one of: ${VALID_COLORS.join(", ")}),
  "correctedName": "${currentName ?? ""}" (short descriptive name, max 5 words),
  "confidence": 0.0-1.0,
  "reason": "one sentence: what you see and whether labels match",
  "isAngleShot": false (true if this looks like a different angle of the same garment as a neighbor),
  "angleOfId": null (if isAngleShot=true, the neighbor ID this is an angle of),
  "isDuplicate": false (true if this is an exact or near-exact duplicate photo of a neighbor),
  "duplicateOfId": null (if isDuplicate=true, the neighbor ID this duplicates)
}

Rules:
- Set ok=true ONLY if type AND color are both correct.
- Set ok=false if type or color is wrong.
- isAngleShot=true when the photo shows the SAME garment from a different angle (e.g. front vs back, folded vs flat).
- isDuplicate=true when photos are near-identical (same angle, same lighting, same garment).
- Use the hash values: if two items have very similar hashes, they are likely the same photo.`;

    const res = await callClaude(apiKey, {
        model: "claude-sonnet-4-20250514",
        max_tokens: 256,
        messages: [{ role: "user", content: [imageBlock, { type: "text", text: prompt }] }],
      });


    const raw  = res.content?.[0]?.text ?? "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // ── Cache write ──────────────────────────────────────────────────────────
    if (cacheKey) {
      cacheSet(cacheKey, parsed); // fire-and-forget, never awaited
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "X-Cache": "MISS" },
      body: JSON.stringify({ garmentId, ...parsed }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
