import React from "react";
import WeeklyDigest from "./WeeklyDigest.jsx";
import SelfiePanel  from "../SelfiePanel.jsx";
import ClaudePick   from "../ClaudePick.jsx";

/**
 * The full "already logged" view shown after an outfit is saved for today.
 * Renders all today's entries, photo prompts, share card, quick check-in,
 * WeeklyDigest, ClaudePick, SelfiePanel, and an "Edit today's log" button.
 */
export default function LoggedSummary({
  todayEntries, todayEntry,
  watches, garments,
  weather,
  straps, activeStrap,
  upsertEntry, removeEntry,
  context,
  setSelected, setWatchId, setContext, setNotes, setExtraImgs, setLogged,
  isDark, card, border, text, muted,
  TODAY_ISO,
}) {
  return (
    <div style={{ padding: "0 0 80px" }}>
      {/* ── Main entries ──────────────────────────────────────────────────────── */}
      <div style={{ background: card, borderRadius: 16, border: `1px solid ${border}`, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: text, marginBottom: 4 }}>
          Today ✅ {todayEntries.length > 1 && (
            <span style={{ fontSize: 13, fontWeight: 600, color: muted }}>· {todayEntries.length} watches</span>
          )}
        </div>
        <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>{TODAY_ISO}</div>

        {todayEntries.map((te, teIdx) => {
          const watch = watches.find(w => w.id === te.watchId);
          const wornGarments = garments.filter(g => (te.garmentIds ?? []).includes(g.id));
          const slotLabel = te.timeSlot
            ? { morning: "🌅 Morning", afternoon: "☀️ Afternoon", evening: "🌆 Evening", night: "🌙 Night" }[te.timeSlot]
            : null;

          return (
            <div key={te.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${border}` }}>
              {(slotLabel || todayEntries.length > 1) && (
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6,
                              color: te.timeSlot ? "#3b82f6" : "#22c55e" }}>
                  {slotLabel ?? (teIdx === 0 ? "Primary" : `Outfit ${teIdx + 1}`)}
                </div>
              )}

              {watch && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10,
                              padding: "10px 14px", borderRadius: 10, background: isDark ? "#0f131a" : "#f3f4f6",
                              border: `1px solid ${border}` }}>
                  <div style={{ fontSize: 28 }}>{watch.emoji ?? "⌚"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{watch.brand} {watch.model}</div>
                    <div style={{ fontSize: 11, color: muted }}>
                      {te.strapLabel ?? watch.dial + " dial"} · {te.context ?? "any vibe"}
                    </div>
                  </div>
                </div>
              )}

              {wornGarments.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(80px,1fr))", gap: 8 }}>
                  {wornGarments.map(g => (
                    <div key={g.id} style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${border}` }}>
                      {(g.thumbnail || g.photoUrl) ? (
                        <img src={g.thumbnail || g.photoUrl} alt={g.name ?? g.color ?? ""}
                          style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
                      ) : (
                        <div style={{ width: "100%", aspectRatio: "3/4", display: "flex", alignItems: "center",
                                      justifyContent: "center", background: isDark ? "#0f131a" : "#f3f4f6", fontSize: 20 }}>👕</div>
                      )}
                      <div style={{ padding: "2px 4px", fontSize: 11, color: muted, textAlign: "center" }}>
                        {g.name?.slice(0, 14)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(te.outfitPhotos?.length || te.outfitPhoto) && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "grid",
                                gridTemplateColumns: (te.outfitPhotos?.length ?? 1) > 1 ? "repeat(2, 1fr)" : "1fr", gap: 6 }}>
                    {(te.outfitPhotos ?? (te.outfitPhoto ? [te.outfitPhoto] : [])).map((src, i) => (
                      <img key={i} src={src} alt={`outfit ${i + 1}`}
                        style={{ width: "100%", borderRadius: 10, objectFit: "cover", maxHeight: 300, display: "block" }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <label style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px dashed ${border}`,
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                                    cursor: "pointer", color: muted, fontSize: 10, fontWeight: 600 }}>
                      📁 Add from gallery
                      <input type="file" accept="image/*" multiple style={{ display: "none" }}
                        onChange={async (ev) => {
                          const files = Array.from(ev.target.files ?? []);
                          if (!files.length) return;
                          const existing = te.outfitPhotos ?? (te.outfitPhoto ? [te.outfitPhoto] : []);
                          const newPhotos = [];
                          for (const file of files) {
                            const dataUrl = await new Promise((res) => {
                              const reader = new FileReader();
                              reader.onload = () => res(reader.result);
                              reader.readAsDataURL(file);
                            });
                            newPhotos.push(dataUrl);
                          }
                          const all = [...existing, ...newPhotos];
                          upsertEntry({ ...te, outfitPhoto: all[0], outfitPhotos: all });
                        }}
                      />
                    </label>
                    <label style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px dashed ${border}`,
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                                    cursor: "pointer", color: muted, fontSize: 10, fontWeight: 600 }}>
                      📷 Camera
                      <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                        onChange={async (ev) => {
                          const file = ev.target.files?.[0];
                          if (!file) return;
                          const existing = te.outfitPhotos ?? (te.outfitPhoto ? [te.outfitPhoto] : []);
                          const reader = new FileReader();
                          reader.onload = () => {
                            const all = [...existing, reader.result];
                            upsertEntry({ ...te, outfitPhoto: all[0], outfitPhotos: all });
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Editable notes */}
              <div style={{ marginTop: 8 }}>
                <textarea
                  defaultValue={te.notes ?? ""}
                  placeholder="Add notes or remarks..."
                  onBlur={(ev) => {
                    const val = ev.target.value.trim();
                    if (val !== (te.notes ?? "")) {
                      upsertEntry({ ...te, notes: val || null });
                    }
                  }}
                  rows={2}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 8,
                    border: `1px solid ${border}`, background: isDark ? "#0f131a" : "#f9fafb",
                    color: text, fontSize: 12, resize: "none", fontFamily: "inherit",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Edit / Delete buttons */}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={() => {
                  setSelected(new Set(te.garmentIds ?? []));
                  setWatchId(te.watchId ?? watches[0]?.id ?? null);
                  setContext(te.context ?? null);
                  setNotes(te.notes ?? "");
                  setExtraImgs(te.outfitPhotos ?? (te.outfitPhoto ? [te.outfitPhoto] : []));
                  setLogged(false);
                }} style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${isDark ? "#3b82f633" : "#3b82f633"}`,
                  background: isDark ? "#1e3a5f18" : "#eff6ff",
                  color: "#3b82f6", cursor: "pointer",
                }}>
                  ✏️ Edit outfit
                </button>
                <button onClick={() => {
                  if (confirm("Delete this entry?")) {
                    removeEntry(te.id);
                    if (todayEntries.length <= 1) setLogged(false);
                  }
                }} style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${isDark ? "#ef444433" : "#ef444433"}`,
                  background: isDark ? "#7f1d1d18" : "#fef2f2",
                  color: "#ef4444", cursor: "pointer",
                }}>
                  🗑️
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Photo prompt ──────────────────────────────────────────────────────── */}
      {todayEntries.length > 0 && !todayEntries[0]?.outfitPhoto && !todayEntries[0]?.outfitPhotos?.length && (
        <div style={{ background: card, borderRadius: 14, border: `1px dashed ${border}`, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>📸</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: text }}>Add outfit photo</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${border}`,
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                            cursor: "pointer", color: muted, fontSize: 12, fontWeight: 600 }}>
              📁 Gallery
              <input type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  const entry = todayEntries[0];
                  if (!entry) return;
                  const photos = [];
                  for (const file of files) {
                    const dataUrl = await new Promise((res) => {
                      const reader = new FileReader();
                      reader.onload = () => res(reader.result);
                      reader.readAsDataURL(file);
                    });
                    photos.push(dataUrl);
                  }
                  upsertEntry({ ...entry, outfitPhoto: photos[0], outfitPhotos: photos });
                }}
              />
            </label>
            <label style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${border}`,
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                            cursor: "pointer", color: muted, fontSize: 12, fontWeight: 600 }}>
              📷 Camera
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const entry = todayEntries[0];
                  if (!entry) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    upsertEntry({ ...entry, outfitPhoto: reader.result, outfitPhotos: [reader.result] });
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          </div>
          <div style={{ fontSize: 10, color: muted, marginTop: 6, textAlign: "center" }}>
            Snap a quick outfit pic for your history
          </div>
        </div>
      )}

      {/* ── Share outfit card ─────────────────────────────────────────────────── */}
      {todayEntries.length > 0 && (
        <button
          onClick={async () => {
            try {
              const { generateOutfitCard } = await import("../../domain/outfitCard.js");
              const te = todayEntries[0];
              const w = watches.find(x => x.id === te.watchId);
              const wornG = garments.filter(g => (te.garmentIds ?? []).includes(g.id));
              const outfitMap = {};
              for (const g of wornG) {
                const cat = g.type;
                if (!outfitMap[cat]) outfitMap[cat] = g.name;
              }
              const dataUrl = await generateOutfitCard({
                watch: w ? `${w.brand} ${w.model}` : te.watchId,
                strap: te.strapLabel ?? "default",
                outfit: { shirt: outfitMap.shirt, pants: outfitMap.pants, shoes: outfitMap.shoes, sweater: outfitMap.sweater, jacket: outfitMap.jacket },
                weather: weather ? { tempC: weather.tempC } : null,
                score: te.score,
                date: new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
                context: te.context,
              });
              if (navigator.share) {
                const blob = await (await fetch(dataUrl)).blob();
                const file = new File([blob], "outfit-card.png", { type: "image/png" });
                await navigator.share({ files: [file], title: "Today's Outfit" });
              } else {
                const a = document.createElement("a");
                a.href = dataUrl;
                a.download = `outfit-${TODAY_ISO}.png`;
                a.click();
              }
            } catch (_) {}
          }}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 12,
            border: `1px solid ${border}`, background: card,
            color: text, fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            marginBottom: 14,
          }}
        >
          <span>🎴</span> Share outfit card
        </button>
      )}

      <WeeklyDigest />
      <ClaudePick />

      <SelfiePanel context={todayEntry?.context ?? null} watchId={todayEntry?.watchId ?? null} />

      {/* ── Quick watch check-in — adds a NEW entry, doesn't overwrite ─────────── */}
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", textTransform: "uppercase",
                      letterSpacing: "0.06em", marginBottom: 10 }}>
          ⌚ Log another watch
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
          {watches.filter(w => !todayEntries.some(te => te.watchId === w.id)).slice(0, 8).map(w => {
            const strapObj = activeStrap[w.id] && straps[activeStrap[w.id]];
            return (
              <button key={w.id}
                onClick={() => {
                  upsertEntry({
                    id: `wear-${TODAY_ISO}-${w.id}`,
                    date: TODAY_ISO,
                    watchId: w.id,
                    garmentIds: [],
                    quickLog: true,
                    context: context ?? null,
                    strapId: activeStrap[w.id] ?? null,
                    strapLabel: strapObj?.label ?? null,
                    loggedAt: new Date().toISOString(),
                  });
                }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                         borderRadius: 8, border: `1px solid ${border}`, background: isDark ? "#0f131a" : "#f9fafb",
                         color: text, fontSize: 11, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{w.emoji ?? "⌚"}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {w.model}
                  </div>
                  <div style={{ fontSize: 10, color: muted }}>{w.replica ? "replica" : "genuine"}</div>
                </div>
              </button>
            );
          })}
        </div>
        {watches.length > todayEntries.length + 8 && (
          <button
            onClick={() => { setLogged(false); }}
            style={{ marginTop: 8, fontSize: 11, color: "#3b82f6", background: "none", border: "none", cursor: "pointer" }}>
            Show all {watches.length} watches →
          </button>
        )}
      </div>

      {/* ── Edit today's log ──────────────────────────────────────────────────── */}
      <button onClick={() => {
        if (todayEntry) {
          setSelected(new Set(todayEntry.garmentIds ?? []));
          setWatchId(todayEntry.watchId ?? watches[0]?.id ?? null);
          setContext(todayEntry.context ?? null);
          setNotes(todayEntry.notes ?? "");
          setExtraImgs(todayEntry.outfitPhotos ?? (todayEntry.outfitPhoto ? [todayEntry.outfitPhoto] : []));
        }
        setLogged(false);
      }} style={{ width: "100%", padding: "12px 0", borderRadius: 10,
        border: `1px solid ${border}`, background: "transparent", color: muted, fontSize: 13, cursor: "pointer" }}>
        Edit today's log
      </button>
    </div>
  );
}
