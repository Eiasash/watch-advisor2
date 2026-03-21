/**
 * auto-heal.js — Daily autonomous self-healing cron.
 * Schedule: 5:00 UTC daily (before push-brief at 6:30)
 * NO CORS — cron only, never browser-called.
 */
import { createClient } from "@supabase/supabase-js";

export async function handler(event) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("[auto-heal] Missing SUPABASE env vars");
    return { statusCode: 500, body: JSON.stringify({ error: "Missing env vars" }) };
  }

  const supabase = createClient(url, key);
  const log = [];
  const fixes = [];
  const now = new Date().toISOString();

  try {
    // ── 1. Fetch all history ──────────────────────────────────────────────
    const { data: allHistory, error: hErr } = await supabase
      .from("history")
      .select("id, date, watch_id, payload")
      .order("date", { ascending: false });

    if (hErr) {
      log.push({ check: "history_fetch", found: hErr.message, action: "ERROR" });
    }

    const hist = allHistory ?? [];

    // ── 2. Stamp orphaned entries ─────────────────────────────────────────
    const orphans = hist.filter(h => {
      const p = h.payload ?? {};
      return !(p.garmentIds?.length > 0) && !p.legacy && !p.quickLog;
    });

    if (orphans.length > 0) {
      for (const o of orphans) {
        const isLegacy = o.id.startsWith("today-") || o.id.startsWith("dash-");
        const flag = isLegacy ? "legacy" : "quickLog";
        await supabase
          .from("history")
          .update({ payload: { ...(o.payload ?? {}), [flag]: true, payload_version: "v1" } })
          .eq("id", o.id);
      }
      fixes.push(`stamped ${orphans.length} orphaned entries`);
      log.push({ check: "orphans", found: orphans.length, action: "stamped" });
    } else {
      log.push({ check: "orphans", found: 0, action: "none" });
    }

    // ── 3. Watch rotation stagnation ──────────────────────────────────────
    const recent10 = hist.slice(0, 10);
    const watchFreq = {};
    recent10.forEach(e => { if (e.watch_id) watchFreq[e.watch_id] = (watchFreq[e.watch_id] ?? 0) + 1; });
    const stagnant = Object.entries(watchFreq).find(([, n]) => n / Math.max(1, recent10.length) > 0.4);
    log.push({
      check: "watch_stagnation",
      found: stagnant ? `${stagnant[0]} at ${Math.round(stagnant[1] / recent10.length * 100)}%` : "healthy",
      action: stagnant ? "flagged" : "none",
    });

    // ── 4. Garment repetition ─────────────────────────────────────────────
    const cutoff14d = new Date(Date.now() - 14 * 864e5).toISOString().split("T")[0];
    const recent14d = hist.filter(h => h.date >= cutoff14d);
    const gFreq = {};
    recent14d.forEach(e => (e.payload?.garmentIds ?? []).forEach(gid => { gFreq[gid] = (gFreq[gid] ?? 0) + 1; }));
    const stagnantG = Object.entries(gFreq).filter(([, n]) => n > 3);
    log.push({
      check: "garment_stagnation",
      found: stagnantG.length > 0 ? stagnantG.map(([id, n]) => `${id}:${n}`).join(", ") : "healthy",
      action: stagnantG.length > 0 ? "flagged" : "none",
    });

    // ── 5. Context distribution ───────────────────────────────────────────
    const ctxCounts = {};
    hist.forEach(e => { const c = e.payload?.context ?? "null"; ctxCounts[c] = (ctxCounts[c] ?? 0) + 1; });
    const nullPct = ((ctxCounts["null"] ?? 0) / Math.max(1, hist.length)) * 100;
    log.push({
      check: "context_distribution",
      found: nullPct > 80 ? `${Math.round(nullPct)}% null` : "healthy",
      action: nullPct > 80 ? "CRITICAL" : "none",
    });

    // ── 6. Untagged garments ──────────────────────────────────────────────
    let untaggedCount = 0;
    try {
      const { data: allG } = await supabase
        .from("garments")
        .select("id, exclude_from_wardrobe, category, seasons, contexts, material");
      untaggedCount = (allG ?? []).filter(g =>
        !g.exclude_from_wardrobe && !["outfit-photo", "watch"].includes(g.category) &&
        (!g.material || !g.seasons || (Array.isArray(g.seasons) && g.seasons.length === 0))
      ).length;
    } catch { /* non-fatal */ }
    log.push({
      check: "untagged_garments",
      found: untaggedCount,
      action: untaggedCount > 10 ? "BulkTagger needed" : untaggedCount > 0 ? "minor" : "none",
    });

    // ── 7. Score distribution ─────────────────────────────────────────────
    const scores = hist.map(e => e.payload?.score).filter(s => s != null && !isNaN(s));
    const allSame = scores.length > 5 && new Set(scores.map(s => Math.round(s * 10))).size === 1;
    log.push({
      check: "score_distribution",
      found: scores.length > 0 ? `${Math.min(...scores)}–${Math.max(...scores)}` : "no scores",
      action: allSame ? "WARN — stuck" : "none",
    });

    // ── 8. Never-worn percentage ──────────────────────────────────────────
    let neverWornPct = 0;
    try {
      const { data: allG2 } = await supabase
        .from("garments")
        .select("id, exclude_from_wardrobe, category");
      const active = (allG2 ?? []).filter(g => !g.exclude_from_wardrobe && !["outfit-photo", "watch"].includes(g.category));
      const worn = new Set();
      hist.forEach(e => (e.payload?.garmentIds ?? []).forEach(id => worn.add(id)));
      neverWornPct = active.length > 0 ? ((active.length - worn.size) / active.length) * 100 : 0;
    } catch { /* non-fatal */ }
    log.push({
      check: "never_worn",
      found: `${Math.round(neverWornPct)}%`,
      action: neverWornPct > 50 ? "rotation pressure increase needed" : "none",
    });

    // ── Write log ─────────────────────────────────────────────────────────
    const healResult = {
      ranAt: now,
      checks: log.length,
      fixes: fixes.length,
      fixesList: fixes,
      findings: log,
      healthy: log.every(l => l.action === "none" || l.action === "stamped" || l.action === "minor"),
    };

    const { error: upsertErr } = await supabase.from("app_config").upsert({
      key: "auto_heal_log",
      value: healResult,
      updated_at: now,
    }, { onConflict: "key" });

    if (upsertErr) {
      console.error("[auto-heal] upsert error:", upsertErr.message);
    }

    console.log(`[auto-heal] ${log.length} checks, ${fixes.length} fixes`);
    return { statusCode: 200, body: JSON.stringify(healResult) };

  } catch (err) {
    console.error("[auto-heal] Error:", err.message, err.stack);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
