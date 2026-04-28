/**
 * EditorialDailyCard — magazine-style hero card for today's recommendation.
 *
 * Layout: asymmetric, watch "hero" left (60%), copy right (40%).
 *   - Large dial face as photo stand-in (we don't carry watch photos in seed)
 *   - Weather glyph + temp top-right
 *   - One-line "why" in serif (Playfair Display via Google Fonts CSS)
 *   - Brand · model · ref in tight uppercase sans (Inter Tight)
 *   - Dramatic shadow on the dial
 *   - Color palette derived from dial (cached in module scope)
 *
 * Palette cache persists across re-renders in this session — recomputes when
 * the watchId changes.
 */

import React, { useMemo, useEffect } from "react";
import { paletteForWatch, composeWhy } from "../../features/editorial/dialPalette.js";

// Module-scoped palette cache (per the spec — recompute when watch changes)
const _paletteCache = new Map();
function getCachedPalette(watch) {
  if (!watch?.id) return paletteForWatch(watch);
  if (!_paletteCache.has(watch.id)) {
    _paletteCache.set(watch.id, paletteForWatch(watch));
  }
  return _paletteCache.get(watch.id);
}

// Lightweight font loader — injects Google Fonts <link> only once.
let _fontsLoaded = false;
function ensureEditorialFonts() {
  if (_fontsLoaded || typeof document === "undefined") return;
  _fontsLoaded = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=Inter+Tight:wght@500;700;800&display=swap";
  document.head.appendChild(link);
}

const SERIF = "'Playfair Display', 'Cormorant Garamond', Georgia, serif";
const SANS = "'Inter Tight', 'Inter', -apple-system, system-ui, sans-serif";

function weatherGlyph(weather) {
  if (!weather) return "·";
  const d = weather.description?.toLowerCase() ?? "";
  if (d.includes("clear")) return "☀";
  if (d.includes("rain")) return "☂";
  if (d.includes("snow")) return "❅";
  if (d.includes("thunder")) return "⚡";
  if (d.includes("cloud")) return "☁";
  if (d.includes("fog")) return "≈";
  return "·";
}

export default function EditorialDailyCard({ watch, weather = null, context = null, isDark = false, onSelect = null }) {
  useEffect(() => { ensureEditorialFonts(); }, []);

  const palette = useMemo(() => getCachedPalette(watch), [watch?.id]);
  const why = useMemo(() => composeWhy(watch, weather, context), [watch, weather, context]);

  if (!watch) return null;

  const ref = watch.ref ? watch.ref : "";
  const isReplica = !!watch.replica;
  const tempStr = weather?.tempC != null ? `${Math.round(weather.tempC)}°` : "";

  return (
    <div
      onClick={onSelect ? () => onSelect(watch) : undefined}
      style={{
        position: "relative",
        background: `linear-gradient(135deg, ${palette.bg} 0%, ${darken(palette.bg, 12)} 100%)`,
        borderRadius: 18,
        padding: "26px 24px",
        marginBottom: 18,
        overflow: "hidden",
        cursor: onSelect ? "pointer" : "default",
        boxShadow: isDark
          ? "0 12px 48px #00000077, 0 2px 8px #00000044"
          : "0 12px 48px #00000022, 0 2px 8px #00000011",
        minHeight: 220,
        color: palette.ink,
      }}
    >
      {/* Weather glyph + temp — top right */}
      {weather && (
        <div style={{
          position: "absolute", top: 16, right: 18,
          fontFamily: SANS, fontSize: 12, fontWeight: 700,
          letterSpacing: "0.08em", textTransform: "uppercase",
          color: palette.accent, opacity: 0.9,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>{weatherGlyph(weather)}</span>
          <span>{tempStr}</span>
        </div>
      )}

      {/* Asymmetric grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "minmax(120px, 38%) 1fr",
        gap: 24, alignItems: "center",
      }}>
        {/* Hero "photo" — large dial circle with dramatic shadow */}
        <div style={{
          position: "relative",
          width: "100%", aspectRatio: "1 / 1", maxWidth: 200,
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, ${lighten(palette.bg, 18)} 0%, ${palette.bg} 60%, ${darken(palette.bg, 25)} 100%)`,
          border: `4px solid ${palette.accent}`,
          boxShadow: `0 24px 48px ${shadowFor(palette.bg)}, 0 8px 16px ${shadowFor(palette.bg)}`,
          margin: "0 0 0 -8px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {/* Inner dial detail — minute markers */}
          <div style={{
            width: "78%", height: "78%", borderRadius: "50%",
            border: `1px solid ${palette.accent}55`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: palette.accent, fontFamily: SERIF, fontStyle: "italic",
            fontSize: 14, fontWeight: 500, opacity: 0.65,
          }}>
            {watch.brand?.split(" ")[0] ?? ""}
          </div>
        </div>

        {/* Editorial copy */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: SANS, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.18em", textTransform: "uppercase",
            color: palette.accent, marginBottom: 8, opacity: 0.85,
          }}>
            Today's pick{isReplica ? " · replica" : ""}
          </div>
          <div style={{
            fontFamily: SERIF, fontSize: 22, fontWeight: 500, fontStyle: "italic",
            lineHeight: 1.25, color: palette.ink, marginBottom: 14,
          }}>
            {why}
          </div>
          <div style={{
            fontFamily: SANS, fontSize: 16, fontWeight: 800,
            letterSpacing: "0.06em", textTransform: "uppercase",
            color: palette.ink, lineHeight: 1.15,
          }}>
            {watch.model}
          </div>
          <div style={{
            fontFamily: SANS, fontSize: 11, fontWeight: 600,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: palette.accent, marginTop: 4, opacity: 0.8,
          }}>
            {watch.brand}{ref ? ` · ${ref}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

// Reset cache (used by tests + when collection mutates)
export function _resetPaletteCache() {
  _paletteCache.clear();
}

// ── Tiny color utilities (no external dep) ──────────────────────────────────

function _hexToRgb(hex) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function _rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function darken(hex, pct) {
  const { r, g, b } = _hexToRgb(hex);
  const f = 1 - pct / 100;
  return _rgbToHex(r * f, g * f, b * f);
}

function lighten(hex, pct) {
  const { r, g, b } = _hexToRgb(hex);
  const f = pct / 100;
  return _rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
}

function shadowFor(hex) {
  const { r, g, b } = _hexToRgb(hex);
  // Always use a dark shadow for drama (regardless of bg lightness)
  const dark = darken(hex, 50);
  const drgb = _hexToRgb(dark);
  return `rgba(${drgb.r}, ${drgb.g}, ${drgb.b}, 0.55)`;
}
