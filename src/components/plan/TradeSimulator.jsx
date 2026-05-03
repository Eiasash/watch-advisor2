/**
 * TradeSimulator — interactive trade scenario builder.
 * Select watches to trade out, describe what you'd trade in,
 * see impact on collection diversity, dial coverage, rotation.
 */
import React, { useState, useMemo } from "react";
import { useWatchStore } from "../../stores/watchStore.js";
import { useHistoryStore } from "../../stores/historyStore.js";
import { useThemeStore } from "../../stores/themeStore.js";
import { simulateTrade } from "../../domain/tradeSimulator.js";
import { isActiveWatch } from "../../utils/watchFilters.js";

export default function TradeSimulator() {
  const watches = useWatchStore(s => s.watches) ?? [];
  const history = useHistoryStore(s => s.entries) ?? [];
  const { mode } = useThemeStore();
  const isDark = mode === "dark";

  const [tradeOut, setTradeOut] = useState([]);
  const [tradeInName, setTradeInName] = useState("");
  const [tradeInDial, setTradeInDial] = useState("grey");
  const [cashDelta, setCashDelta] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const card = isDark ? "#161b22" : "#fff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  const accent = "#f59e0b";

  const active = watches.filter(w => isActiveWatch(w) && !w.replica);

  const result = useMemo(() => {
    if (!tradeOut.length) return null;
    const tradeIn = tradeInName.trim() ? {
      id: "trade_target",
      brand: "Target",
      model: tradeInName.trim(),
      dial: tradeInDial,
      style: "sport-elegant",
      replica: false,
      straps: [{ id: "target-default", label: "Default", type: "bracelet" }],
    } : null;
    return simulateTrade({ collection: watches, history, tradeOut, tradeIn, cashDelta });
  }, [tradeOut, tradeInName, tradeInDial, cashDelta, watches, history]);

  const toggleOut = (id) => setTradeOut(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: expanded ? 12 : 0 }}
           onClick={() => setExpanded(!expanded)}>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer" }}>
          🔄 Trade Simulator
        </span>
        <span style={{ cursor: "pointer", color: muted, fontSize: 10 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <>
          {/* Trade OUT selection */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", marginBottom: 6 }}>
              Trade Out (select watches)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {active.map(w => {
                const sel = tradeOut.includes(w.id);
                return (
                  <button key={w.id} onClick={() => toggleOut(w.id)} style={{
                    padding: "4px 10px", borderRadius: 8, fontSize: 10, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${sel ? "#ef4444" : border}`,
                    background: sel ? (isDark ? "#7f1d1d" : "#fef2f2") : "transparent",
                    color: sel ? "#ef4444" : text,
                  }}>
                    {w.model}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trade IN */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", marginBottom: 6 }}>
              Trade In (what you'd acquire)
            </div>
            <input value={tradeInName} onChange={e => setTradeInName(e.target.value)}
              placeholder="e.g. GP Laureato Infinite Grey"
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 12,
                border: `1px solid ${border}`, background: isDark ? "#0f131a" : "#f9fafb",
                color: text, outline: "none", boxSizing: "border-box", marginBottom: 6,
              }}
            />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {["grey", "blue", "green", "black", "white", "burgundy", "teal"].map(d => (
                <button key={d} onClick={() => setTradeInDial(d)} style={{
                  padding: "2px 8px", borderRadius: 6, fontSize: 9, cursor: "pointer",
                  border: `1px solid ${tradeInDial === d ? "#22c55e" : border}`,
                  background: tradeInDial === d ? (isDark ? "#14532d" : "#f0fdf4") : "transparent",
                  color: tradeInDial === d ? "#22c55e" : muted,
                }}>{d}</button>
              ))}
            </div>
          </div>

          {/* Cash delta */}
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: muted }}>Cash ₪:</span>
            <input type="number" value={cashDelta} onChange={e => setCashDelta(Number(e.target.value) || 0)}
              style={{
                width: 100, padding: "4px 8px", borderRadius: 6, fontSize: 11,
                border: `1px solid ${border}`, background: isDark ? "#0f131a" : "#f9fafb",
                color: text, outline: "none",
              }}
            />
            <span style={{ fontSize: 9, color: muted }}>negative = you pay</span>
          </div>

          {/* Results */}
          {result && (
            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: isDark ? "#0f131a" : "#fffbeb",
              border: `1px solid ${accent}33`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: accent, marginBottom: 8 }}>Impact Analysis</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                {[
                  { label: "Collection", before: result.before.total, after: result.after.total },
                  { label: "Genuine", before: result.before.genuine, after: result.after.genuine },
                  { label: "Dial Families", before: result.before.dialFamilies, after: result.after.dialFamilies },
                  { label: "Total Straps", before: result.before.totalStraps, after: result.after.totalStraps },
                ].map(({ label, before, after }) => {
                  const delta = after - before;
                  const color = delta > 0 ? "#22c55e" : delta < 0 ? "#ef4444" : muted;
                  return (
                    <div key={label} style={{ fontSize: 10 }}>
                      <span style={{ color: muted }}>{label}: </span>
                      <span style={{ color: text, fontWeight: 600 }}>{before} → {after}</span>
                      <span style={{ color, fontWeight: 700, marginLeft: 4 }}>
                        {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "="}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Dial coverage change */}
              {result.dialFamiliesLost?.length > 0 && (
                <div style={{ fontSize: 10, color: "#ef4444", marginBottom: 4 }}>
                  ⚠️ Losing dial families: {result.dialFamiliesLost.join(", ")}
                </div>
              )}
              {result.dialFamiliesGained?.length > 0 && (
                <div style={{ fontSize: 10, color: "#22c55e", marginBottom: 4 }}>
                  ✓ Gaining dial families: {result.dialFamiliesGained.join(", ")}
                </div>
              )}

              {/* Wear impact */}
              {result.wearImpact && (
                <div style={{ fontSize: 10, color: muted, marginTop: 6 }}>
                  Traded watches worn {result.wearImpact.totalWears}× total
                  {result.wearImpact.totalWears === 0 && " — no wear data lost"}
                  {result.wearImpact.totalWears > 0 && ` (avg ${result.wearImpact.avgWears}/piece)`}
                </div>
              )}

              {result.verdict && (
                <div style={{
                  marginTop: 8, padding: "6px 10px", borderRadius: 6, fontSize: 11,
                  fontWeight: 700,
                  background: result.verdict === "upgrade" ? (isDark ? "#14532d" : "#f0fdf4") : (isDark ? "#7f1d1d" : "#fef2f2"),
                  color: result.verdict === "upgrade" ? "#22c55e" : "#ef4444",
                }}>
                  {result.verdict === "upgrade" ? "✓ Net upgrade to collection" : "⚠ Net downgrade — reconsider"}
                </div>
              )}
            </div>
          )}

          {!tradeOut.length && (
            <div style={{ fontSize: 11, color: muted, textAlign: "center", padding: 10 }}>
              Select watches above to simulate a trade
            </div>
          )}
        </>
      )}
    </div>
  );
}
