import { callClaude } from "./_claudeClient.js";
import { cacheGet, cacheSet } from "./_blobCache.js";

/**
 * Netlify serverless function — Claude Vision garment classifier.
 * Returns type, primary color, material, formality, AND color_alternatives (top 3).
 *
 * POST body: { image: base64string, hash?: string }
 * Cache: keyed by image hash — same photo never re-classified.
 */

const VALID_TYPES = ["shirt","pants","shoes","jacket","sweater","belt","sunglasses","hat",
                     "scarf","bag","accessory","watch","outfit-photo","outfit-shot"];

const VALID_COLORS = [
  "beige","black","blue","brown","burgundy","camel","charcoal","cognac","coral","cream",
  "dark brown","dark green","dark navy","denim","ecru","gold","green","grey","ivory","khaki",
  "lavender","light blue","maroon","mint","multicolor","navy","olive","orange","pink","purple",
  "red","rust","sage","sand","silver","slate","stone","tan","taupe","teal","white","wine","yellow",
];

export async function handler(event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };

  try {
    const { image, hash } = JSON.parse(event.body ?? "{}");
    if (!image) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing image data" }) };

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }) };

    // ── Cache check ──────────────────────────────────────────────────────────
    const cacheKey = hash ? `classify:${hash}` : null;
    if (cacheKey) {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return {
          statusCode: 200,
          headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "HIT" },
          body: JSON.stringify({ ...cached, _cached: true }),
        };
      }
    }

    // ── Detect media type from data URL prefix ────────────────────────────────
    const rawB64 = image.replace(/^data:image\/\w+;base64,/, "");
    const mediaType = image.startsWith("data:image/png") ? "image/png"
                    : image.startsWith("data:image/webp") ? "image/webp"
                    : "image/jpeg";

    const response = await callClaude(apiKey, {
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: rawB64 },
            },
            {
              type: "text",
              text: `Expert menswear classifier. Identify this clothing item with maximum precision.

Return ONLY valid JSON, no markdown:
{
  "type": one of: ${VALID_TYPES.join("|")},
  "color": <most accurate primary color — one of: ${VALID_COLORS.join("|")}>,
  "color_alternatives": [<2nd>, <3rd>, <4th most likely color>],
  "material": "wool"|"cotton"|"linen"|"denim"|"leather"|"suede"|"synthetic"|"cashmere"|"knit"|"corduroy"|"tweed"|"flannel"|"canvas"|"rubber"|"mesh"|"jersey"|"unknown",
  "pattern": "solid"|"striped"|"plaid"|"checked"|"cable knit"|"ribbed"|"textured"|"printed"|"houndstooth"|"herringbone"|"waffle"|"pique",
  "formality": <1-10 integer>,
  "brand": "<visible brand name from label/tag/logo, or null if not visible>",
  "name": "<short descriptive name, max 5 words — e.g. 'Navy Cable Knit Crewneck', 'Tan Pebble Grain Derby'>",
  "subtype": "<specific garment subtype — e.g. 'cable knit crewneck'|'half-zip'|'full-zip cardigan'|'hoodie'|'polo'|'oxford'|'flannel'|'dress shirt'|'chinos'|'dress trousers'|'jeans'|'joggers'|'derby'|'chelsea boots'|'sneakers'|'overcoat'|'bomber'|'blazer'|null>",
  "seasons": ["spring","summer","autumn","winter"],
  "contexts": ["clinic","formal","smart-casual","casual","date-night","riviera"],
  "confidence": <0.0-1.0>
}

COLOR RULES — be precise:
- navy≠black (dark blue = navy), cream≠white (warm off-white = cream), olive≠khaki (green-brown = olive, yellow-brown = khaki)
- charcoal = very dark grey, slate = blue-toned grey, stone = warm grey-beige
- burgundy = dark red-purple, teal = blue-green, ecru = yellowish cream
- Look at the ENTIRE garment, not just the center

MATERIAL RULES — examine texture:
- knit = visible knit texture (cable, ribbed, chunky), wool = woven wool (suits, coats)
- cotton = smooth woven/jersey, jersey = stretchy knit t-shirt/polo material
- denim = jean material, flannel = brushed cotton with visible nap
- cashmere = very fine soft knit (often on tags), suede = napped leather

BRAND DETECTION — look for:
- Visible tags (hanging or sewn-in), collar labels, chest logos, button engravings
- Common brands: Gant, Kiral, Massimo Dutti, Tommy Hilfiger, Nautica, Ecco, Blundstone, Timberland, Guess
- If you see a tag/label but can't read it clearly, set brand to null

SUBTYPE — classify precisely:
- Sweaters: cable knit crewneck, half-zip, full-zip cardigan, hoodie, pullover, waffle knit, striped knit
- Shirts: oxford, dress shirt, flannel, polo, jersey shirt, casual print, madras plaid
- Pants: chinos, dress trousers, jeans (dark/medium/light), joggers, shorts
- Shoes: derby, oxford, chelsea boots, lace-up boots, sneakers, canvas sneakers
- Jackets: overcoat, bomber, blazer, parka, fleece, vest

SEASON/CONTEXT — infer from weight and formality:
- Lightweight cotton/linen → spring/summer. Heavy knit/wool → autumn/winter
- Formal (7+): clinic, formal. Mid (4-6): smart-casual, date-night. Casual (1-3): casual, riviera`,
            },
          ],
        },
      ],
    });

    const raw = response?.content?.[0]?.text ?? "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch { parsed = {}; }

    // Validate type — reject hallucinations
    if (parsed.type && !VALID_TYPES.includes(parsed.type)) parsed.type = "accessory";

    // ── Cache write ──────────────────────────────────────────────────────────
    if (cacheKey && parsed.type) {
      cacheSet(cacheKey, parsed); // fire-and-forget
    }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "MISS" },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
