/**
 * auto-heal.js — Daily autonomous self-healing cron.
 * Schedule: 5:00 UTC daily (before push-brief at 6:30)
 *
 * Runs 9 diagnostic checks, auto-fixes orphans, logs to app_config.
 * NO CORS — cron only. Cannot be invoked via HTTP (Netlify rejects it).
 * Test via: Netlify dashboard > Functions > auto-heal > Trigger
 */
import { createClient } from "@supabase/supabase-js";

export async function handler() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("[auto-heal] Missing SUPABASE env vars");
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(url, key);
  const log = [];
  const fixes = [];
  const now = new Date().toISOString();

  try {
    // ── 1. Fetch all history ──────────────────────────────────────────────
    const { data: allHistory } = await supabase
      .from("history")
      .select("id, date, watch_id, payload")
      .order("date", { ascending: false });
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
        await supabase.from("history")
          .update({ payload: { ...(o.payload ?? {}), [flag]: true, payload_version: "v1" } })
          .eq("id", o.id);
      }
      fixes.push(`stamped ${orphans.length} orphaned entries`);
      log.push({ check: "orphans", found: orphans.length, action: "stamped" });
    } else {
      log.push({ check: "orphans", found: 0, action: "none" });
    }

    // ── 2b. Mark unscored outfit entries >3 days old as legacy ─────────────
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const staleUnscored = hist.filter(h => {
      const p = h.payload ?? {};
      if (p.legacy || p.quickLog || p.score != null) return false;
      const gids = Array.isArray(p.garmentIds) ? p.garmentIds : [];
      if (gids.length === 0) return false;
      return (h.date ?? "") < threeDaysAgo;
    });
    if (staleUnscored.length > 0) {
      for (const e of staleUnscored) {
        await supabase.from("history")
          .update({ payload: { ...(e.payload ?? {}), legacy: true, payload_version: "v1" } })
          .eq("id", e.id);
      }
      fixes.push(`marked ${staleUnscored.length} stale unscored entries as legacy`);
      log.push({ check: "stale_unscored", found: staleUnscored.length, action: "marked_legacy" });
    } else {
      log.push({ check: "stale_unscored", found: 0, action: "none" });
    }

    // ── Load current scoring overrides (auto-tune reads + writes these) ───
    let overrides = {};
    try {
      const { data: ovRows } = await supabase.from("app_config").select("value").eq("key", "scoring_overrides").limit(1);
      const ovRow = ovRows?.[0];
      if (ovRow?.value && typeof ovRow.value === "object") overrides = ovRow.value;
    } catch { /* first run — no overrides yet */ }
    const DEFAULTS = { rotationFactor: 0.40, repetitionPenalty: -0.28, neverWornRotationPressure: 0.50 };
    const LIMITS = { rotationFactor: 0.60, repetitionPenalty: -0.40, neverWornRotationPressure: 0.90 };
    const current = (k) => overrides[k] ?? DEFAULTS[k];
    const tuned = [];

    // ── 3. Watch rotation stagnation (>40% same watch in last 10) ─────────
    //    AUTO-TUNE: bump rotationFactor by +0.05 (cap 0.60)
    const recent10 = hist.slice(0, 10);
    const watchFreq = {};
    recent10.forEach(e => { if (e.watch_id) watchFreq[e.watch_id] = (watchFreq[e.watch_id] ?? 0) + 1; });
    const stagnant = Object.entries(watchFreq).find(([, n]) => n / Math.max(1, recent10.length) > 0.4);
    let tunedRotation = null;
    if (stagnant) {
      const old = current("rotationFactor");
      const next = Math.min(+(old + 0.05).toFixed(2), LIMITS.rotationFactor);
      if (next !== old) { overrides.rotationFactor = next; tunedRotation = `rotationFactor ${old}→${next}`; tuned.push(tunedRotation); }
    }
    log.push({
      check: "watch_stagnation",
      found: stagnant ? `${stagnant[0]} at ${Math.round(stagnant[1] / recent10.length * 100)}%` : "healthy",
      action: stagnant ? (tunedRotation ? `auto-tuned: ${tunedRotation}` : "at limit") : "none",
    });

    // ── 4. Garment repetition (>5× same garment in 14 days) ──────────────
    //    AUTO-TUNE: bump repetitionPenalty by -0.03 (cap -0.40)
    const cutoff14d = new Date(Date.now() - 14 * 864e5).toISOString().split("T")[0];
    const recent14d = hist.filter(h => h.date >= cutoff14d);
    // Exclude belts/shoes from stagnation — they're daily-driver categories with limited rotation
    const DAILY_DRIVER_CATS = new Set(["belt", "shoes"]);
    const gFreq = {};
    recent14d.forEach(e => (e.payload?.garmentIds ?? []).forEach(gid => { gFreq[gid] = (gFreq[gid] ?? 0) + 1; }));
    // Look up garment category to skip daily drivers
    let garmentCategoryMap = {};
    try {
      const { data: gCats } = await supabase.from("garments").select("id, type");
      (gCats ?? []).forEach(g => { garmentCategoryMap[g.id] = g.type; });
    } catch { /* non-fatal */ }
    const stagnantG = Object.entries(gFreq).filter(([gid, n]) => n > 5 && !DAILY_DRIVER_CATS.has(garmentCategoryMap[gid]));
    let tunedRepetition = null;
    if (stagnantG.length > 0) {
      const old = current("repetitionPenalty");
      const next = Math.max(+(old - 0.03).toFixed(2), LIMITS.repetitionPenalty);
      if (next !== old) { overrides.repetitionPenalty = next; tunedRepetition = `repetitionPenalty ${old}→${next}`; tuned.push(tunedRepetition); }
    }
    log.push({
      check: "garment_stagnation",
      found: stagnantG.length > 0 ? stagnantG.map(([id, n]) => `${id}:${n}`).join(", ") : "healthy",
      action: stagnantG.length > 0 ? (tunedRepetition ? `auto-tuned: ${tunedRepetition}` : "at limit") : "none",
    });

    // ── 5. Context distribution (>80% null = broken UI) ───────────────────
    const ctxCounts = {};
    hist.forEach(e => { const c = e.payload?.context ?? "null"; ctxCounts[c] = (ctxCounts[c] ?? 0) + 1; });
    const nullPct = ((ctxCounts["null"] ?? 0) / Math.max(1, hist.length)) * 100;
    log.push({
      check: "context_distribution",
      found: nullPct > 80 ? `${Math.round(nullPct)}% null contexts` : "healthy",
      action: nullPct > 80 ? "CRITICAL — context selector UI is being skipped" : "none",
    });

    // ── 6. Untagged garments needing BulkTagger ───────────────────────────
    let untaggedCount = 0;
    try {
      const { data: allG } = await supabase
        .from("garments")
        .select("id, exclude_from_wardrobe, category, seasons, contexts, material");
      untaggedCount = (allG ?? []).filter(g =>
        !g.exclude_from_wardrobe && !["outfit-photo", "watch", "outfit-shot"].includes(g.category) &&
        (!g.material || !g.seasons || (Array.isArray(g.seasons) && g.seasons.length === 0))
      ).length;
    } catch { /* non-fatal */ }
    log.push({
      check: "untagged_garments",
      found: untaggedCount,
      action: untaggedCount > 10 ? "BulkTagger re-run needed" : untaggedCount > 0 ? "minor" : "none",
    });

    // ── 7. Score distribution ─────────────────────────────────────────────
    const scores = hist.map(e => e.payload?.score).filter(s => s != null && !isNaN(s));
    const allSame = scores.length > 5 && new Set(scores.map(s => Math.round(s * 10))).size === 1;
    log.push({
      check: "score_distribution",
      found: scores.length > 0 ? `${Math.min(...scores)}–${Math.max(...scores)}` : "no scores",
      action: allSame ? "WARN — score not being varied" : "none",
    });

    // ── 8. Never-worn percentage ──────────────────────────────────────────
    let neverWornPct = 0;
    let historyDepthSufficient = false;
    try {
      const { data: allG2 } = await supabase
        .from("garments")
        .select("id, exclude_from_wardrobe, category");
      const active = (allG2 ?? []).filter(g => !g.exclude_from_wardrobe && !["outfit-photo", "watch", "outfit-shot"].includes(g.category));
      const worn = new Set();
      hist.forEach(e => (e.payload?.garmentIds ?? []).forEach(id => worn.add(id)));
      neverWornPct = active.length > 0 ? ((active.length - worn.size) / active.length) * 100 : 0;
      historyDepthSufficient = hist.length >= active.length * 2;
    } catch { /* non-fatal */ }
    // AUTO-TUNE: bump neverWornRotationPressure by +0.05 (cap 0.90)
    let tunedNeverWorn = null;
    if (neverWornPct > 50 && historyDepthSufficient) {
      const old = current("neverWornRotationPressure");
      const next = Math.min(+(old + 0.05).toFixed(2), LIMITS.neverWornRotationPressure);
      if (next !== old) { overrides.neverWornRotationPressure = next; tunedNeverWorn = `neverWornRotationPressure ${old}→${next}`; tuned.push(tunedNeverWorn); }
    }
    log.push({
      check: "never_worn",
      found: `${Math.round(neverWornPct)}% (${hist.length} entries / ${historyDepthSufficient ? "sufficient" : "sparse"} data)`,
      action: (neverWornPct > 50 && historyDepthSufficient)
        ? (tunedNeverWorn ? `auto-tuned: ${tunedNeverWorn}` : "at limit")
        : "none",
    });

    // ── 9. outfit-photo category trap — real garments silently hidden ─────
    //    (v1.12.32: added after discovering Pavarotti trousers hidden for 14 days
    //     + 2 orphan duplicates. Dual signal: name has garment word OR id isn't
    //     phantom-id pattern. Warns only — category changes need human review.)
    let suspiciousOutfitPhotos = [];
    try {
      const { data: outfitPhotoRows } = await supabase
        .from("garments")
        .select("id, name, category, exclude_from_wardrobe");
      const PHOTO_CATS = new Set(["outfit-photo", "outfit-shot"]);
      const GARMENT_WORDS = /\b(shirt|jacket|trouser|pant|sweater|cardigan|coat|blazer|suit|polo|oxford|pullover|flannel|chino|denim|jean|boot|sneaker|derby|hoodie|tee|dress)s?\b/i;
      const PHANTOM_ID = /^g_\d{13,}_[a-z0-9]{5,6}$/;
      suspiciousOutfitPhotos = (outfitPhotoRows ?? []).filter(g => {
        if (!PHOTO_CATS.has(g.category)) return false;
        if (g.exclude_from_wardrobe) return false; // already dealt with
        const nameLooksLikeGarment = g.name && GARMENT_WORDS.test(g.name);
        const idLooksHandcrafted = g.id && !PHANTOM_ID.test(g.id);
        return nameLooksLikeGarment || idLooksHandcrafted;
      });
    } catch { /* non-fatal */ }
    log.push({
      check: "outfit_photo_trap",
      found: suspiciousOutfitPhotos.length > 0
        ? suspiciousOutfitPhotos.slice(0, 5).map(g => `${g.id}:${g.name ?? ""}`).join(", ") + (suspiciousOutfitPhotos.length > 5 ? ` (+${suspiciousOutfitPhotos.length - 5} more)` : "")
        : "healthy",
      action: suspiciousOutfitPhotos.length > 0
        ? `WARN — ${suspiciousOutfitPhotos.length} real garment(s) miscategorized as outfit-photo, invisible to engine`
        : "none",
    });

    // ── Write scoring overrides if any changed ────────────────────────────
    if (tuned.length > 0) {
      overrides._lastTuned = now;
      overrides._history = [...(overrides._history ?? []).slice(-19), { date: now, changes: tuned }];
      await supabase.from("app_config").upsert({ key: "scoring_overrides", value: overrides, updated_at: now }, { onConflict: "key" });
      fixes.push(`auto-tuned: ${tuned.join(", ")}`);
    }

    // ── Write results to app_config ───────────────────────────────────────
    const healResult = {
      ranAt: now,
      checks: log.length,
      fixes: fixes.length,
      fixesList: fixes,
      findings: log,
      tuned,
      healthy: log.every(l => l.action === "none" || l.action === "stamped" || l.action === "minor" || l.action.startsWith("auto-tuned")),
    };

    await supabase.from("app_config").upsert({
      key: "auto_heal_log",
      value: healResult,
      updated_at: now,
    }, { onConflict: "key" });

    console.log(`[auto-heal] ${log.length} checks, ${fixes.length} fixes`, JSON.stringify(healResult));
    return { statusCode: 200, body: JSON.stringify(healResult) };

  } catch (err) {
    console.error("[auto-heal] Error:", err.message, err.stack);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
