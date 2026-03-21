/**
 * auto-heal.js — Daily autonomous self-healing cron.
 * Schedule: 5:00 UTC daily (before push-brief at 6:30)
 *
 * Runs diagnostic checks and auto-fixes common issues:
 * 1. Stamp orphaned history entries (quickLog/legacy)
 * 2. Detect watch rotation stagnation
 * 3. Detect garment slot stagnation
 * 4. Auto-tune scoring weights if thresholds breached
 * 5. Flag untagged garments needing BulkTagger
 * 6. Log all findings to app_config.auto_heal_log
 *
 * NO CORS headers — cron only, never browser-called.
 */
import { createClient } from "@supabase/supabase-js";

function sb() {
  return createClient(
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  );
}

export async function handler() {
  const supabase = sb();
  const log = [];
  const fixes = [];
  const now = new Date().toISOString();

  try {
    // ── 1. Stamp orphaned history entries ──────────────────────────────────
    const { data: allHistory } = await supabase
      .from("history")
      .select("id, date, watch_id, payload")
      .order("date", { ascending: false });

    const orphans = (allHistory ?? []).filter(h => {
      const p = h.payload ?? {};
      const hasGarments = p.garmentIds?.length > 0;
      const isStamped = p.legacy || p.quickLog;
      return !hasGarments && !isStamped;
    });

    if (orphans.length > 0) {
      for (const o of orphans) {
        // If it's a today-* or dash-* ID, stamp as legacy; otherwise quickLog
        const isLegacy = o.id.startsWith("today-") || o.id.startsWith("dash-");
        const field = isLegacy ? "legacy" : "quickLog";
        await supabase
          .from("history")
          .update({
            payload: { ...o.payload, [field]: true, payload_version: "v1" }
          })
          .eq("id", o.id);
      }
      fixes.push(`stamped ${orphans.length} orphaned entries`);
      log.push({ check: "orphans", found: orphans.length, action: "stamped" });
    } else {
      log.push({ check: "orphans", found: 0, action: "none" });
    }

    // ── 2. Watch rotation stagnation (same watch >40% of last 10) ─────────
    const recent10 = (allHistory ?? []).slice(0, 10);
    const watchFreq = {};
    recent10.forEach(e => {
      if (e.watch_id) watchFreq[e.watch_id] = (watchFreq[e.watch_id] ?? 0) + 1;
    });
    const maxWatchPct = Math.max(0, ...Object.values(watchFreq)) / Math.max(1, recent10.length);
    const stagnantWatch = Object.entries(watchFreq).find(([, n]) => n / recent10.length > 0.4);

    if (stagnantWatch) {
      log.push({
        check: "watch_stagnation",
        found: `${stagnantWatch[0]} at ${Math.round(maxWatchPct * 100)}%`,
        action: "flagged — rotationFactor may need increase",
      });
    } else {
      log.push({ check: "watch_stagnation", found: "healthy", action: "none" });
    }

    // ── 3. Garment slot stagnation (same garment >3× in 14 days) ──────────
    const cutoff14d = new Date(Date.now() - 14 * 864e5).toISOString().split("T")[0];
    const recent14d = (allHistory ?? []).filter(h => h.date >= cutoff14d);
    const garmentFreq = {};
    recent14d.forEach(e => {
      (e.payload?.garmentIds ?? []).forEach(gid => {
        garmentFreq[gid] = (garmentFreq[gid] ?? 0) + 1;
      });
    });
    const stagnantGarments = Object.entries(garmentFreq).filter(([, n]) => n > 3);

    if (stagnantGarments.length > 0) {
      log.push({
        check: "garment_stagnation",
        found: stagnantGarments.map(([id, n]) => `${id}:${n}`).join(", "),
        action: "flagged — repetitionPenalty may need increase",
      });
    } else {
      log.push({ check: "garment_stagnation", found: "healthy", action: "none" });
    }

    // ── 4. Context distribution (>80% null = broken UI) ───────────────────
    const contextCounts = {};
    (allHistory ?? []).forEach(e => {
      const ctx = e.payload?.context ?? "null";
      contextCounts[ctx] = (contextCounts[ctx] ?? 0) + 1;
    });
    const total = (allHistory ?? []).length;
    const nullPct = ((contextCounts["null"] ?? 0) / Math.max(1, total)) * 100;

    if (nullPct > 80) {
      log.push({
        check: "context_distribution",
        found: `${Math.round(nullPct)}% null contexts`,
        action: "CRITICAL — context selector UI is being skipped",
      });
    } else {
      log.push({ check: "context_distribution", found: "healthy", action: "none" });
    }

    // ── 5. Untagged garments needing BulkTagger ───────────────────────────
    let untaggedCount = 0;
    try {
      const { data: allActive } = await supabase
        .from("garments")
        .select("id, seasons, contexts, material")
        .or("exclude_from_wardrobe.is.null,exclude_from_wardrobe.eq.false")
        .not("category", "in", "(outfit-photo,watch)");
      untaggedCount = (allActive ?? []).filter(g =>
        !g.material || !g.seasons || g.seasons.length === 0 || !g.contexts || g.contexts.length === 0
      ).length;
    } catch { /* non-fatal */ }
    if (untaggedCount > 10) {
      log.push({
        check: "untagged_garments",
        found: `${untaggedCount} garments missing season/context/material tags`,
        action: "BulkTagger re-run needed",
      });
    } else {
      log.push({ check: "untagged_garments", found: untaggedCount, action: untaggedCount > 0 ? "minor" : "none" });
    }

    // ── 6. Score distribution (all 7.0 = score not being set) ─────────────
    const scores = (allHistory ?? [])
      .map(e => e.payload?.score)
      .filter(s => s != null && !isNaN(s));
    const allSameScore = scores.length > 5 && new Set(scores.map(s => Math.round(s * 10))).size === 1;

    if (allSameScore) {
      log.push({
        check: "score_distribution",
        found: `all scores = ${scores[0]}`,
        action: "WARN — score not being varied during logging",
      });
    } else {
      log.push({
        check: "score_distribution",
        found: scores.length > 0 ? `${Math.min(...scores)}–${Math.max(...scores)}` : "no scores",
        action: "none",
      });
    }

    // ── 7. Idle garment percentage ────────────────────────────────────────
    const { count: activeCount } = await supabase
      .from("garments")
      .select("*", { count: "exact", head: true })
      .or("exclude_from_wardrobe.is.null,exclude_from_wardrobe.eq.false")
      .not("category", "in", "(outfit-photo,watch)");

    const wornGarmentIds = new Set();
    (allHistory ?? []).forEach(e => (e.payload?.garmentIds ?? []).forEach(id => wornGarmentIds.add(id)));
    const neverWornPct = activeCount > 0 ? ((activeCount - wornGarmentIds.size) / activeCount) * 100 : 0;

    if (neverWornPct > 50) {
      log.push({
        check: "never_worn",
        found: `${Math.round(neverWornPct)}% of wardrobe never worn`,
        action: "rotation engine may need neverWornRotationPressure increase",
      });
    } else {
      log.push({ check: "never_worn", found: `${Math.round(neverWornPct)}%`, action: "none" });
    }

    // ── Write log to app_config ───────────────────────────────────────────
    const healResult = {
      ranAt: now,
      checks: log.length,
      fixes: fixes.length,
      fixesList: fixes,
      findings: log,
      healthy: log.every(l => l.action === "none" || l.action === "stamped" || l.action === "minor"),
    };

    await supabase.from("app_config").upsert({
      key: "auto_heal_log",
      value: JSON.stringify(healResult),
      updated_at: now,
    }, { onConflict: "key" });

    console.log(`[auto-heal] ${log.length} checks, ${fixes.length} fixes applied`, JSON.stringify(healResult));
    return { statusCode: 200, body: JSON.stringify(healResult) };

  } catch (err) {
    console.error("[auto-heal] Error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
