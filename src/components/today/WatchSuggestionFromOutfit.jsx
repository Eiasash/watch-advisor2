/**
 * WatchSuggestionFromOutfit — reverse engine UI.
 *
 * v1.13.12 — user request 2026-05-06: "have the app suggest a different
 * watch based on what clothes I picked." Today flow assumes watch-first;
 * this component flips it: once you've chosen ≥2 garments, the engine ranks
 * your collection by best match and lets you tap to pick.
 *
 * Hidden until ≥2 garments are selected (1 garment isn't enough signal —
 * the engine score becomes noisy, every watch looks the same).
 *
 * Shows top-3 watches with one-tap apply. Reuses the same colorMatch /
 * formalityMatch / watchCompatibility scoring used in the forward path,
 * weighted per slot (shoes + belt heavier — strap pairing is the strongest
 * signal). See src/outfitEngine/watchSuggester.js.
 */
import { useState, useMemo } from "react";
import { suggestWatchForOutfit } from "../../outfitEngine/watchSuggester.js";
import { normalizeType } from "../../classifier/normalizeType.js";

const SLOTS = ["shirt", "pants", "shoes", "jacket", "sweater", "belt"];

function buildOutfitFromSelected(selected, garments) {
  const out = {};
  for (const id of selected) {
    const g = garments.find(x => x.id === id);
    if (!g) continue;
    const slot = normalizeType(g.type ?? g.category ?? "") || "accessory";
    if (SLOTS.includes(slot) && !out[slot]) out[slot] = g;
  }
  return out;
}

export default function WatchSuggestionFromOutfit({
  selected, garments, watches, currentWatchId, onPickWatch, isDark,
}) {
  const [expanded, setExpanded] = useState(false);

  const outfit = useMemo(
    () => buildOutfitFromSelected(selected, garments),
    [selected, garments],
  );

  const suggestions = useMemo(() => {
    if (Object.keys(outfit).length < 2) return [];
    return suggestWatchForOutfit(watches, outfit, { limit: 3 });
  }, [outfit, watches]);

  // Hide entirely until we have signal — empty UI is better than noisy UI.
  if (selected.size < 2 || suggestions.length === 0) return null;

  const card = isDark ? "#161b22" : "#fefce8";
  const border = isDark ? "#92400e30" : "#fbbf2440";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#8b93a7" : "#6b7280";
  const accent = "#f59e0b";

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 14, marginBottom: 14 }}>
      <button
        onClick={() => setExpanded(v => !v)}
        aria-label="Show watch suggestions matched to your outfit"
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "transparent", border: "none", cursor: "pointer", padding: 0, color: text,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>🪄</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Match watch to your outfit
          </span>
        </div>
        <span style={{ fontSize: 11, color: muted }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, color: muted, marginBottom: 4 }}>
            Top {suggestions.length} watches scored against your {Object.keys(outfit).length}-piece outfit
          </div>
          {suggestions.map(({ watch, score, reasons }, i) => {
            const isCurrent = watch.id === currentWatchId;
            return (
              <button
                key={watch.id}
                onClick={() => onPickWatch?.(watch.id)}
                disabled={isCurrent}
                aria-label={`Pick ${watch.brand} ${watch.model} — match score ${score}`}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 8,
                  border: `1px solid ${isCurrent ? accent : (isDark ? "#2b3140" : "#e5e7eb")}`,
                  background: isCurrent ? `${accent}18` : (isDark ? "#0f131a" : "#fff"),
                  color: text, fontSize: 12, cursor: isCurrent ? "default" : "pointer",
                  textAlign: "left", minHeight: 36,
                }}
              >
                <span style={{ fontSize: 13, opacity: 0.6 }}>#{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {watch.brand} {watch.model}
                  </div>
                  {reasons.length > 0 && (
                    <div style={{ fontSize: 10, color: muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {reasons[0]}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: accent, flexShrink: 0 }}>
                  {score.toFixed(1)}
                </div>
                {isCurrent && (
                  <span style={{ fontSize: 9, color: accent, fontWeight: 700, flexShrink: 0 }}>SELECTED</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
