/**
 * Image pipeline — browser-safe path only.
 * Uses FileReader → HTMLImageElement → canvas.
 * Worker path is disabled until proven reliable in target browsers.
 */

const USE_WORKER = false; // flip to true only after worker verified in browser
const TIMEOUT_MS = 8000;

// ─── Worker path (kept but bypassed) ─────────────────────────────────────────
let worker = null;
let workerFailed = false;
const pending = new Map();
let reqId = 0;

function getWorker() {
  if (!USE_WORKER || workerFailed) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/photoWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const { id, type, thumbnail, hash, message } = e.data;
      const entry = pending.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(id);
      if (type === "result") entry.resolve({ thumbnail, hash });
      else entry.resolve({ thumbnail: null, hash: "" });
    };
    worker.onerror = () => {
      for (const [id, entry] of pending) {
        clearTimeout(entry.timer);
        entry.resolve({ thumbnail: null, hash: "" });
        pending.delete(id);
      }
      worker = null;
      workerFailed = true;
    };
  } catch {
    workerFailed = true;
    return null;
  }
  return worker;
}

// ─── Reliable main-thread path ────────────────────────────────────────────────

function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload  = () => res(fr.result);
    fr.onerror = () => rej(new Error("FileReader failed for " + file.name));
    fr.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = () => rej(new Error("Image load failed"));
    img.src = src;
  });
}

async function processViaCanvas(file) {
  console.log("[pipeline] FileReader start:", file.name);
  const dataURL = await fileToDataURL(file);
  console.log("[pipeline] Image load start:", file.name);
  const img = await loadImage(dataURL);
  console.log("[pipeline] Canvas draw start:", file.name, img.naturalWidth, "x", img.naturalHeight);

  // Thumbnail 240×240 (for display)
  const tc = document.createElement("canvas");
  tc.width = 240; tc.height = 240;
  tc.getContext("2d").drawImage(img, 0, 0, 240, 240);
  const thumbnail = tc.toDataURL("image/jpeg", 0.82);

  // Hi-res 512×512 (for AI classification — better color/detail detection)
  const hrc = document.createElement("canvas");
  hrc.width = 512; hrc.height = 512;
  hrc.getContext("2d").drawImage(img, 0, 0, 512, 512);
  const hiRes = hrc.toDataURL("image/jpeg", 0.88);

  // dHash 8×8
  const hc = document.createElement("canvas");
  hc.width = 9; hc.height = 8;
  const hctx = hc.getContext("2d");
  hctx.drawImage(img, 0, 0, 9, 8);
  const px = hctx.getImageData(0, 0, 9, 8).data;
  let hash = "";
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      hash += px[(y * 9 + x) * 4] > px[(y * 9 + x + 1) * 4] ? "1" : "0";

  console.log("[pipeline] done:", file.name, "thumb len:", thumbnail.length, "hiRes len:", hiRes.length, "hash:", hash);
  return { thumbnail, hiRes, hash };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function processImage(file) {
  console.log("[pipeline] processImage called:", file.name, "USE_WORKER:", USE_WORKER);

  const w = USE_WORKER ? getWorker() : null;

  if (!w) {
    // Safe main-thread path
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        console.error("[pipeline] TIMEOUT for", file.name);
        resolve({ thumbnail: null, hash: "" });
      }, TIMEOUT_MS);

      processViaCanvas(file)
        .then((result) => { clearTimeout(timer); resolve(result); })
        .catch((err) => {
          clearTimeout(timer);
          console.error("[pipeline] canvas failed:", file.name, err.message);
          resolve({ thumbnail: null, hash: "" });
        });
    });
  }

  // Worker path (currently unreachable, USE_WORKER=false)
  return new Promise((resolve) => {
    const id = ++reqId;
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      console.warn("[pipeline] worker timeout, falling back for", file.name);
      processViaCanvas(file).then(resolve).catch(() => resolve({ thumbnail: null, hash: "" }));
    }, TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    w.postMessage({ type: "process", id, file });
  });
}

export async function generateThumbnail(file) { return (await processImage(file)).thumbnail; }
export async function computeHash(file)       { return (await processImage(file)).hash; }
