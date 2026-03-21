/**
 * Dominant color detection using bucketed RGB clustering.
 * Replaces naive average RGB with K-means-like clustering mapped to a fashion palette.
 */

const FASHION_PALETTE = [
  { name: "navy",   r: 20,  g: 35,  b: 85  },
  { name: "black",  r: 18,  g: 18,  b: 18  },
  { name: "gray",   r: 128, g: 128, b: 128 },
  { name: "white",  r: 242, g: 242, b: 242 },
  { name: "brown",  r: 95,  g: 55,  b: 25  },
  { name: "olive",  r: 95,  g: 105, b: 45  },
  { name: "tan",    r: 175, g: 140, b: 95  },
  { name: "beige",  r: 215, g: 198, b: 165 },
];

function colorDist(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2);
}

function nearestPaletteColor(r, g, b) {
  let best = FASHION_PALETTE[0];
  let bestD = Infinity;
  for (const p of FASHION_PALETTE) {
    const d = colorDist(r, g, b, p.r, p.g, p.b);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best.name;
}

function isBgPixel(r, g, b) {
  if (r > 215 && g > 215 && b > 215) return true;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 15 && r > 185) return true;
  if (r > 170 && g > 155 && b > 130 && Math.max(r, g, b) - Math.min(r, g, b) < 40) return true;
  return false;
}

/**
 * Extract dominant color from a thumbnail using bucketed RGB clustering.
 * Groups pixels into palette buckets and returns the most frequent.
 */
export function detectDominantColor(imageData, width, height) {
  const { data } = imageData;
  const buckets = {};
  let total = 0;
  const cx = width / 2;
  const cy = height / 2;
  const edgeZone = Math.min(width, height) * 0.22;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 100) continue;
      if (isBgPixel(r, g, b)) continue;

      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const weight = dist > (Math.min(cx, cy) - edgeZone) ? 1 : 3;
      const name = nearestPaletteColor(r, g, b);
      buckets[name] = (buckets[name] ?? 0) + weight;
      total += weight;
    }
  }

  if (total < 15) return null;

  const sorted = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const runner = sorted[1];

  // Avoid ambiguous gray when a real color is nearly as dominant
  if (top?.[0] === "gray" && runner && runner[1] > top[1] * 0.7) {
    return runner[0];
  }

  return top?.[0] ?? null;
}

