/**
 * StyleDNA — visual dashboard of your personal style patterns.
 * Analyzes wear history to show: color preferences, formality range,
 * watch-outfit affinity, comfort zone, and rejection insights.
 */
import React, { useMemo, useState } from "react";
import { useHistoryStore } from "../stores/historyStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useRejectStore } from "../stores/rejectStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { buildStyleDNA } from "../domain/styleDNA.js";
import { buildRejectionProfile, rejectedColorCombos } from "../domain/rejectionIntelligence.js";
import { buildStrapLifecycle, strapsNeedingAttention } from "../domain/strapLifecycle.js";

const COLOR_SWATCH = {
  black:"#1f2937", white:"#f3f4f6", navy:"#1e3a5f", blue:"#2563eb", grey:"#9ca3af",
  brown:"#78350f", tan:"#d4a574", khaki:"#c4b96a", beige:"#d6cfc0", cream:"#f5f0e0",
  green:"#16a34a", olive:"#65730a", teal:"#0d9488", burgundy:"#6b1d1d", red:"#dc2626",
  coral:"#f97316", yellow:"#eab308", stone:"#a8a29e", slate:"#64748b",
  "light blue":"#93c5fd", "dark brown":"#78350f", mink:"#c4a882", cognac:"#a0522d",
};

function swatch(color) { return COLOR_SWATCH[color?.toLowerCase()] ?? "#6b7280"; }

