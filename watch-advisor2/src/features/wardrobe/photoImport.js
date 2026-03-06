import { generateThumbnail, computeHash } from "../../services/imagePipeline.js";
import { enqueueOriginalCache } from "../../services/photoQueue.js";

export async function runPhotoImport(file) {
  const [thumbnail, hash] = await Promise.all([
    generateThumbnail(file),
    computeHash(file)
  ]);

  enqueueOriginalCache(file);

  return {
    id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "Imported Garment",
    type: "shirt",
    color: "black",
    formality: 5,
    hash,
    thumbnail,
    photoUrl: URL.createObjectURL(file)
  };
}
