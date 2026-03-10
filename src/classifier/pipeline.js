/**
 * Garment classification pipeline.
 *
 * Flow:
 *   image → pixel classifier → person detection → Claude fallback
 *         → normalize type → duplicate detection → store garment
 *
 * Re-exports the existing classifier's core logic while adding
 * the new pipeline stages (person filter, Claude fallback, duplicate check).
 */

import { classify, classifyFromFilename, extractDominantColor, analyzeImageContent } from "../features/wardrobe/classifier.js";
import { processImage } from "../services/imagePipeline.js";
import { enqueueOriginalCache } from "../services/photoQueue.js";
import { normalizeType } from "./normalizeType.js";
import { findDuplicate } from "./duplicateDetection.js";
import { shouldExcludeAsOutfitPhoto } from "./personFilter.js";
import { buildGarmentName } from "../features/wardrobe/garmentNamer.js";

/**
 * Normalize AI-returned colors to scoring-compatible palette names.
 * Maps 41+ AI color names down to the ~18 colors the scoring engine recognizes.
 */
const AI_COLOR_NORMALIZE = {
  // Already canonical — no mapping needed for: black, white, navy, blue, grey, brown, tan,
  // beige, olive, green, red, cream, khaki, stone, slate, teal, burgundy, charcoal
  "gray": "grey",
  "dark brown": "brown",
  "dark green": "olive",
  "dark navy": "navy",
  "denim": "blue",
  "light blue": "blue",
  "ecru": "cream",
  "ivory": "cream",
  "camel": "tan",
  "sand": "tan",
  "taupe": "tan",
  "cognac": "brown",
  "rust": "brown",
  "maroon": "burgundy",
  "wine": "burgundy",
  "sage": "olive",
  "mint": "green",
  "gold": "tan",
  "silver": "grey",
  "coral": "red",
  "pink": "red",
  "orange": "red",
  "lavender": "grey",
  "yellow": "cream",
  "multicolor": "grey",
};

export function normalizeAIColor(aiColor) {
  if (!aiColor) return null;
  const lower = aiColor.toLowerCase().trim();
  return AI_COLOR_NORMALIZE[lower] ?? lower;
}

/**
 * Claude Vision fallback — called when pixel classifier has low confidence.
 * classify-image function returns parsed JSON directly: { type, color, material, pattern, formality, confidence }
 */
