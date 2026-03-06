import { saveImage } from "./localCache.js";

const queue = [];
let running = false;

export function enqueueOriginalCache(file) {
  queue.push(file);
  run();
}

async function run() {
  if (running) return;
  running = true;
  while (queue.length) {
    const file = queue.shift();
    await saveImage(`img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, file);
  }
  running = false;
}
