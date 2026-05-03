import { useState, useCallback } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore }    from "../stores/watchStore.js";
import { useHistoryStore }  from "../stores/historyStore.js";
import { setCachedState }   from "../services/localCache.js";
import { pushGarment }      from "../services/supabaseSync.js";
import { authedFetch }      from "../services/authedFetch.js";

const BATCH = 6; // garments per Claude call — keeps response under 1500 tokens

/**
 * Bulk AI tagger — scans all untagged garments and writes back
 * seasons, contexts, material, and pattern in batches.
 * Lives in SettingsPanel as a collapsible section.
 */
export default function BulkTaggerPanel({ isDark }) {
  const garments     = useWardrobeStore(s => s.garments) ?? [];
  const updateGarment = useWardrobeStore(s => s.updateGarment);
  const watches      = useWatchStore(s => s.watches) ?? [];
  const history      = useHistoryStore(s => s.entries) ?? [];

  const [running,  setRunning]  = useState(false);
  const [progress, setProgress] = useState(0);   // 0–100
  const [tagged,   setTagged]   = useState(0);
  const [total,    setTotal]    = useState(0);
  const [done,     setDone]     = useState(false);
  const [error,    setError]    = useState(null);

  const border = isDark ? "#2b3140" : "#d1d5db";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const sub    = isDark ? "#8b93a7" : "#6b7280";

  // Garments that need tagging: missing seasons, contexts, OR weight
  const untagged = garments.filter(g =>
    !g.excludeFromWardrobe &&
    g.type !== "outfit-photo" && g.type !== "outfit-shot" &&
    (!g.seasons?.length || !g.contexts?.length || !g.weight)
  );

  const run = useCallback(async () => {
    if (!untagged.length) return;
    setRunning(true); setDone(false); setError(null);
    setTotal(untagged.length); setTagged(0); setProgress(0);

    let done_ = 0;
    for (let i = 0; i < untagged.length; i += BATCH) {
      const batch = untagged.slice(i, i + BATCH).map(g => ({
        id:       g.id,
        name:     g.name,
        type:     g.type ?? "unknown",
        color:    g.color ?? "unknown",
        material: g.material ?? null,
      }));

      try {
        const res = await authedFetch("/.netlify/functions/bulk-tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ garments: batch }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = body?.error ?? `HTTP ${res.status}`;
          if (res.status === 402 || msg.startsWith("BILLING:") || msg.toLowerCase().includes("credit balance")) {
            throw new Error("API credits exhausted — top up at console.anthropic.com/settings/billing");
          }
          throw new Error(msg.slice(0, 120));
        }
        const { results = [] } = await res.json();

        for (const r of results) {
          if (!r.id) continue;
          const patch = {};
          if (r.seasons?.length)  patch.seasons  = r.seasons;
          if (r.contexts?.length) patch.contexts = r.contexts;
          if (r.material)         patch.material = r.material;
          if (r.pattern)          patch.pattern  = r.pattern;
          if (typeof r.formality === "number") patch.formality = r.formality;
          if (r.weight)           patch.weight   = r.weight;
          if (r.fit)              patch.fit      = r.fit;
          if (Object.keys(patch).length) {
            updateGarment(r.id, patch);
            // Push to cloud in background — fire and forget
            const g = garments.find(x => x.id === r.id);
            if (g) pushGarment({ ...g, ...patch }).catch(() => {});
          }
        }
        done_ += batch.length;
        setTagged(done_);
        setProgress(Math.round((done_ / untagged.length) * 100));

        // Persist to IDB every batch
        const updated = useWardrobeStore.getState().garments;
        setCachedState({ garments: updated, watches, history }).catch(() => {});
      } catch (err) {
        setError(err.message);
        break;
      }
    }

    setRunning(false); setDone(true);
  }, [untagged, garments, updateGarment, watches, history]);

  if (!untagged.length && !done) return (
    <div style={{ fontSize: 13, color: "#22c55e", padding: "8px 0" }}>
      ✅ All garments already tagged with season &amp; context data.
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 13, color: sub, marginBottom: 10 }}>
        {done
          ? `Tagged ${tagged} garment${tagged !== 1 ? "s" : ""} — outfit engine now uses season & context scoring.`
          : `${untagged.length} garment${untagged.length !== 1 ? "s" : ""} missing season/context tags. AI will classify each in batches of ${BATCH}.`}
      </div>

      {running && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: sub, marginBottom: 4 }}>
            <span>Tagging {tagged}/{total}…</span>
            <span>{progress}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: isDark ? "#1a1f2b" : "#e5e7eb", overflow: "hidden" }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "#3b82f6", transition: "width 0.4s ease" }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>
          Error: {error} — partial results saved.
        </div>
      )}

      {!done && (
        <button
          onClick={run}
          disabled={running}
          style={{
            padding: "9px 18px", borderRadius: 10, border: "none",
            background: running ? "#374151" : "#3b82f6",
            color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: running ? "wait" : "pointer", width: "100%",
          }}>
          {running ? `Tagging… ${progress}%` : `Tag ${untagged.length} Garments with AI`}
        </button>
      )}

      {done && (
        <button
          onClick={() => { setDone(false); setTagged(0); setProgress(0); }}
          style={{
            padding: "9px 18px", borderRadius: 10, border: `1px solid ${border}`,
            background: "transparent", color: sub, fontSize: 13, fontWeight: 600,
            cursor: "pointer", width: "100%",
          }}>
          Re-run on remaining untagged
        </button>
      )}
    </div>
  );
}
