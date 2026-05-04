import { useState, useEffect, useMemo } from "react";
import { useThemeStore } from "../stores/themeStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useStrapStore } from "../stores/strapStore.js";
import { authedFetch } from "../services/authedFetch.js";
import { cardSourceLabel, cardSourceColor, formatHHMM } from "../utils/cardSourceLabel.js";

const SLOT_ICONS = { watch: "⌚", shirt: "👔", sweater: "🧶", layer: "🧥", pants: "👖", shoes: "👞", jacket: "🧥", belt: "🪢" };
const SLOT_ORDER = ["watch", "shirt", "sweater", "layer", "pants", "shoes", "jacket", "belt"];

// Trim a pick to the fields the model actually needs to "remember" so the
// excludeRecent payload stays small (and doesn't echo weather/generatedAt back).
function compactPick(p) {
  if (!p) return null;
  return {
    watch: p.watch ?? null,
    watchId: p.watchId ?? null,
    shirt: p.shirt ?? null,
    sweater: p.sweater ?? null,
    pants: p.pants ?? null,
    shoes: p.shoes ?? null,
    jacket: p.jacket ?? null,
  };
}

/**
 * ClaudePick — opt-in AI outfit recommendation.
 *
 * Behaviour (post 2026-04-28):
 *   - Does NOT auto-fetch on mount. Most users don't want every daily pick
 *     branded as AI when the deterministic engine is doing the work.
 *   - Renders a single "✦ Ask Claude" CTA. AI badge + "Claude's Pick"
 *     header only appear AFTER the user explicitly clicks the button.
 *   - After a pick is shown, exposes flexibility verbs: regenerate, steer
 *     more casual / more formal / different watch, reject + reason, why this,
 *     and "show 2 more options" variants.
 *
 * Props:
 *   autoFetch   - back-compat opt-in. Default false. Set to true to restore
 *                 the legacy auto-fetch-on-mount behaviour.
 */