async function claudeVisionFallback(imageBase64, hash) {
  try {
    const res = await fetch("/.netlify/functions/classify-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageBase64, hash }),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    const data = await res.json();
    // Function returns parsed JSON directly — type/color/material at top level
    if (data?.type) return data;
    return null;
  } catch (err) {
    console.warn("[claudeFallback] failed:", err.message);
    return null;
  }
}

/**
 * Run the full import pipeline for a single photo file.
 *
 * @param {File} file - Image file to import
 * @param {Array} existingGarments - Current garment list for duplicate detection
 * @returns {object} Garment object ready for store
 */
export async function runClassifierPipeline(file, existingGarments = []) {
  console.log("[pipeline] START:", file.name, file.type, file.size + "b");

  const id = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Step 1: Process image (thumbnail + hiRes + hash)
  const { thumbnail, hiRes, hash } = await processImage(file);

  // Step 2: Run pixel classifier
  const tags = await classify(file.name, thumbnail, hash, existingGarments);

  // Step 3: Person detection — check zone analysis
  const zones = await analyzeImageContent(thumbnail, file.name);
  if (shouldExcludeAsOutfitPhoto(file.name, zones)) {
    console.log("[pipeline] outfit/person photo detected, excluding:", file.name);
    return {
      id,
      name: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim(),
      type: "outfit-photo",
      category: "outfit-photo",
      photoType: "outfit-shot",
      excludeFromWardrobe: true,
      thumbnail: thumbnail ?? null,
      photoUrl: URL.createObjectURL(file),
    };
  }

  // Step 4: Claude Vision fallback.
  // Fires when:
  //   a) pixel confidence is low (ambiguous/blind) — can't determine type at all
  //   b) flat-lay detected — pixel classifier can't distinguish shirt/sweater/pants by texture,
  //      and colour from extractDominantColor may be wrong for warm-toned garments.
  //      Vision gives correct type (cable knit vs dress shirt vs chinos), colour, subtype, brand.
  const needsVision = tags._typeSource === "ambiguous"
    || tags._typeSource === "blind"
    || tags._typeSource === "flat-lay";
  if (needsVision) {
    console.log("[pipeline] triggering Claude Vision fallback (512px)", `reason: ${tags._typeSource}`);
    const aiImage = hiRes ?? thumbnail;
    if (aiImage) {
      const vision = await claudeVisionFallback(aiImage, hash);
      if (vision?.type) {
        const visionType = normalizeType(vision.type);

        // If Vision thinks this is an outfit/person photo, mark for exclusion
        if (visionType === "outfit-photo") {
          return {
            id,
            name: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim(),
            type: "outfit-photo",
            category: "outfit-photo",
            photoType: "outfit-shot",
            excludeFromWardrobe: true,
            thumbnail: thumbnail ?? null,
            photoUrl: URL.createObjectURL(file),
          };
        }

        tags.type = visionType;
        tags.color = normalizeAIColor(vision.color) ?? tags.color;
        tags.formality = vision.formality ?? tags.formality;
        tags.material = vision.material ?? tags.material;
        tags.pattern = vision.pattern ?? tags.pattern;
        tags.colorAlternatives = (vision.color_alternatives ?? []).map(normalizeAIColor).filter(Boolean);
        // Use Vision's descriptive name for camera-roll filenames
        if (vision.name) tags._visionName = vision.name;
        if (vision.subtype) tags.subtype = vision.subtype;
        if (vision.brand) tags.brand = vision.brand;
        if (Array.isArray(vision.seasons) && vision.seasons.length) tags.seasons = vision.seasons;
        if (Array.isArray(vision.contexts) && vision.contexts.length) tags.contexts = vision.contexts;
        tags._typeSource = "claude-vision";
        tags.needsReview = false;
        console.log("[pipeline] Claude Vision override:", tags.type, tags.color,
          vision.subtype ?? "", vision.material ?? "", vision.pattern ?? "");
      }
    }
  }

  // Step 5: Normalize garment type
  const category = normalizeType(tags.type);

  // Step 6: Duplicate detection
  const duplicateOf = findDuplicate(hash, existingGarments) ?? undefined;

  // Step 7: Cache original
  enqueueOriginalCache(id, file);

  // Prefer Vision's descriptive name (e.g. "Navy Cable Knit Crewneck") over generic buildGarmentName
  const descriptiveName = tags._visionName ?? buildGarmentName(file.name, category, tags.color);

  return {
    id,
    name: descriptiveName,
    originalFilename: file.name,
    type: category,
    category,
    color: tags.color,
    ...(tags.colorAlternatives?.length ? { colorAlternatives: tags.colorAlternatives } : {}),
    ...(tags.material ? { material: tags.material } : {}),
    ...(tags.pattern ? { pattern: tags.pattern } : {}),
    ...(tags.subtype ? { subtype: tags.subtype } : {}),
    ...(tags.brand ? { brand: tags.brand } : {}),
    ...(tags.seasons?.length ? { seasons: tags.seasons } : {}),
    ...(tags.contexts?.length ? { contexts: tags.contexts } : {}),
    formality: tags.formality,
    photoType: tags.photoType,
    needsReview: tags.needsReview,
    ...(duplicateOf ? { duplicateOf } : {}),
    hash: hash ?? "",
    thumbnail: thumbnail ?? null,
    photoUrl: URL.createObjectURL(file),
  };
}
