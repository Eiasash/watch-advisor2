import { processImage } from "../../services/imagePipeline.js";
import { enqueueOriginalCache } from "../../services/photoQueue.js";

const TYPE_HINTS = {
  shirt: ["shirt", "top", "tee", "polo", "oxford", "knit", "sweater", "hoodie", "sweat", "flannel", "blouse"],
  pants: ["pant", "trouser", "chino", "jeans", "jean", "jogger", "bottom", "slack"],
  shoes: ["shoe", "boot", "sneaker", "loafer", "oxford", "derby"],
  jacket: ["jacket", "coat", "blazer", "bomber", "over", "cardigan"],
};

const COLOR_HINTS = {
  black:  ["black", "noir", "ebony"],
  white:  ["white", "ivory", "cream", "ecru"],
  navy:   ["navy", "midnight"],
  grey:   ["grey", "gray", "slate", "charcoal", "melange"],
  brown:  ["brown", "chocolate", "cognac", "tan", "camel", "khaki"],
  beige:  ["beige", "stone", "sand", "oat"],
  green:  ["green", "olive", "army", "sage"],
  blue:   ["blue", "cobalt", "denim", "indigo"],
  red:    ["red", "burgundy", "brick", "rust"],
};

function guessType(filename) {
  const lower = filename.toLowerCase();
  for (const [type, kws] of Object.entries(TYPE_HINTS)) {
    if (kws.some(k => lower.includes(k))) return type;
  }
  return "shirt";
}

function guessColor(filename) {
  const lower = filename.toLowerCase();
  for (const [color, kws] of Object.entries(COLOR_HINTS)) {
    if (kws.some(k => lower.includes(k))) return color;
  }
  return "grey";
}

export async function runPhotoImport(file) {
  const id = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Non-blocking: thumbnail + hash in worker/canvas
  const { thumbnail, hash } = await processImage(file);

  // Queue original caching in background
  enqueueOriginalCache(id, file);

  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

  return {
    id,
    name: baseName || "Imported Garment",
    type: guessType(file.name),
    color: guessColor(file.name),
    formality: 5,
    hash,
    thumbnail,
    photoUrl: URL.createObjectURL(file),
  };
}
