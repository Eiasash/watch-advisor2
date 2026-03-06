/**
 * Image pipeline.
 * Tries Web Worker first (off-thread), falls back to main-thread canvas.
 * Every call resolves within TIMEOUT_MS — never hangs.
 */

const TIMEOUT_MS = 8000;

let worker = null;
let workerFailed = false;
const pending = new Map();
let reqId = 0;

function getWorker() {
  if (workerFailed) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/photoWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const { id, type, thumbnail, hash, message } = e.data;
      const entry = pending.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(id);
      if (type === "result") {
        entry.resolve({ thumbnail, hash });
      } else {
        console.error("[imagePipeline] worker error:", message);
        entry.resolve({ thumbnail: null, hash: "" });
      }
    };
    worker.onerror = (err) => {
      console.error("[imagePipeline] worker crashed:", err.message);
      // Resolve all pending with null so nothing hangs
      for (const [id, entry] of pending) {
        clearTimeout(entry.timer);
        entry.resolve({ thumbnail: null, hash: "" });
        pending.delete(id);
      }
      worker = null;
      workerFailed = true;
    };
  } catch (e) {
    console.warn("[imagePipeline] worker unavailable:", e.message);
    workerFailed = true;
    return null;
  }
  return worker;
}

/**
 * FileReader-based fallback: File → data URL → Image → canvas.
 * Works in all browsers without createImageBitmap.
 */
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error("FileReader failed"));
    fr.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Image load failed"));
    img.src = src;
  });
}

async function processViaCanvas(file) {
  const dataURL = await fileToDataURL(file);
  const img = await loadImage(dataURL);

  // Thumbnail
  const tc = document.createElement("canvas");
  tc.width = 240; tc.height = 240;
  tc.getContext("2d").drawImage(img, 0, 0, 240, 240);
  const thumbnail = tc.toDataURL("image/jpeg", 0.82);

  // dHash
  const hc = document.createElement("canvas");
  hc.width = 9; hc.height = 8;
  const hctx = hc.getContext("2d");
  hctx.drawImage(img, 0, 0, 9, 8);
  const data = hctx.getImageData(0, 0, 9, 8).data;
  let hash = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash += data[(y * 9 + x) * 4] > data[(y * 9 + x + 1) * 4] ? "1" : "0";
    }
  }
  return { thumbnail, hash };
}

export function processImage(file) {
  return new Promise((resolve) => {
    const w = getWorker();

    if (!w) {
      // Main-thread canvas path with its own timeout
      const timer = setTimeout(() => {
        console.error("[imagePipeline] canvas fallback timed out for", file.name);
        resolve({ thumbnail: null, hash: "" });
      }, TIMEOUT_MS);
      processViaCanvas(file)
        .then((result) => { clearTimeout(timer); resolve(result); })
        .catch((err) => {
          clearTimeout(timer);
          console.error("[imagePipeline] canvas fallback failed:", err.message);
          resolve({ thumbnail: null, hash: "" });
        });
      return;
    }

    const id = ++reqId;
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      console.warn("[imagePipeline] worker timeout for", file.name, "— retrying via canvas");
      processViaCanvas(file)
        .then(resolve)
        .catch(() => resolve({ thumbnail: null, hash: "" }));
    }, TIMEOUT_MS);

    pending.set(id, { resolve, timer });
    w.postMessage({ type: "process", id, file });
  });
}

// Legacy compat
export async function generateThumbnail(file) {
  return (await processImage(file)).thumbnail;
}
export async function computeHash(file) {
  return (await processImage(file)).hash;
}
