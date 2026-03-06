export async function generateThumbnail(file) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 240;
  canvas.height = 240;
  ctx.drawImage(img, 0, 0, 240, 240);
  return canvas.toDataURL("image/webp", 0.82);
}

export async function computeHash(file) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 9;
  canvas.height = 8;
  ctx.drawImage(img, 0, 0, 9, 8);
  const data = ctx.getImageData(0, 0, 9, 8).data;
  let hash = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[(y * 9 + x) * 4];
      const right = data[(y * 9 + x + 1) * 4];
      hash += left > right ? "1" : "0";
    }
  }
  return hash;
}
