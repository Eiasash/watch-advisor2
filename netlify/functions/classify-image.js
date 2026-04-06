import { callClaude, extractText } from "./_claudeClient.js";
import { cacheGet, cacheSet } from "./_blobCache.js";
import { cors } from "./_cors.js";

/**
 * Netlify serverless function — Claude Vision garment classifier.
 * Returns type, primary color, material, formality, AND color_alternatives (top 3).
 *
 * POST body: { image: base64string, hash?: string }
 * Cache: keyed by image hash — same photo never re-classified.
 */

const VALID_TYPES = ["shirt","pants","shoes","jacket","sweater","belt","sunglasses","hat",
                     "scarf","bag","accessory"];

const VALID_COLORS = [
  "beige","black","blue","brown","burgundy","camel","charcoal","cognac","coral","cream",
  "dark brown","dark green","dark navy","denim","ecru","gold","green","grey","ivory","khaki",
  "lavender","light blue","maroon","mint","multicolor","navy","olive","orange","pink","purple",
  "red","rust","sage","sand","silver","slate","stone","tan","taupe","teal","white","wine","yellow",
];

export async function handler(event) {
  const CORS = cors(event);

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
  "material": "wool"|"cotton"|"linen"|"denim"|"leather"|"suede"|"synthetic"|"cashmere"|"knit"|"corduroy"|"tweed"|"flannel"|"canvas"|"rubber"|"mesh"|"jersey"|"silk"|"nylon"|"polyester"|"velvet"|"seersucker"|"chambray"|"unknown",
  "pattern": "solid"|"striped"|"plaid"|"checked"|"cable knit"|"ribbed"|"textured"|"printed"|"houndstooth"|"herringbone"|"waffle"|"pique"|"paisley"|"geometric"|"floral"|"abstract"|"animal print"|"camouflage"|"color block"|"windowpane"|"glen plaid"|"micro-check",
  "formality": <1-10 integer>,
  "brand": "<visible brand name from label/tag/logo, or null if not visible>",
  "name": "<short descriptive name, max 5 words — e.g. 'Navy Cable Knit Crewneck', 'Tan Pebble Grain Derby'>",
  "subtype": "<specific garment subtype — see list below, or null>",
  "weight": "ultralight"|"light"|"medium"|"heavy" (fabric weight: ultralight=linen/silk, light=cotton tee/poplin, medium=oxford/chinos/knit, heavy=overcoat/chunky knit/denim jacket),
  "fit": "slim"|"regular"|"relaxed"|"oversized"|null (visible cut — slim=fitted/tapered, regular=standard, relaxed=loose, oversized=very loose/boxy),
  "seasons": ["spring","summer","autumn","winter"],
  "contexts": ["clinic","formal","smart-casual","casual","date-night","riviera","sport","lounge"],
  "confidence": <0.0-1.0>
}

COLOR RULES — be precise:
- navy≠black (dark blue = navy), cream≠white (warm off-white = cream), olive≠khaki (green-brown = olive, yellow-brown = khaki)
- charcoal = very dark grey, slate = blue-toned grey, stone = warm grey-beige
- burgundy = dark red-purple, teal = blue-green, ecru = yellowish cream
- Look at the ENTIRE garment, not just the center

MATERIAL RULES — examine texture carefully:
- knit = visible knit texture (cable, ribbed, chunky), wool = woven wool (suits, coats)
- cotton = smooth woven/jersey, jersey = stretchy knit t-shirt/polo material
- denim = jean material, flannel = brushed cotton with visible nap
- cashmere = very fine soft knit (often on tags), suede = napped leather
- chambray = lightweight denim-look woven, seersucker = puckered cotton
- silk = lustrous smooth, velvet = plush pile, nylon = slick synthetic

BRAND DETECTION — look for:
- Visible tags (hanging or sewn-in), collar labels, chest logos, button engravings
- Common brands: Gant, Kiral, Massimo Dutti, Tommy Hilfiger, Nautica, Ecco, Blundstone, Timberland, Guess, Zara, H&M, Uniqlo, Ralph Lauren, Brooks Brothers, Lacoste
- If you see a tag/label but can't read it clearly, set brand to null

SUBTYPE — classify precisely:
- Sweaters: cable knit crewneck, half-zip, full-zip cardigan, hoodie, pullover, waffle knit, v-neck, shawl collar, mock neck, turtleneck, henley knit
- Shirts: oxford, dress shirt, flannel, polo, jersey shirt, casual print, madras plaid, linen shirt, camp collar, band collar, chambray, button-down
- Pants: chinos, dress trousers, jeans (dark/medium/light), joggers, shorts, cargo, corduroy pants, linen trousers, wool trousers
- Shoes: derby, oxford, chelsea boots, lace-up boots, sneakers, canvas sneakers, loafers, driving shoes, monk strap, desert boots, boat shoes, espadrilles
- Jackets: overcoat, bomber, blazer, parka, fleece, vest, field jacket, harrington, trucker jacket, safari jacket, sport coat, rain jacket, quilted jacket, shacket

WEIGHT — assess fabric heft:
- ultralight: linen, silk, sheer fabrics, thin jersey
- light: cotton tee, poplin shirt, thin chinos, canvas sneakers
- medium: oxford cloth, standard knit, regular denim, leather shoes
- heavy: overcoat, chunky cable knit, thick denim jacket, winter boots, tweed

FIT — look at garment shape:
- slim: narrow silhouette, tapered legs, fitted torso
- regular: standard cut, moderate room
- relaxed: loose cut, straight legs, extra room
- oversized: deliberately large/boxy, dropped shoulders
- null: if fit can't be determined (e.g. accessories, shoes)

SEASON/CONTEXT — infer from weight, material, and formality:
- ultralight/light cotton/linen → spring/summer. Heavy knit/wool → autumn/winter. Medium → depends on material
- Formal (7+): clinic, formal. Mid (4-6): smart-casual, date-night. Casual (1-3): casual, riviera
- Sport: athletic/performance wear. Lounge: sleepwear, sweatpants at home
- A piece can span multiple seasons (e.g. medium-weight cotton chinos → all-season)`,
            },
          ],
        },
      ],
    }, { maxAttempts: 1 });

    const raw = extractText(response);
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
