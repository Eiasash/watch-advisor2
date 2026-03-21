/**
 * DebugConsole — full app error log + health dashboard.
 * Lives in SettingsPanel > Debug section.
 * Shows: App Health (token cost, wardrobe stats, orphaned history) + error log.
 * Export → JSON file. Copy → clipboard.
 */
import { useState, useCallback, useEffect } from "react";
import { useDebugStore } from "../stores/debugStore.js";

// ── App Health panel — fetches skill-snapshot endpoint ────────────────────────

function AppHealthPanel({ isDark }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const cardBg  = isDark ? "#111827" : "#ffffff";
  const border  = isDark ? "#1e2a3a" : "#e5e7eb";
  const text    = isDark ? "#e5e7eb" : "#111827";
  const sub     = isDark ? "#6b7280" : "#9ca3af";
  const green   = "#22c55e";
  const yellow  = "#eab308";
  const red     = "#ef4444";

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/skill-snapshot");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSnapshot(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSnapshot(); }, [fetchSnapshot]);

  const Stat = ({ label, value, warn }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
      <span style={{ color: sub }}>{label}</span>
      <span style={{ color: warn ? yellow : text, fontWeight: 600, fontFamily: "monospace" }}>{value}</span>
    </div>
  );

  const healthColor = (status) => status === "ok" ? green : status?.startsWith("WARN") ? yellow : red;

  if (loading && !snapshot) {
    return <div style={{ padding: 12, fontSize: 12, color: sub, textAlign: "center" }}>Loading health data…</div>;
  }
  if (error && !snapshot) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: red, textAlign: "center" }}>
        Failed: {error}
        <button onClick={fetchSnapshot} style={{ marginLeft: 8, fontSize: 11, color: text, background: "none", border: `1px solid ${border}`, borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>Retry</button>
      </div>
    );
  }
  if (!snapshot) return null;

  const tu = snapshot.tokenUsage;
  const wh = snapshot.wardrobeHealth ?? [];
  const hlth = snapshot.health ?? {};

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Row 1: Key metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>API Cost ({tu?.month ?? "—"})</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: text, fontFamily: "monospace" }}>
            ${tu?.cost_usd?.toFixed(2) ?? "—"}
          </div>
          <div style={{ fontSize: 10, color: sub }}>
            {tu ? `${(tu.input / 1000).toFixed(0)}k in / ${(tu.output / 1000).toFixed(0)}k out` : "no data"}
          </div>
        </div>
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Data</div>
          <Stat label="Garments" value={snapshot.garmentCount ?? "—"} />
          <Stat label="History" value={snapshot.historyCount ?? "—"} />
          <Stat label="Orphaned" value={snapshot.orphanedHistoryCount ?? 0} warn={snapshot.orphanedHistoryCount > 0} />
        </div>
      </div>

      {/* Row 2: Health checks */}
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Health Checks</div>
        {Object.entries(hlth).map(([key, status]) => (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11 }}>
            <span style={{ color: text }}>{key}</span>
            <span style={{ color: healthColor(status), fontWeight: 600, fontSize: 10 }}>
              {status === "ok" ? "✓ OK" : status}
            </span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11 }}>
          <span style={{ color: text }}>model</span>
          <span style={{ color: snapshot.activeModel === "unknown" ? yellow : text, fontWeight: 600, fontSize: 10, fontFamily: "monospace" }}>
            {snapshot.activeModel ?? "—"}
          </span>
        </div>
      </div>

      {/* Row 3: Wardrobe wear rates */}
      {wh.length > 0 && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Wardrobe Wear Rate (30d)</div>
          {wh.filter(c => !["accessory", "hat", "bag"].includes(c.category)).map(c => {
            const rate = parseFloat(c.wear_rate_30d) || 0;
            const pct = Math.round(rate * 100);
            const barColor = pct < 25 ? red : pct < 40 ? yellow : green;
            return (
              <div key={c.category} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                <span style={{ fontSize: 11, color: text, minWidth: 60, textTransform: "capitalize" }}>{c.category}</span>
                <div style={{ flex: 1, height: 6, background: isDark ? "#1f2937" : "#f3f4f6", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: barColor, borderRadius: 99, transition: "width 0.3s" }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: barColor, minWidth: 30, textAlign: "right" }}>{pct}%</span>
                <span style={{ fontSize: 9, color: sub }}>{c.idle_count} idle</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Refresh */}
      <button
        onClick={fetchSnapshot}
        disabled={loading}
        style={{
          width: "100%", padding: "6px 0", borderRadius: 6, border: `1px solid ${border}`,
          background: cardBg, color: loading ? sub : text,
          fontSize: 11, fontWeight: 600, cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Refreshing…" : "↻ Refresh Health"}
      </button>
    </div>
  );
}

const LEVEL_COLOR = {
  error:   "#f87171",
  warn:    "#fb923c",
  info:    "#60a5fa",
  network: "#a78bfa",
};

const SOURCE_ICON = {
  unhandled: "💥",
  console:   "🖥",
  network:   "🌐",
  app:       "⚙️",
};

const FILTERS = ["all", "error", "warn", "network"];

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

export default function DebugConsole({ isDark }) {
  const entries    = useDebugStore(s => s.entries);
  const clear      = useDebugStore(s => s.clear);
  const exportJSON = useDebugStore(s => s.exportJSON);

  const [filter,   setFilter]   = useState("all");
  const [expanded, setExpanded] = useState(null); // entry id
  const [copied,   setCopied]   = useState(false);

  const bg     = isDark ? "#0a0e16" : "#f0f4f8";
  const border = isDark ? "#1e2a3a" : "#cbd5e1";
  const text   = isDark ? "#94a3b8" : "#374151";
  const sub    = isDark ? "#4b5563" : "#9ca3af";
  const rowBg  = isDark ? "#0d1117" : "#ffffff";
  const rowHov = isDark ? "#111827" : "#f9fafb";

  const filtered = filter === "all"
    ? entries
    : entries.filter(e => e.level === filter || e.source === filter);

  const handleCopy = useCallback(() => {
    const text = filtered.map(e =>
      `[${fmtTime(e.ts)}] [${e.level.toUpperCase()}] [${e.source}] ${e.msg}${e.detail ? `\n  → ${e.detail}` : ""}${e.stack ? `\n  ${e.stack.split("\n").slice(0, 3).join("\n  ")}` : ""}`
    ).join("\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [filtered]);

  const errorCount   = entries.filter(e => e.level === "error").length;
  const warnCount    = entries.filter(e => e.level === "warn").length;
  const networkCount = entries.filter(e => e.source === "network").length;

  return (
    <div>
      {/* App Health Dashboard */}
      <AppHealthPanel isDark={isDark} />

      {/* Summary badges */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {[
          { label: `${errorCount} error${errorCount !== 1 ? "s" : ""}`, color: "#f87171", f: "error" },
          { label: `${warnCount} warn${warnCount !== 1 ? "s" : ""}`,    color: "#fb923c", f: "warn" },
          { label: `${networkCount} network`,                            color: "#a78bfa", f: "network" },
        ].map(({ label, color, f }) => (
          <span
            key={f}
            onClick={() => setFilter(filter === f ? "all" : f)}
            style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
              background: filter === f ? color + "33" : (isDark ? "#1a1f2b" : "#f3f4f6"),
              border: `1px solid ${filter === f ? color : border}`,
              color: filter === f ? color : sub,
              cursor: "pointer", userSelect: "none",
            }}
          >
            {label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: sub, alignSelf: "center" }}>
          {entries.length} total
        </span>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "3px 10px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600,
              cursor: "pointer",
              background: filter === f ? "#3b82f6" : (isDark ? "#1a1f2b" : "#e5e7eb"),
              color: filter === f ? "#fff" : sub,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Log entries */}
      <div style={{
        maxHeight: 320, overflowY: "auto", borderRadius: 8,
        border: `1px solid ${border}`, background: bg,
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "20px 14px", textAlign: "center", color: sub, fontSize: 12 }}>
            {entries.length === 0 ? "✅ No errors recorded yet." : "No entries match this filter."}
          </div>
        ) : (
          filtered.map(e => {
            const isOpen = expanded === e.id;
            const hasExtra = e.detail || e.stack || e.url;
            return (
              <div
                key={e.id}
                onClick={() => hasExtra && setExpanded(isOpen ? null : e.id)}
                style={{
                  borderBottom: `1px solid ${border}`,
                  background: isOpen ? rowHov : rowBg,
                  cursor: hasExtra ? "pointer" : "default",
                  padding: "5px 10px",
                }}
              >
                {/* Main row */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <span style={{ fontSize: 10, minWidth: 14, marginTop: 1 }}>
                    {SOURCE_ICON[e.source] ?? "•"}
                  </span>
                  <span style={{ fontSize: 9, color: sub, minWidth: 72, fontFamily: "monospace", marginTop: 2, flexShrink: 0 }}>
                    {fmtTime(e.ts)}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, minWidth: 42, marginTop: 2, flexShrink: 0,
                    color: LEVEL_COLOR[e.level] ?? sub,
                  }}>
                    {e.level.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 11, color: text, flex: 1, wordBreak: "break-word", lineHeight: 1.4 }}>
                    {e.msg}
                  </span>
                  {hasExtra && (
                    <span style={{ color: sub, fontSize: 10, flexShrink: 0, marginTop: 2 }}>
                      {isOpen ? "▲" : "▼"}
                    </span>
                  )}
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 6, background: bg, fontSize: 10, fontFamily: "monospace" }}>
                    {e.url && (
                      <div style={{ color: "#a78bfa", marginBottom: 4, wordBreak: "break-all" }}>
                        URL: {e.url}
                      </div>
                    )}
                    {e.status && (
                      <div style={{ color: "#f87171", marginBottom: 4 }}>
                        Status: {e.status}
                      </div>
                    )}
                    {e.detail && (
                      <div style={{ color: "#fb923c", marginBottom: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {e.detail}
                      </div>
                    )}
                    {e.stack && (
                      <div style={{ color: sub, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflowY: "auto" }}>
                        {e.stack.split("\n").slice(0, 8).join("\n")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={handleCopy}
          disabled={filtered.length === 0}
          style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${border}`,
            background: copied ? "#22c55e22" : (isDark ? "#171a21" : "#fff"),
            color: copied ? "#22c55e" : sub,
            fontSize: 12, fontWeight: 600, cursor: filtered.length === 0 ? "default" : "pointer",
          }}
        >
          {copied ? "✓ Copied" : "Copy Log"}
        </button>
        <button
          onClick={exportJSON}
          disabled={entries.length === 0}
          style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${border}`,
            background: isDark ? "#171a21" : "#fff",
            color: entries.length === 0 ? sub : text,
            fontSize: 12, fontWeight: 600, cursor: entries.length === 0 ? "default" : "pointer",
          }}
        >
          Export JSON
        </button>
        <button
          onClick={clear}
          disabled={entries.length === 0}
          style={{
            padding: "8px 14px", borderRadius: 8, border: `1px solid #dc262644`,
            background: isDark ? "#1c1917" : "#fef2f2",
            color: entries.length === 0 ? sub : "#dc2626",
            fontSize: 12, fontWeight: 600, cursor: entries.length === 0 ? "default" : "pointer",
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
