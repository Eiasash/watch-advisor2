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
const VALID_MATERIALS = ["wool","cotton","linen","denim","leather","suede","synthetic","cashmere","knit","corduroy","tweed","flannel","canvas","rubber","mesh","unknown"];

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type" } };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { imageUrl, imageBase64, currentType, currentColor, currentName, garmentId, hash, neighbors: rawNeighbors, allAngles = [] } = JSON.parse(event.body ?? "{}");

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "CLAUDE_API_KEY not set" }) };

    // ── Cache check ──────────────────────────────────────────────────────────
    // Key includes angle count — adding new angles invalidates old cache entry
    const angleCount = (allAngles ?? []).length;
    const cacheKey = hash ? `verify:${hash}:a${angleCount}` : null;
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
      return { statusCode: 400, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "No image provided" }) };
    }

    // Build neighbor context for angle/dupe detection
    const neighbors = Array.isArray(rawNeighbors) ? rawNeighbors : [];
    const neighborCtx = neighbors.length > 0
      ? `\nNEARBY GARMENTS (same hash neighborhood — check for duplicates/angles):\n${neighbors.map(n => `- [${n.id}] "${n.name}" type=${n.type} color=${n.color} hash=${n.hash ?? "none"}`).join("\n")}\n`
      : "";

    // Build additional angle image blocks (up to 3 extra angles)
    const angleBlocks = [];
    for (const angleB64 of (allAngles ?? []).slice(0, 3)) {
      const b64 = angleB64.replace(/^data:image\/\w+;base64,/, "");
      angleBlocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } });
    }
    const angleNote = angleBlocks.length > 0
      ? `\nADDITIONAL ANGLES: ${angleBlocks.length} extra photo(s) of this garment follow. Use ALL angles to assess color, material, and texture more accurately.\n`
      : "";

    const prompt = `You are a wardrobe AI classifying garment photos. Current labels for this item:
- Type: ${currentType ?? "unknown"}
- Color: ${currentColor ?? "unknown"}
- Name: ${currentName ?? "unknown"}
- Hash: ${hash ?? "none"}
${neighborCtx}${angleNote}
Examine all provided photos carefully. Return ONLY a JSON object (no markdown, no extra text):

{
  "ok": true/false,
  "correctedType": "${currentType ?? "shirt"}" (use current if correct, else one of: ${VALID_TYPES.join(", ")}),
  "correctedColor": "${currentColor ?? "black"}" (MOST accurate primary color — one of: ${VALID_COLORS.join(", ")}),
  "color_alternatives": ["2nd most likely color", "3rd most likely color", "4th most likely color"],
  "material": "detected fabric/material" (one of: ${VALID_MATERIALS.join(", ")}),
  "pattern": "solid"|"striped"|"plaid"|"checked"|"cable knit"|"ribbed"|"textured"|"printed"|"houndstooth"|"herringbone"|"waffle"|"pique"|"paisley"|"geometric"|"floral"|"color block"|"windowpane"|"micro-check",
  "subtype": "<specific subtype e.g. 'cable knit crewneck'|'half-zip'|'polo'|'oxford'|'chinos'|'derby'|'chelsea boots'|'blazer'|null>",
  "formality": <1-10 integer>,
  "weight": "ultralight"|"light"|"medium"|"heavy",
  "fit": "slim"|"regular"|"relaxed"|"oversized"|null,
  "seasons": ["spring","summer","autumn","winter"] (subset appropriate for this garment),
  "contexts": ["clinic","formal","smart-casual","casual","date-night","riviera","sport","lounge"] (subset),
  "correctedName": "${currentName ?? ""}" (short descriptive name, max 5 words),
  "confidence": 0.0-1.0,
  "reason": "one sentence: what you see across all angles and whether labels match",
  "isAngleShot": false (true if this looks like a different angle of the same garment as a neighbor),
  "angleOfId": null (if isAngleShot=true, the neighbor ID this is an angle of),
  "isDuplicate": false (true if this is an exact or near-exact duplicate photo of a neighbor),
  "duplicateOfId": null (if isDuplicate=true, the neighbor ID this duplicates)
}

Rules:
- Set ok=true ONLY if type AND color are both correct.
- Set ok=false if type or color is wrong.
- color_alternatives: list 3 plausible alternative color names from the vocabulary (navy≠black, cream≠white, olive≠khaki).
- material: examine texture, sheen, weight cues across all angles.
- pattern: examine the fabric pattern closely. "solid" if no visible pattern.
- weight: ultralight=linen/silk, light=cotton tee/poplin, medium=oxford/chinos/knit, heavy=overcoat/chunky knit.
- fit: look at garment shape — slim=fitted, regular=standard, relaxed=loose, oversized=boxy. null for shoes/accessories.
- seasons: infer from weight + material. Lightweight linen → spring/summer. Heavy wool → autumn/winter.
- contexts: clinic=medical professional, formal=suit/tie, smart-casual=office no tie, casual=weekend, riviera=resort.
- isAngleShot=true when photo shows the SAME garment from a different angle (front vs back, folded vs flat).
- isDuplicate=true when photos are near-identical (same angle, same lighting, same garment).`;

    const contentBlocks = [imageBlock, ...angleBlocks, { type: "text", text: prompt }];

    const res = await callClaude(apiKey, {
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{ role: "user", content: contentBlocks }],
    }, { maxAttempts: 1 });

    const raw  = res.content?.[0]?.text ?? "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch { parsed = { ok: false, confidence: 0, reason: "AI parse error" }; }

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
    const isClaudeError = err.message?.startsWith("Claude API error");
    return { statusCode: isClaudeError ? 502 : 500, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: err.message }) };
  }
}
