/**
 * outfitCard — generates a share-ready outfit summary card.
 * Returns a data URL (PNG) of the card for saving/sharing.
 *
 * Usage: const dataUrl = await generateOutfitCard({ watch, strap, outfit, weather, score, date });
 */

const CARD_WIDTH = 720;
const CARD_HEIGHT = 400;

/**
 * @param {object} opts
 * @param {string} opts.watch - "Brand Model"
 * @param {string} opts.strap - strap label
 * @param {object} opts.outfit - { shirt, pants, shoes, sweater, jacket }
 * @param {object} opts.weather - { tempC, description }
 * @param {number} opts.score - 5-10 rating
 * @param {string} opts.date - "Mon, Apr 6"
 * @param {string} [opts.context] - "smart-casual", "clinic", etc.
 * @returns {Promise<string>} data URL PNG
 */
export async function generateOutfitCard(opts) {
  const { watch, strap, outfit = {}, weather, score, date, context } = opts;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  grad.addColorStop(0, "#0f172a");
  grad.addColorStop(1, "#1e293b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Header bar
  ctx.fillStyle = "#1e40af";
  ctx.fillRect(0, 0, CARD_WIDTH, 60);

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("⌚ Watch Advisor", 20, 40);

  // Date + context
  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${date ?? ""}${context ? " · " + context : ""}`, CARD_WIDTH - 20, 40);
  ctx.textAlign = "left";

  // Watch + Strap section
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 20px -apple-system, sans-serif";
  ctx.fillText(watch ?? "No watch", 20, 100);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px -apple-system, sans-serif";
  ctx.fillText(strap ?? "default strap", 20, 122);

  // Divider
  ctx.strokeStyle = "#334155";
  ctx.beginPath();
  ctx.moveTo(20, 140);
  ctx.lineTo(CARD_WIDTH - 20, 140);
  ctx.stroke();

  // Outfit items
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "15px -apple-system, sans-serif";
  let y = 168;
  const items = [
    outfit.jacket && `🧥 ${outfit.jacket}`,
    outfit.sweater && `🧶 ${outfit.sweater}`,
    outfit.shirt && `👔 ${outfit.shirt}`,
    outfit.pants && `👖 ${outfit.pants}`,
    outfit.shoes && `👞 ${outfit.shoes}`,
  ].filter(Boolean);

  for (const item of items) {
    ctx.fillText(item, 30, y);
    y += 28;
  }

  // Weather
  if (weather) {
    ctx.fillStyle = "#64748b";
    ctx.font = "13px -apple-system, sans-serif";
    ctx.fillText(`🌡️ ${weather.tempC ?? "?"}°C${weather.description ? " · " + weather.description : ""}`, 20, CARD_HEIGHT - 50);
  }

  // Score badge
  if (score != null) {
    const badgeX = CARD_WIDTH - 80;
    const badgeY = CARD_HEIGHT - 80;
    ctx.fillStyle = score >= 8 ? "#22c55e" : score >= 6 ? "#3b82f6" : "#f59e0b";
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(score), badgeX, badgeY + 8);
    ctx.textAlign = "left";

    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SCORE", badgeX, badgeY + 50);
    ctx.textAlign = "left";
  }

  // Watermark
  ctx.fillStyle = "#334155";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.fillText("watch-advisor2.netlify.app", 20, CARD_HEIGHT - 15);

  return canvas.toDataURL("image/png");
}
