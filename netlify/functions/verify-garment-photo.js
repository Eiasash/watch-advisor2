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
import { callClaude, extractText } from "./_claudeClient.js";
import { cors } from "./_cors.js";

// Kept in sync with classify-image.js — any change here must be mirrored there
const VALID_TYPES  = ["shirt","pants","shoes","jacket","sweater","belt","sunglasses","hat","scarf","bag","accessory","watch","outfit-photo"];
const VALID_COLORS = [
  "beige","black","blue","brown","burgundy","camel","charcoal","cognac","coral","cream",
  "dark brown","dark green","dark navy","denim","ecru","gold","green","grey","ivory","khaki",
  "lavender","light blue","maroon","mint","multicolor","navy","olive","orange","pink","purple",
  "red","rust","sage","sand","silver","slate","stone","tan","taupe","teal","white","wine","yellow",
];
// Full material list — kept in sync with classify-image.js
const VALID_MATERIALS = [
  "wool","cotton","linen","denim","leather","suede","synthetic","cashmere","knit",
  "corduroy","tweed","flannel","canvas","rubber","mesh","jersey","silk","nylon",
  "polyester","velvet","seersucker","chambray","unknown",
];

export async function handler(event) {
  const CORS = cors(event);
  const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { imageUrl, imageBase64, currentType, currentColor, currentName, garmentId, hash, neighbors: rawNeighbors, allAngles = [] } = JSON.parse(event.body ?? "{}");

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: "CLAUDE_API_KEY not set" }) };

    // ── Cache check ──────────────────────────────────────────────────────────
    const angleCount = (allAngles ?? []).length;
    const cacheKey = hash ? `verify:${hash}:a${angleCount}` : null;
    if (cacheKey) {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        // IMPORTANT: garmentId always comes from the request, never from cache.
        // Cache stores only the Vision result (ok, correctedType, etc.) — not the ID.
        // Spreading garmentId LAST ensures request ID always wins even if cache
        // somehow contains a stale garmentId field from a previous session.
        return {
          statusCode: 200,
          headers: { ...JSON_HEADERS, "X-Cache": "HIT" },
          body: JSON.stringify({ ...cached, garmentId, _cached: true }),
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
      let u;
      try { u = new URL(imageUrl); } catch (_) {
        return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "Invalid image URL" }) };
      }
      if (u.protocol !== "https:" || ["localhost","127.0.0.1","::1"].includes(u.hostname) || u.hostname.startsWith("169.254.")) {
        return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "Disallowed image host" }) };
      }
      const imgRes = await fetch(u.toString(), { signal: AbortSignal.timeout(5000) });
      const ct = imgRes.headers.get("content-type") || "";
      if (!ct.startsWith("image/")) {
        return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "URL did not return an image" }) };
      }
      const buf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      imageBlock = { type: "image", source: { type: "base64", media_type: ct, data: b64 } };
    } else {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "No image provided" }) };
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

    const prompt = `You are a menswear AI verifying garment photo labels. Current labels for this item:
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
  "pattern": "solid"|"striped"|"plaid"|"checked"|"cable knit"|"ribbed"|"textured"|"printed"|"houndstooth"|"herringbone"|"waffle"|"pique"|"paisley"|"geometric"|"floral"|"color block"|"windowpane"|"micro-check"|"glen plaid",
  "subtype": "<specific subtype e.g. 'cable knit crewneck'|'half-zip'|'polo'|'oxford'|'chinos'|'derby'|'chelsea boots'|'blazer'|null>",
  "formality": <1-10 integer>,
  "weight": "ultralight"|"light"|"medium"|"heavy",
  "fit": "slim"|"regular"|"relaxed"|"oversized"|null,
  "seasons": ["spring","summer","autumn","winter"] (subset appropriate for this garment),
  "contexts": ["clinic","formal","smart-casual","casual","date-night","riviera","sport","lounge"] (subset),
  "correctedName": "${currentName ?? ""}" (short descriptive name, max 5 words),
  "confidence": 0.0-1.0,
  "reason": "one sentence: what you see across all angles and whether labels match",
  "isOutfitPhoto": false (true if the photo shows a complete outfit or multiple garments together — e.g. flat-lay, mannequin, full-body shot showing shirt+trousers+shoes),
  "detectedGarments": [] (if isOutfitPhoto=true, list each visible garment as {type, color, subtype} — e.g. [{type:"shirt",color:"white",subtype:"oxford"},{type:"pants",color:"navy",subtype:"chinos"}]),
  "isAngleShot": false (true if this looks like a different angle of the same garment as a neighbor),
  "angleOfId": null (if isAngleShot=true, the neighbor ID this is an angle of),
  "isDuplicate": false (true if this is an exact or near-exact duplicate photo of a neighbor),
  "duplicateOfId": null (if isDuplicate=true, the neighbor ID this duplicates)
}

Rules:
- Set ok=true ONLY if type AND color are both correct. ok=false if either is wrong.
- COLOR PRECISION: navy≠black, cream≠white, olive≠khaki, charcoal≠black, ecru≠cream, teal≠green, stone≠beige, slate≠grey.
  Look at the entire garment, not just the center. Lighting can shift perceived color — account for it.
- MATERIAL: examine texture and sheen closely. knit=visible knit structure (cable/ribbed/chunky). jersey=smooth stretchy knit (t-shirts/polos).
  cotton=smooth woven. wool=woven suiting. cashmere=very fine soft knit. flannel=brushed napped surface. denim=twill weave jeans fabric.
  chambray=lightweight denim-look woven. velvet=plush pile. silk=lustrous smooth. nylon/polyester=synthetic sheen.
- PATTERN: cable knit and ribbed are patterns (not solid). Check for subtle patterns — micro-check, fine stripes, texture weaves.
- WEIGHT: ultralight=linen/silk/sheer, light=cotton tee/poplin/thin chinos, medium=oxford/regular knit/chinos/leather shoes, heavy=overcoat/chunky knit/thick denim/winter boots.
- FIT: assess from garment shape — slim=fitted/tapered, regular=standard cut, relaxed=loose, oversized=boxy/dropped shoulders. null for shoes/accessories/belts.
- SEASONS: infer from weight+material. Heavy knit/wool=autumn/winter. Light cotton/linen=spring/summer. Medium cotton=spring/summer/autumn. all-season items can span all four.
- CONTEXTS: clinic=medical professional setting. formal=black tie/suit. smart-casual=office no tie. casual=weekend. date-night=evening out. riviera=resort/summer. sport=athletic. lounge=home/relaxed.
- MULTI-GARMENT: if the photo shows multiple clothing items (outfit flat-lay, full-body photo, several garments on a rail), set isOutfitPhoto=true and list each visible item in detectedGarments. The labelled item (currentType) should still be classified as the primary result.
- isAngleShot=true when photo shows the SAME garment from a different angle (front vs back, folded vs flat, hanging vs laid flat).
- isDuplicate=true when photos are near-identical (same angle, same lighting, same garment, likely uploaded twice).`;

    const contentBlocks = [imageBlock, ...angleBlocks, { type: "text", text: prompt }];

    const res = await callClaude(apiKey, {
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{ role: "user", content: contentBlocks }],
    }, { maxAttempts: 1 });

    const raw  = extractText(res);
    const clean = raw.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
      // Guard: if required fields missing, treat as parse error
      if (typeof parsed.ok !== "boolean") throw new Error("missing ok field");
    } catch {
      parsed = { ok: false, confidence: 0, reason: "AI parse error" };
    }

    // ── Cache write ──────────────────────────────────────────────────────────
    if (cacheKey) {
      cacheSet(cacheKey, parsed); // fire-and-forget, never awaited
    }

    return {
      statusCode: 200,
      headers: { ...JSON_HEADERS, "X-Cache": "MISS" },
      body: JSON.stringify({ garmentId, ...parsed }),
    };
  } catch (err) {
    const isClaudeError = err.message?.startsWith("Claude API error");
    return { statusCode: isClaudeError ? 502 : 500, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
}
