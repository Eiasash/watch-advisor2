/**
 * DebugConsole — full app error log panel.
 * Lives in SettingsPanel > Debug section.
 * Shows errors, warnings, network failures with timestamps.
 * Export → JSON file. Copy → clipboard.
 */
import { useState, useCallback } from "react";
import { useDebugStore } from "../stores/debugStore.js";

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
