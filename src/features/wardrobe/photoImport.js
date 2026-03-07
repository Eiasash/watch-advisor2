import { processImage } from "../../services/imagePipeline.js";
import { enqueueOriginalCache } from "../../services/photoQueue.js";
import { classify } from "./classifier.js";

export async function runPhotoImport(file, existingGarments = []) {
  console.log("[import] START:", file.name, file.type, file.size + "b");

  const id = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  console.log("[import] processImage START:", file.name);
  const { thumbnail, hash } = await processImage(file);
  console.log("[import] processImage DONE:", file.name, "thumb:", !!thumbnail, "hash:", hash?.length);

  // classify is now async — awaits image decode for pixel analysis
  const tags = await classify(file.name, thumbnail, hash, existingGarments);

  enqueueOriginalCache(id, file);

  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim();

  const garment = {
    id,
    name:       baseName || "Imported Garment",
    type:       tags.type,
    color:      tags.color,
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
