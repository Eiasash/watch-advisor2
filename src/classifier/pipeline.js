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
    if (!res.ok) return null;
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

  // Step 4: Claude Vision fallback when confidence is low
  // Uses hi-res 512×512 image for better AI color/detail detection
  if (tags._typeSource === "ambiguous" || tags._typeSource === "blind") {
    console.log("[pipeline] low confidence — trying Claude Vision fallback (512px)");
    const aiImage = hiRes ?? thumbnail;
    if (aiImage) {
      const vision = await claudeVisionFallback(aiImage, hash);
      if (vision?.type) {
        tags.type = normalizeType(vision.type);
        tags.color = vision.color ?? tags.color;
        tags.formality = vision.formality ?? tags.formality;
        tags.material = vision.material ?? tags.material;
        tags._typeSource = "claude-vision";
        tags.needsReview = false;
        console.log("[pipeline] Claude Vision override:", tags.type, tags.color, vision.material);
      }
    }
  }

  // Step 5: Normalize garment type
  const category = normalizeType(tags.type);

  // Step 6: Duplicate detection
  const duplicateOf = findDuplicate(hash, existingGarments) ?? undefined;

  // Step 7: Cache original
  enqueueOriginalCache(id, file);

  const descriptiveName = buildGarmentName(file.name, category, tags.color);

  return {
    id,
    name: descriptiveName,
    originalFilename: file.name,
    type: category,
    category,
    color: tags.color,
    formality: tags.formality,
    photoType: tags.photoType,
    needsReview: tags.needsReview,
    ...(duplicateOf ? { duplicateOf } : {}),
    hash: hash ?? "",
    thumbnail: thumbnail ?? null,
    photoUrl: URL.createObjectURL(file),
  };
}