export default function ClaudePick({ autoFetch = false } = {}) {
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const [pick, setPick] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSlot, setExpandedSlot] = useState(null);
  const [wornToday, setWornToday] = useState(false);
  const [requested, setRequested] = useState(false);
  // Flexibility state
  const [recentPicks, setRecentPicks] = useState([]); // last 5 distinct picks for excludeRecent
  const [variants, setVariants] = useState(null); // array | null when only 1 pick
  const [variantIndex, setVariantIndex] = useState(0);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rationale, setRationale] = useState(null); // "why this?" pop-over text
  const [whyLoading, setWhyLoading] = useState(false);
  const garments = useWardrobeStore(s => s.garments) ?? [];
  const watches = useWatchStore(s => s.watches) ?? [];
  const upsertEntry = useHistoryStore(s => s.upsertEntry);
  const history = useHistoryStore(s => s.entries) ?? [];

  const bg = isDark ? "#0f131a" : "#f8fafc";
  const card = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  const accent = "#8b5cf6";

  // Match pick garment names to actual wardrobe garments (fuzzy by name)
  const matchedGarments = useMemo(() => {
    if (!pick || !garments.length) return {};
    const matched = {};
    for (const slot of SLOT_ORDER) {
      if (slot === "watch" || !pick[slot] || pick[slot] === "null") continue;
      const pickName = pick[slot].toLowerCase().trim();
      const exact = garments.find(g => g.name?.toLowerCase().trim() === pickName);
      if (exact) { matched[slot] = exact; continue; }
      const partial = garments.find(g => {
        const gn = g.name?.toLowerCase().trim() ?? "";
        return gn.includes(pickName) || pickName.includes(gn);
      });
      if (partial) matched[slot] = partial;
    }
    return matched;
  }, [pick, garments]);

  /**
   * fetchPick — flexible call into /.netlify/functions/daily-pick.
   * options:
   *   force         — always true after first user interaction
   *   steer         — "more_casual" | "more_formal" | "different_watch"
   *   useExclude    — pass recentPicks[] to discourage repeats
   *   variantsCount — request multiple options at once (max 3)
   */
  const fetchPick = async ({ force = false, steer = null, useExclude = false, variantsCount = 1 } = {}) => {
    setLoading(true);
    setError(null);
    setRationale(null);
    setRequested(true);
    try {
      const url = "/.netlify/functions/daily-pick";
      const needsPost = force || steer || useExclude || variantsCount > 1;
      const res = needsPost
        ? await authedFetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              forceRefresh: true,
              ...(steer ? { steer } : {}),
              ...(useExclude && recentPicks.length ? { excludeRecent: recentPicks.map(compactPick).filter(Boolean) } : {}),
              ...(variantsCount > 1 ? { variants: variantsCount } : {}),
            }),
          })
        : await authedFetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (Array.isArray(data.variants)) {
        setVariants(data.variants);
        setVariantIndex(0);
        setPick(data.variants[0]);
        setRecentPicks(prev => [data.variants[0], ...prev].slice(0, 5));
      } else {
        setVariants(null);
        setVariantIndex(0);
        setPick(data);
        setRecentPicks(prev => [data, ...prev].slice(0, 5));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // "Why this?" — surface existing reasoning instantly, only call API if we don't have it.
  const handleWhy = async () => {
    if (!pick) return;
    if (pick.reasoning) {
      setRationale(pick.reasoning);
      return;
    }
    setWhyLoading(true);
    try {
      const res = await authedFetch("/.netlify/functions/daily-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ why: true, currentPick: compactPick(pick) }),
      });
      const data = await res.json();
      setRationale(data.rationale ?? "No rationale available.");
    } catch {
      setRationale("Could not fetch rationale.");
    } finally {
      setWhyLoading(false);
    }
  };

  // Reject + reason — fire-and-forget feedback, then regenerate avoiding the rejected outfit.
  const handleSubmitReject = async () => {
    if (!pick) return;
    const reason = rejectReason.trim();
    setRejectOpen(false);
    setRejectReason("");
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/.netlify/functions/daily-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forceRefresh: true,
          rejected: { outfit: compactPick(pick), reason },
          excludeRecent: recentPicks.map(compactPick).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPick(data);
      setVariants(null);
      setRecentPicks(prev => [data, ...prev].slice(0, 5));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch only when explicitly opted in (back-compat).
  useEffect(() => { if (autoFetch) fetchPick({ force: false }); }, [autoFetch]);

  if (!requested && !pick && !loading) {
    return (
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 12, marginBottom: 14 }}>
        <button
          onClick={() => fetchPick({ force: true })}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 10,
            border: `1px solid ${accent}`, background: "transparent",
            color: accent, fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          ✦ Ask Claude for an outfit
        </button>
      </div>
    );
  }

  if (loading && !pick) {
    return (
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${accent}44`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          🤖 Claude's Pick
        </div>
        <div style={{ fontSize: 12, color: muted, marginTop: 8 }}>Thinking about your outfit...</div>
      </div>
    );
  }

  if (error && !pick) {
    return (
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          🤖 Claude's Pick
        </div>
        <div style={{ fontSize: 11, color: "#ef4444", marginTop: 8 }}>{error}</div>
        <button onClick={() => fetchPick({ force: true })} style={{
          marginTop: 8, padding: "4px 12px", borderRadius: 6, border: `1px solid ${accent}`,
          background: "transparent", color: accent, fontSize: 11, cursor: "pointer",
        }}>Retry</button>
      </div>
    );
  }

  if (!pick) return null;

  const slots = SLOT_ORDER.filter(s => {
    if (s === "watch") return pick.watch;
    return pick[s] && pick[s] !== "null";
  });

  const chipStyle = (active = false) => ({
    padding: "4px 10px", borderRadius: 999, border: `1px solid ${active ? accent : border}`,
    background: active ? `${accent}22` : "transparent",
    color: active ? accent : muted, fontSize: 10, fontWeight: 600, cursor: "pointer",
  });

  return (
    <div data-testid="claude-pick-panel" style={{ background: card, borderRadius: 14, border: `1px solid ${accent}44`, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: collapsed ? 0 : 12 }}>
        <div onClick={() => setCollapsed(!collapsed)} style={{ cursor: "pointer", flex: 1 }}>
          {/* Today-tab source/status parity with WeekPlanner (PR #149/#151).
              Same resolver — distinguishes fresh "AI recommendation" from
              cached "Cached AI recommendation" via cardSource on the response. */}
          {(() => {
            const src = pick.cardSource ?? "ai_rec";
            const label = cardSourceLabel(src) ?? "Claude's Pick";
            const color = cardSourceColor(src) ?? accent;
            return (
              <span title={src === "ai_rec_cached" ? "Cached recommendation — re-fetch via Different one" : null}
                    style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                ✦ {label}
              </span>
            );
          })()}
          {pick.score && (
            <span style={{ marginLeft: 8, fontSize: 11, color: pick.score >= 8 ? "#22c55e" : pick.score >= 6 ? "#f59e0b" : muted }}>
              {pick.score}/10
            </span>
          )}
          {variants && variants.length > 1 && (
            <span style={{ marginLeft: 8, fontSize: 10, color: muted }}>
              · option {variantIndex + 1}/{variants.length}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            data-testid="claude-pick-why"
            onClick={(e) => { e.stopPropagation(); handleWhy(); }}
            title="Why this?"
            style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${border}`, background: "transparent", color: muted, fontSize: 10, cursor: "pointer" }}
          >{whyLoading ? "…" : "?"}</button>
          {/* Regen lives in the flexibility chip row below ("Different one →") to
              avoid the duplicate-affordance UX confusion of having two buttons
              that call fetchPick({force,useExclude}) with identical args. */}
          <span onClick={() => setCollapsed(!collapsed)} style={{ cursor: "pointer", color: muted, fontSize: 10 }}>
            {collapsed ? "▼" : "▲"}
          </span>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Watch + Strap */}
          {pick.watch && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
              borderRadius: 8, background: isDark ? "#1a1040" : "#f5f3ff",
              border: `1px solid ${accent}33`, marginBottom: 10,
            }}>
              <span style={{ fontSize: 18 }}>⌚</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: text }}>{pick.watch}</div>
                {pick.strap && <div style={{ fontSize: 10, color: muted }}>{pick.strap}</div>}
              </div>
            </div>
          )}

          {/* Garment slots */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {slots.filter(s => s !== "watch").map(slot => {
              const name = pick[slot];
              if (!name || name === "null") return null;
              const garment = matchedGarments[slot];
              const photo = garment?.thumbnail || garment?.photoUrl;
              const isExpanded = expandedSlot === slot;
              return (
                <div key={slot}>
                  <div
                    onClick={() => setExpandedSlot(isExpanded ? null : slot)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 10px", borderRadius: 6,
                      background: isExpanded ? (isDark ? "#1a1040" : "#f5f3ff") : bg,
                      border: isExpanded ? `1px solid ${accent}44` : "1px solid transparent",
                      fontSize: 11, cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {photo ? (
                      <img src={photo} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: 28, textAlign: "center", fontSize: 16 }}>{SLOT_ICONS[slot] ?? "•"}</span>
                    )}
                    <span style={{ color: muted, textTransform: "uppercase", fontSize: 9, width: 52 }}>{slot}</span>
                    <span style={{ color: text, fontWeight: 600, flex: 1 }}>{name}</span>
                    {garment && <span style={{ fontSize: 9, color: muted }}>{isExpanded ? "▲" : "▼"}</span>}
                  </div>
                  {isExpanded && garment && (
                    <div style={{
                      padding: "8px 10px 8px 46px", fontSize: 10, color: muted,
                      display: "flex", flexDirection: "column", gap: 3,
                    }}>
                      {garment.brand && <div><span style={{ fontWeight: 600 }}>Brand:</span> {garment.brand}</div>}
                      {garment.color && <div><span style={{ fontWeight: 600 }}>Color:</span> {garment.color}</div>}
                      {garment.material && <div><span style={{ fontWeight: 600 }}>Material:</span> {garment.material}</div>}
                      {garment.weight && <div><span style={{ fontWeight: 600 }}>Weight:</span> {garment.weight}</div>}
                      {garment.formality != null && <div><span style={{ fontWeight: 600 }}>Formality:</span> {garment.formality}/10</div>}
                      {photo && (
                        <img src={photo} alt={garment.name} style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, marginTop: 4 }} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Reasoning */}
          {pick.reasoning && (
            <div style={{
              marginTop: 10, padding: "8px 10px", borderRadius: 8,
              background: isDark ? "#1a1040" : "#f5f3ff",
              border: `1px solid ${accent}22`,
              fontSize: 11, color: isDark ? "#c4b5fd" : "#7c3aed", lineHeight: 1.5,
            }}>
              {pick.reasoning}
            </div>
          )}

          {/* "Why this?" rationale popover (only when explicitly asked & no reasoning shown above) */}
          {rationale && !pick.reasoning && (
            <div style={{
              marginTop: 10, padding: "8px 10px", borderRadius: 8,
              background: isDark ? "#1a1040" : "#f5f3ff",
              border: `1px solid ${accent}22`,
              fontSize: 11, color: isDark ? "#c4b5fd" : "#7c3aed", lineHeight: 1.5,
            }}>
              <strong>Why:</strong> {rationale}
            </div>
          )}

          {/* Layer tip */}
          {pick.layerTip && (
            <div style={{
              marginTop: 6, padding: "5px 10px", borderRadius: 6,
              background: "#f9731620", border: "1px solid #f9731633",
              fontSize: 10, color: "#f97316", fontWeight: 600,
            }}>
              💡 {pick.layerTip}
            </div>
          )}

          {/* Flexibility chips — steer + reject + variants */}
          <div data-testid="claude-pick-flex-row" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <button data-testid="steer-more-casual"
              onClick={() => fetchPick({ force: true, steer: "more_casual", useExclude: true })}
              style={chipStyle()}>
              ↓ More casual
            </button>
            <button data-testid="steer-more-formal"
              onClick={() => fetchPick({ force: true, steer: "more_formal", useExclude: true })}
              style={chipStyle()}>
              ↑ More formal
            </button>
            <button data-testid="steer-different-watch"
              onClick={() => fetchPick({ force: true, steer: "different_watch", useExclude: true })}
              style={chipStyle()}>
              ⌚ Different watch
            </button>
            <button data-testid="claude-pick-regen-chip"
              onClick={() => fetchPick({ force: true, useExclude: true })}
              style={chipStyle()}>
              {loading ? "..." : "Different one →"}
            </button>
            <button data-testid="claude-pick-reject"
              onClick={() => setRejectOpen(v => !v)}
              style={chipStyle(rejectOpen)}>
              👎
            </button>
            {variants && variants.length > 1 && (
              <>
                <button onClick={() => { const i = (variantIndex - 1 + variants.length) % variants.length; setVariantIndex(i); setPick(variants[i]); }}
                  style={chipStyle()}>‹ prev</button>
                <button onClick={() => { const i = (variantIndex + 1) % variants.length; setVariantIndex(i); setPick(variants[i]); }}
                  style={chipStyle()}>next ›</button>
              </>
            )}
            {!variants && (
              <button data-testid="claude-pick-show-more"
                onClick={() => fetchPick({ force: true, variantsCount: 3, useExclude: true })}
                style={chipStyle()}>
                Show 2 more options
              </button>
            )}
          </div>

          {/* Reject reason — collapsible inline input */}
          {rejectOpen && (
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <input
                data-testid="reject-reason-input"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Why doesn't this work? (optional)"
                style={{
                  flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 11,
                  background: bg, color: text, border: `1px solid ${border}`,
                }}
              />
              <button data-testid="reject-reason-submit" onClick={handleSubmitReject} style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                background: "#ef4444", color: "#fff", border: "none", cursor: "pointer",
              }}>Send + retry</button>
            </div>
          )}

          {/* Wear This — one-tap log entire Claude Pick outfit */}
          {(() => {
            const todayIso = new Date().toISOString().slice(0, 10);
            const alreadyLogged = history.some(e => e.date === todayIso && (e.garmentIds?.length ?? 0) > 0);
            if (alreadyLogged || wornToday) return null;
            const garmentIds = Object.values(matchedGarments).map(g => g.id).filter(Boolean);
            const watchObj = pick.watchId ? watches.find(w => w.id === pick.watchId) : null;
            if (!garmentIds.length) return null;
            return (
              <button
                onClick={() => {
                  const todayIso = new Date().toISOString().slice(0, 10);
                  const activeStrap = pick.strap ?? null;
                  upsertEntry({
                    id: `claude-pick-${todayIso}`,
                    date: todayIso,
                    watchId: pick.watchId ?? null,
                    garmentIds,
                    context: null,
                    score: pick.score ?? null,
                    strapLabel: activeStrap,
                    notes: "Logged from Claude's Pick",
                    loggedAt: new Date().toISOString(),
                  });
                  setWornToday(true);
                }}
                style={{
                  width: "100%", marginTop: 8, padding: "10px 0", borderRadius: 10,
                  border: "none", cursor: "pointer",
                  background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                  color: "#fff", fontSize: 12, fontWeight: 700,
                  boxShadow: "0 2px 8px #8b5cf633",
                }}
              >
                👔 Wear This Outfit
              </button>
            );
          })()}
          {wornToday && (
            <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: "#22c55e", fontWeight: 700 }}>
              ✅ Logged! Check Today tab.
            </div>
          )}

          {/* Weather context */}
          {pick.weather && (
            <div style={{ marginTop: 6, fontSize: 10, color: muted }}>
              {pick.weather.tempMorning != null && <span>🌅 {pick.weather.tempMorning}°</span>}
              {pick.weather.tempMidday != null && <span> · ☀️ {pick.weather.tempMidday}°</span>}
              {pick.weather.tempEvening != null && <span> · 🌙 {pick.weather.tempEvening}°</span>}
              {pick.generatedAt && (
                <span> · {pick.cardSource === "ai_rec_cached" ? "Cached from" : "Generated"} {formatHHMM(pick.generatedAt)}</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
