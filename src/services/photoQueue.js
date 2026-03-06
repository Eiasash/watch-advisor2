import { saveImage } from "./localCache.js";

const queue = [];
let running = false;

export function enqueueOriginalCache(id, file) {
  queue.push({ id, file });
  drain();
}

async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const { id, file } = queue.shift();
    try {
      await saveImage(id, file);
    } catch (e) {
      console.warn("[photoQueue] failed to cache image", id, e);
    }
  }
  running = false;
}
