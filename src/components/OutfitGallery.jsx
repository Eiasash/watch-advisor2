import { useState, useMemo } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useHistoryStore }  from "../stores/historyStore.js";
import { useWatchStore }    from "../stores/watchStore.js";
import { useThemeStore }    from "../stores/themeStore.js";

/**
 * OutfitGallery — dedicated view for all outfit/selfie photos.
 * Shows each photo with its worn date, watch, and tagged garments.
 * Also includes outfit photos attached to history entries (outfitPhotos array).
 */
export default function OutfitGallery() {
  const garments = useWardrobeStore(s => s.garments) ?? [];
  const entries  = useHistoryStore(s => s.entries) ?? [];
  const watches  = useWatchStore(s => s.watches) ?? [];
  const { mode } = useThemeStore();
  const isDark   = mode === "dark";

  const [lightbox, setLightbox] = useState(null);
  const [filter,   setFilter]   = useState("all"); // "all" | "outfit" | "logged"

  const bg     = isDark ? "#101114" : "#f9fafb";
  const card   = isDark ? "#13161f" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const sub    = isDark ? "#8b93a7" : "#6b7280";

  // ── Build photo items ────────────────────────────────────────────────────────
  const items = useMemo(() => {
    const out = [];

    // 1. Standalone outfit photos in wardrobe (type=outfit-photo / excludeFromWardrobe)
    const outfitPhotos = garments.filter(g =>
      g.type === "outfit-photo" || g.type === "outfit-shot" || g.excludeFromWardrobe
    );
    for (const g of outfitPhotos) {
      const src = g.thumbnail || g.photoUrl;
      if (!src) continue;
      out.push({
        id:     `wardrobe-${g.id}`,
        src,
        date:   g.lastWorn ?? null,
        label:  g.name ?? "Outfit photo",
        source: "wardrobe",
      });
    }

    // 2. Outfit photos attached to history entries (logged via TodayPanel "Add photo")
    for (const e of entries) {
      const watch = watches.find(w => w.id === e.watchId);
      const wornGarments = (e.garmentIds ?? [])
        .map(id => garments.find(g => g.id === id))
        .filter(Boolean);

      const photos = [
        e.outfitPhoto  ? { src: e.outfitPhoto,  idx: 0 } : null,
        ...(e.outfitPhotos ?? []).map((s, i) => s ? { src: s, idx: i } : null),
      ].filter(Boolean);

      for (const p of photos) {
        out.push({
          id:       `history-${e.id}-${p.idx}`,
          src:       p.src,
          date:      e.date,
          label:     watch ? `${watch.brand} ${watch.model}` : "Logged outfit",
          watchName: watch ? `${watch.brand} ${watch.model}` : null,
          context:   e.context ?? null,
          garments:  wornGarments,
          strapLabel: e.strapLabel ?? null,
          source:    "history",
        });
      }
    }

    // Sort newest first
    return out.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });
  }, [garments, entries, watches]);

  const filtered = filter === "all" ? items
    : filter === "logged" ? items.filter(i => i.source === "history")
    : items.filter(i => i.source === "wardrobe");

  const counts = {
    all:     items.length,
    logged:  items.filter(i => i.source === "history").length,
    wardrobe: items.filter(i => i.source === "wardrobe").length,
  };

  if (!items.length) return (
    <div style={{ padding: "40px 20px", textAlign: "center", color: sub }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📷</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 6 }}>No outfit photos yet</div>
      <div style={{ fontSize: 13 }}>Log an outfit in Today and attach a photo — it'll appear here.</div>
    </div>
  );

  return (
    <div style={{ padding: "0 0 24px" }}>
      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["all","All"], ["logged","Logged"], ["wardrobe","Standalone"]].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            border: `1px solid ${filter === k ? "#3b82f6" : border}`,
            background: filter === k ? "#3b82f622" : "transparent",
            color: filter === k ? "#3b82f6" : sub,
            cursor: "pointer",
          }}>
            {label} <span style={{ opacity: 0.65 }}>({counts[k]})</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 10,
      }}>
        {filtered.map(item => (
          <div key={item.id} onClick={() => setLightbox(item)}
            style={{
              borderRadius: 12, overflow: "hidden", cursor: "pointer",
              background: card, border: `1px solid ${border}`,
              boxShadow: isDark ? "none" : "0 1px 4px #0000000a",
              transition: "transform 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.transform = "scale(1.02)"}
            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
            <div style={{ aspectRatio: "3/4", overflow: "hidden", position: "relative" }}>
              <img src={item.src} alt={item.label}
                style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {item.source === "history" && (
                <div style={{
                  position: "absolute", top: 6, right: 6,
                  background: "#3b82f6cc", borderRadius: 6,
                  padding: "2px 6px", fontSize: 10, fontWeight: 700, color: "#fff",
                }}>
                  ⌚
                </div>
              )}
            </div>
            <div style={{ padding: "8px 10px" }}>
              {item.date && (
                <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 700, marginBottom: 2 }}>
                  {formatDate(item.date)}
                </div>
              )}
              <div style={{ fontSize: 12, fontWeight: 600, color: text, lineClamp: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.label}
              </div>
              {item.context && (
                <div style={{ fontSize: 11, color: sub, marginTop: 1, textTransform: "capitalize" }}>
                  {item.context.replace(/-/g, " ")}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.9)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{ maxWidth: 480, width: "100%", borderRadius: 16, overflow: "hidden",
                     background: card, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <img src={lightbox.src} alt={lightbox.label}
              style={{ width: "100%", maxHeight: "65vh", objectFit: "contain", background: "#000" }} />
            <div style={{ padding: "14px 16px", overflowY: "auto" }}>
              {lightbox.date && (
                <div style={{ fontSize: 12, color: "#3b82f6", fontWeight: 700, marginBottom: 4 }}>
                  {formatDate(lightbox.date)}
                </div>
              )}
              <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 6 }}>
                {lightbox.label}
              </div>
              {lightbox.context && (
                <div style={{ fontSize: 12, color: sub, marginBottom: 6, textTransform: "capitalize" }}>
                  📍 {lightbox.context.replace(/-/g, " ")}
                </div>
              )}
              {lightbox.strapLabel && (
                <div style={{ fontSize: 12, color: sub, marginBottom: 6 }}>
                  🧲 {lightbox.strapLabel}
                </div>
              )}
              {lightbox.garments?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: sub, textTransform: "uppercase",
                                letterSpacing: "0.06em", marginBottom: 5 }}>Worn with</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {lightbox.garments.map(g => (
                      <div key={g.id} style={{
                        padding: "3px 8px", borderRadius: 6, fontSize: 11,
                        background: isDark ? "#1a1f2b" : "#f3f4f6",
                        border: `1px solid ${border}`, color: text,
                      }}>
                        {g.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setLightbox(null)} style={{
              margin: "0 16px 14px", padding: "10px 0", borderRadius: 10,
              border: `1px solid ${border}`, background: "transparent",
              color: sub, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}
