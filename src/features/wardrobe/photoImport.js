import { processImage } from "../../services/imagePipeline.js";
import { enqueueOriginalCache } from "../../services/photoQueue.js";
import { classify } from "./classifier.js";
import { isOutfitPhoto } from "./isOutfitPhoto.js";
import { normalizeType } from "./normalizeType.js";

/**
 * Claude Vision fallback — only called when pixel classifier has low confidence.
 * classify-image function returns parsed JSON directly: { type, color, material, ... }
 */
async function claudeFallback(imageDataUrl, hash) {
  try {
    const res = await fetch("/.netlify/functions/classify-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageDataUrl, hash }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.type) return data;
    return null;
  } catch (err) {
    console.warn("[claudeFallback] failed:", err.message);
    return null;
  }
}

export async function runPhotoImport(file, existingGarments = []) {
  console.log("[import] START:", file.name, file.type, file.size + "b");

  // ── Filter: outfit / mirror selfie photos ──────────────────────────────────
  if (isOutfitPhoto(file.name)) {
    console.log("[import] outfit/selfie photo detected, excluding from wardrobe:", file.name);
    return {
      id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim(),
      photoType: "outfit-shot",
      excludeFromWardrobe: true,
      thumbnail: null,
      photoUrl: URL.createObjectURL(file),
    };
  }

  const id = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  console.log("[import] processImage START:", file.name);
  const { thumbnail, hiRes, hash } = await processImage(file);
  console.log("[import] processImage DONE:", file.name, "thumb:", !!thumbnail, "hiRes:", !!hiRes, "hash:", hash?.length);

  // classify is now async — awaits image decode for pixel analysis
  const tags = await classify(file.name, thumbnail, hash, existingGarments);

  // ── Claude Vision fallback when confidence is low ──────────────────────────
  // Uses hi-res 512×512 image for better AI color/detail detection
  if (tags._typeSource === "default" || tags._typeSource === "ambiguous" || tags._typeSource === "blind") {
    console.log("[import] low confidence — trying Claude Vision fallback (512px)");
    const aiImage = hiRes ?? thumbnail;
    if (aiImage) {
      const vision = await claudeFallback(aiImage, hash);
      if (vision?.type) {
        tags.type = normalizeType(vision.type);
        tags.color = vision.color ?? tags.color;
        tags.material = vision.material ?? tags.material;
        tags._typeSource = "claude-vision";
        tags.needsReview = false;
        console.log("[import] Claude Vision override:", tags.type, tags.color, vision.material);
      }
    }
  }

  enqueueOriginalCache(id, file);

  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim();

  const garment = {
    id,
    name:       baseName || "Imported Garment",
    type:       normalizeType(tags.type),
    color:      tags.color,
    material:   tags.material ?? null,
    formality:  tags.formality,
    photoType:  tags.photoType,
    needsReview: tags.needsReview,
    ...(tags.duplicateOf ? { duplicateOf: tags.duplicateOf } : {}),
    hash:       hash ?? "",
    thumbnail:  thumbnail ?? null,
    photoUrl:   URL.createObjectURL(file),
  };

  console.log("[import] garment ready:", garment.id, garment.type, garment.color,
    "formality:", garment.formality, "review:", garment.needsReview);
  return garment;
}