function Section({ title, icon, children, isDark, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const border = isDark ? "#2b3140" : "#d1d5db";
  return (
    <div style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${border}`,
                  background: isDark ? "#0f131a" : "#fff", overflow: "hidden" }}>
      <div onClick={() => setOpen(!open)} style={{
        padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "space-between", background: isDark ? "#171a21" : "#f9fafb",
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937" }}>
          {icon} {title}
        </span>
        <span style={{ fontSize: 10, color: isDark ? "#6b7280" : "#9ca3af" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div style={{ padding: 14 }}>{children}</div>}
    </div>
  );
}

function ProgressBar({ value, max, color, isDark, label, sublabel }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#e2e8f0" : "#1f2937" }}>{label}</span>
        <span style={{ fontSize: 10, color: isDark ? "#6b7280" : "#9ca3af" }}>{sublabel}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: isDark ? "#1a1f2b" : "#e5e7eb", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: color, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

export default function StyleDNA() {
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const history = useHistoryStore(s => s.entries);
  const garments = useWardrobeStore(s => s.garments);
  const watches = useWatchStore(s => s.watches);
  const rejectEntries = useRejectStore(s => s.entries);

  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";

  const dna = useMemo(() => buildStyleDNA(history, garments, watches), [history, garments, watches]);
  const rejProfile = useMemo(() => buildRejectionProfile(rejectEntries), [rejectEntries]);
  const rejCombos = useMemo(() => rejectedColorCombos(rejectEntries, garments), [rejectEntries, garments]);
  const strapLife = useMemo(() => buildStrapLifecycle(history, watches), [history, watches]);
  const strapAlerts = useMemo(() => strapsNeedingAttention(strapLife), [strapLife]);

  if (dna.entryCount < 5) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: muted, fontSize: 12 }}>
        🧬 Style DNA needs at least 5 logged outfits to analyze patterns. You have {dna.entryCount}.
      </div>
    );
  }

  return (
    <div style={{ padding: "0 0 20px" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: text, marginBottom: 4, padding: "0 4px" }}>🧬 Style DNA</div>
      <div style={{ fontSize: 11, color: muted, marginBottom: 14, padding: "0 4px" }}>
        Based on {dna.entryCount} logged outfits across {dna.garmentCount} garments
      </div>

      {/* ── Color Palette ──────────────────────────────────────────────────── */}
      <Section title="Color Palette" icon="🎨" isDark={isDark}>
        <div style={{ fontSize: 11, color: muted, marginBottom: 10 }}>
          Colors you reach for vs what&apos;s in your closet
        </div>
        {dna.color.overIndex.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", marginBottom: 6, textTransform: "uppercase" }}>
              Over-indexed (you love these)
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {dna.color.overIndex.slice(0, 6).map(c => (
                <div key={c.color} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "4px 8px",
                  borderRadius: 6, background: isDark ? "#0a1a0a" : "#f0fdf4",
                  border: `1px solid ${isDark ? "#16a34a33" : "#22c55e33"}`,
                }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: swatch(c.color) }} />
                  <span style={{ fontSize: 10, color: text }}>{c.color}</span>
                  <span style={{ fontSize: 9, color: "#22c55e", fontWeight: 700 }}>{c.index}×</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {dna.color.underIndex.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#f97316", marginBottom: 6, textTransform: "uppercase" }}>
              Under-indexed (try wearing more)
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {dna.color.underIndex.slice(0, 6).map(c => (
                <div key={c.color} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "4px 8px",
                  borderRadius: 6, background: isDark ? "#1a0f00" : "#fff7ed",
                  border: `1px solid ${isDark ? "#f9731633" : "#f9731633"}`,
                }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: swatch(c.color) }} />
                  <span style={{ fontSize: 10, color: text }}>{c.color}</span>
                  <span style={{ fontSize: 9, color: "#f97316" }}>{c.availCount} owned, {c.wornCount} worn</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── Formality Range ────────────────────────────────────────────────── */}
      <Section title="Formality Range" icon="👔" isDark={isDark}>
        <div style={{ fontSize: 11, color: muted, marginBottom: 8 }}>
          Average formality: <span style={{ fontWeight: 700, color: text }}>{dna.formality.average}/10</span>
          {" · "}Mode: <span style={{ fontWeight: 700, color: text }}>{dna.formality.mode}</span>
        </div>
        {Object.entries(dna.formality.distribution).map(([bucket, count]) => (
          <ProgressBar key={bucket} label={bucket} sublabel={`${count} outfits`}
            value={count} max={Math.max(...Object.values(dna.formality.distribution))}
            color={bucket === "1-3" ? "#22c55e" : bucket === "4-5" ? "#3b82f6" : bucket === "6-7" ? "#8b5cf6" : "#f97316"}
            isDark={isDark} />
        ))}
      </Section>

      {/* ── Watch-Outfit Affinity ──────────────────────────────────────────── */}
      <Section title="Watch-Outfit Affinity" icon="⌚" isDark={isDark}>
        {dna.watchAffinity.slice(0, 8).map(wa => (
          <div key={wa.watchId} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "6px 0",
            borderBottom: `1px solid ${isDark ? "#1a1f2b" : "#f3f4f6"}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: text }}>{wa.model}</div>
              <div style={{ fontSize: 10, color: muted }}>
                {wa.wearCount}× · avg formality {wa.avgFormality ?? "?"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {wa.topColors.map(tc => (
                <div key={tc.color} style={{
                  width: 18, height: 18, borderRadius: 4,
                  background: swatch(tc.color),
                  border: `1px solid ${isDark ? "#374151" : "#d1d5db"}`,
                }} title={`${tc.color} (${tc.count}×)`} />
              ))}
            </div>
          </div>
        ))}
      </Section>

      {/* ── Comfort Zone ──────────────────────────────────────────────────── */}
      <Section title="Comfort Zone" icon="🛋️" isDark={isDark}>
        <div style={{ fontSize: 11, color: muted, marginBottom: 8 }}>
          <span style={{ fontWeight: 700, color: dna.comfortZone.comfortPct > 60 ? "#f97316" : "#22c55e" }}>
            {dna.comfortZone.comfortPct}%
          </span> of your wears come from your top {dna.comfortZone.staples.length} staples
          {dna.comfortZone.comfortPct > 60 && " — try branching out!"}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: text, marginBottom: 4 }}>Staples:</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
          {dna.comfortZone.staples.map(g => (
            <span key={g.id} style={{
              fontSize: 9, padding: "3px 7px", borderRadius: 5,
              background: isDark ? "#1a1f2b" : "#f3f4f6",
              border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
              color: text, fontWeight: 600,
            }}>{g.name?.slice(0, 20)} ({g.wearCount}×)</span>
          ))}
        </div>
        {dna.comfortZone.ignored.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#f97316", marginBottom: 4 }}>
              Never worn ({dna.comfortZone.ignored.length}):
            </div>
            <div style={{ fontSize: 10, color: muted, lineHeight: 1.6 }}>
              {dna.comfortZone.ignored.slice(0, 8).map(g => g.name?.slice(0, 18)).join(" · ")}
              {dna.comfortZone.ignored.length > 8 && ` +${dna.comfortZone.ignored.length - 8} more`}
            </div>
          </>
        )}
      </Section>

      {/* ── Rejection Intelligence ─────────────────────────────────────────── */}
      {rejProfile.insights.length > 0 && (
        <Section title="Rejection Patterns" icon="🚫" isDark={isDark} defaultOpen={false}>
          <div style={{ fontSize: 11, color: muted, marginBottom: 8 }}>
            Garments you consistently reject — the engine will pre-filter these
          </div>
          {rejProfile.insights.slice(0, 5).map(ins => {
            const g = garments.find(x => x.id === ins.garmentId);
            return (
              <div key={ins.garmentId} style={{
                padding: "6px 0", borderBottom: `1px solid ${isDark ? "#1a1f2b" : "#f3f4f6"}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: text }}>
                  {g?.name ?? ins.garmentId}
                  <span style={{ marginLeft: 6, fontSize: 10, color: "#ef4444" }}>
                    ✕{ins.totalRejections}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: muted }}>
                  {ins.primaryReason && `Reason: ${ins.primaryReason} (${ins.primaryReasonCount}×)`}
                  {ins.primaryContext && ins.primaryContext !== "any" && ` · in ${ins.primaryContext}`}
                </div>
              </div>
            );
          })}
          {rejCombos.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>
                Color combos that fail:
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {rejCombos.slice(0, 4).map((combo, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
                    borderRadius: 5, background: isDark ? "#1a0a0a" : "#fef2f2",
                    border: "1px solid #ef444433",
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: swatch(combo.colors[0]) }} />
                    <span style={{ fontSize: 9, color: muted }}>+</span>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: swatch(combo.colors[1]) }} />
                    <span style={{ fontSize: 9, color: "#ef4444" }}>✕{combo.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── Strap Lifecycle ────────────────────────────────────────────────── */}
      {strapLife.length > 0 && (
        <Section title="Strap Lifecycle" icon="🔗" isDark={isDark} defaultOpen={strapAlerts.length > 0}>
          {strapAlerts.length > 0 && (
            <div style={{
              padding: "6px 10px", borderRadius: 8, marginBottom: 10,
              background: isDark ? "#1a0f00" : "#fff7ed",
              border: "1px solid #f9731633", fontSize: 11, color: "#f97316",
            }}>
              ⚠️ {strapAlerts.length} strap{strapAlerts.length > 1 ? "s" : ""} need{strapAlerts.length === 1 ? "s" : ""} attention
            </div>
          )}
          {strapLife.filter(s => isFinite(s.lifespan)).slice(0, 10).map(s => (
            <div key={s.strapId} style={{ marginBottom: 8 }}>
              <ProgressBar
                label={`${s.strapLabel?.slice(0, 22)}`}
                sublabel={`${s.wearCount}/${s.lifespan} wears · ${s.healthPct}%`}
                value={s.healthPct} max={100}
                color={s.healthPct > 60 ? "#22c55e" : s.healthPct > 30 ? "#f59e0b" : "#ef4444"}
                isDark={isDark}
              />
              <div style={{ fontSize: 9, color: muted, marginTop: -4, paddingLeft: 2 }}>
                {s.watchModel}
                {s.replacementDate && ` · Replace ~${s.replacementDate}`}
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
