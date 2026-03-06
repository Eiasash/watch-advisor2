/**
 * Web Worker: thumbnail generation + perceptual hash.
 * Receives: { type: "process", file: File }
 * Posts back: { type: "result", thumbnail: string, hash: string }
 *           | { type: "error", message: string }
 */
self.onmessage = async (e) => {
  if (e.data.type !== "process") return;
  try {
    const { file } = e.data;

    // Thumbnail
    const bitmap = await createImageBitmap(file);
    const tc = new OffscreenCanvas(240, 240);
    const tctx = tc.getContext("2d");
    tctx.drawImage(bitmap, 0, 0, 240, 240);
    const blob = await tc.convertToBlob({ type: "image/webp", quality: 0.82 });
    const thumbnail = await blobToDataURL(blob);

    // Perceptual hash (dHash 8x8)
    const hc = new OffscreenCanvas(9, 8);
    const hctx = hc.getContext("2d");
    hctx.drawImage(bitmap, 0, 0, 9, 8);
    const data = hctx.getImageData(0, 0, 9, 8).data;
    let hash = "";
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const left  = data[(y * 9 + x) * 4];
        const right = data[(y * 9 + x + 1) * 4];
        hash += left > right ? "1" : "0";
      }
    }

    bitmap.close();
    self.postMessage({ type: "result", thumbnail, hash });
  } catch (err) {
    self.postMessage({ type: "error", message: err.message });
  }
};

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error("FileReader failed"));
    fr.readAsDataURL(blob);
  });
}
