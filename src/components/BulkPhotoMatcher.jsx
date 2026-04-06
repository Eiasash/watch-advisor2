import React, { useState, useRef, useCallback } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { uploadPhoto } from "../services/supabaseSync.js";
import { setCachedState } from "../services/localCache.js";
import { enqueueTask } from "../services/backgroundQueue.js";

function resizeForUpload(file, maxPx = 512) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const CATEGORY_ORDER = ["jacket", "sweater", "shirt", "pants", "shoes", "belt"];
const CATEGORY_LABELS = {
  jacket: "Outerwear", sweater: "Knitwear", shirt: "Shirts",
  pants: "Bottoms", shoes: "Footwear", belt: "Belts",
};

export default function BulkPhotoMatcher() {
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const garments = useWardrobeStore(s => s.garments) ?? [];
  const updateGarment = useWardrobeStore(s => s.updateGarment);
  const watches = useWatchStore(s => s.watches) ?? [];
  const history = useHistoryStore(s => s.entries) ?? [];
  const [uploading, setUploading] = useState(null); // garment id being uploaded
  const [done, setDone] = useState(new Set());
  const inputRef = useRef();
  const targetRef = useRef(null); // which garment ID we're picking for

  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  const card = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";

  const handlePick = useCallback((garmentId) => {
    targetRef.current = garmentId;
    inputRef.current?.click();
  }, []);

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !targetRef.current) return;

    const gId = targetRef.current;
    setUploading(gId);

    try {
      const dataUrl = await resizeForUpload(file);

      // Update local state immediately (shows thumbnail)
      updateGarment(gId, { thumbnail: dataUrl });

      // Upload to Supabase Storage
      const publicUrl = await uploadPhoto(gId, dataUrl, "thumbnail");
      if (publicUrl) {
        updateGarment(gId, { photoUrl: publicUrl });
      }

      // Persist to IDB immediately so tab-close doesn't lose it
      const updatedGarments = useWardrobeStore.getState().garments;
      await setCachedState({ garments: updatedGarments, watches, history }).catch(() => {});

      // Queue a push-garment to sync the URL
      const updatedGarment = updatedGarments.find(g => g.id === gId);
      if (updatedGarment) {
        enqueueTask("push-garment", { garment: updatedGarment }, `push-${gId}`);
      }

      setDone(prev => new Set([...prev, gId]));
    } catch (err) {
      console.warn("[BulkPhotoMatcher] upload failed:", err.message);
    } finally {
      setUploading(null);
      targetRef.current = null;
    }
  }, [garments, updateGarment]);

  // Group by category — skip excluded and outfit-photos
  const grouped = {};
  for (const g of garments) {
    if (g.excludeFromWardrobe) continue;
    const cat = g.type ?? g.category ?? "other";
    if (cat === "outfit-photo") continue;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(g);
  }

  const totalWithPhoto = garments.filter(g => !g.excludeFromWardrobe && g.thumbnail || !g.excludeFromWardrobe && g.photoUrl).length;
  const totalWearable = garments.filter(g => !g.excludeFromWardrobe && (g.type ?? g.category) !== "outfit-photo").length;

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 4 }}>
        📷 Bulk Photo Matcher
      </div>
      <div style={{ fontSize: 12, color: muted, marginBottom: 12 }}>
        {totalWithPhoto}/{totalWearable} garments have photos. Tap any item to attach a photo.
      </div>

      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />

      {CATEGORY_ORDER.map(cat => {
        const items = grouped[cat];
        if (!items?.length) return null;
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase",
                          letterSpacing: "0.08em", marginBottom: 6 }}>
              {CATEGORY_LABELS[cat] ?? cat} ({items.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {items.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")).map(g => {
                const hasPhoto = !!(g.thumbnail || g.photoUrl);
                const isUploading = uploading === g.id;
                const justDone = done.has(g.id);
                return (
                  <div key={g.id}
                    onClick={() => !isUploading && handlePick(g.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                      borderRadius: 8, border: `1px solid ${border}`, background: card,
                      cursor: isUploading ? "default" : "pointer",
                      opacity: isUploading ? 0.6 : 1,
                    }}>
                    {/* Thumbnail or placeholder */}
                    {hasPhoto ? (
                      <img src={g.thumbnail || g.photoUrl} alt="" style={{
                        width: 36, height: 36, objectFit: "cover", borderRadius: 6, flexShrink: 0,
                      }} />
                    ) : (
                      <div style={{
                        width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                        background: isDark ? "#1f2937" : "#f3f4f6",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, color: muted,
                      }}>📷</div>
                    )}

                    {/* Name + color */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: text,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.name}
                      </div>
                      <div style={{ fontSize: 11, color: muted }}>{g.color}</div>
                    </div>

                    {/* Status */}
                    {isUploading && (
                      <div style={{ width: 16, height: 16, border: "2px solid rgba(59,130,246,0.3)",
                                    borderTopColor: "#3b82f6", borderRadius: "50%",
                                    animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                    )}
                    {!isUploading && justDone && (
                      <span style={{ color: "#10b981", fontSize: 14, flexShrink: 0 }}>✓</span>
                    )}
                    {!isUploading && !justDone && !hasPhoto && (
                      <span style={{ color: muted, fontSize: 11, flexShrink: 0 }}>tap to add</span>
                    )}
                    {!isUploading && !justDone && hasPhoto && (
                      <span style={{ color: muted, fontSize: 11, flexShrink: 0 }}>tap to replace</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
