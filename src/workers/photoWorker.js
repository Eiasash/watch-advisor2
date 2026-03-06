/**
 * Web Worker: thumbnail generation + perceptual hash.
 * Receives: { type: "process", id: number, file: File }
 * Posts:    { type: "result",  id: number, thumbnail: string, hash: string }
 *         | { type: "error",   id: number, message: string }
 */
self.onmessage = async (e) => {
  if (e.data.type !== "process") return;
  const { id, file } = e.data;
  try {
    const bitmap = await createImageBitmap(file);

    // Thumbnail 240×240 WebP
    const tc = new OffscreenCanvas(240, 240);
    tc.getContext("2d").drawImage(bitmap, 0, 0, 240, 240);
    const blob = await tc.convertToBlob({ type: "image/webp", quality: 0.82 });
    const thumbnail = await blobToDataURL(blob);

    // dHash 8×8
    const hc = new OffscreenCanvas(9, 8);
    hc.getContext("2d").drawImage(bitmap, 0, 0, 9, 8);
    const data = hc.getContext("2d").getImageData(0, 0, 9, 8).data;
    let hash = "";
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        hash += data[(y * 9 + x) * 4] > data[(y * 9 + x + 1) * 4] ? "1" : "0";
      }
    }

    bitmap.close();
    self.postMessage({ type: "result", id, thumbnail, hash });
  } catch (err) {
    self.postMessage({ type: "error", id, message: err?.message ?? String(err) });
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
