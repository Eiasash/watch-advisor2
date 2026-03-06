/**
 * Image pipeline — runs in a Web Worker to avoid blocking the UI.
 * Falls back to main thread canvas if Worker isn't available.
 */

let worker = null;
let workerReady = false;
const pending = new Map();
let reqId = 0;

function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/photoWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const { id, type, thumbnail, hash, message } = e.data;
      const resolve = pending.get(id);
      if (!resolve) return;
      pending.delete(id);
      if (type === "result") resolve({ thumbnail, hash });
      else resolve({ thumbnail: null, hash: null, error: message });
    };
    workerReady = true;
  } catch {
    workerReady = false;
  }
  return worker;
}

async function processViaCanvas(file) {
  const img = await createImageBitmap(file);

  const tc = document.createElement("canvas");
  tc.width = 240; tc.height = 240;
  tc.getContext("2d").drawImage(img, 0, 0, 240, 240);
  const thumbnail = tc.toDataURL("image/webp", 0.82);

  const hc = document.createElement("canvas");
  hc.width = 9; hc.height = 8;
  const hctx = hc.getContext("2d");
  hctx.drawImage(img, 0, 0, 9, 8);
  const data = hctx.getImageData(0, 0, 9, 8).data;
  let hash = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left  = data[(y * 9 + x) * 4];
      const right = data[(y * 9 + x + 1) * 4];
      hash += left > right ? "1" : "0";
    }
  }
  img.close?.();
  return { thumbnail, hash };
}

export function processImage(file) {
  return new Promise((resolve) => {
    const w = getWorker();
    if (!workerReady || !w) {
      processViaCanvas(file).then(resolve).catch(() => resolve({ thumbnail: null, hash: null }));
      return;
    }
    const id = ++reqId;
    pending.set(id, resolve);
    w.postMessage({ type: "process", file, id });
  });
}

// Legacy exports kept for backwards compat
export async function generateThumbnail(file) {
  const { thumbnail } = await processImage(file);
  return thumbnail;
}
export async function computeHash(file) {
  const { hash } = await processImage(file);
  return hash;
}
