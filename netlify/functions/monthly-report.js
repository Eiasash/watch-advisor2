/**
 * monthly-report.js — Monthly self-improvement analysis cron.
 * Schedule: 1st of every month at 7:00 UTC
 *
 * Compares current month vs previous month:
 * - Wear frequency trends
 * - Watch rotation diversity
 * - Score trends (manual vs AI)
 * - Garment utilization changes
 * - Rejection reason patterns
 * - Auto-tune weight history
 * - Season-appropriate dressing accuracy
 *
 * Caches report in app_config.monthly_report.
 * NO CORS — cron only.
 */
import { createClient } from "@supabase/supabase-js";

export async function handler() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.error("[monthly-report] Missing SUPABASE env vars");
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(url, key);
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7); // "2026-04"
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);

  try {
    // Fetch all history
    const { data: allHistory } = await supabase
      .from("history")
      .select("id, date, watch_id, payload")
      .order("date", { ascending: false });
    const hist = allHistory ?? [];

    // Fetch garments
    const { data: allGarments } = await supabase
      .from("garments")
      .select("id, name, exclude_from_wardrobe, category")
      .eq("exclude_from_wardrobe", false)
      .not("category", "in", "(outfit-photo,watch,outfit-shot)");
    const activeGarments = allGarments ?? [];

    // Split by month
    const thisMonthEntries = hist.filter(h => h.date?.startsWith(thisMonth));
    const lastMonthEntries = hist.filter(h => h.date?.startsWith(lastMonth));

    // ── 1. Wear frequency ──────────────────────────────────────────────────
    const wearFreq = {
      thisMonth: thisMonthEntries.length,
      lastMonth: lastMonthEntries.length,
      trend: thisMonthEntries.length - lastMonthEntries.length,
    };

    // ── 2. Watch diversity (unique watches / total wears) ──────────────────
    const watchDiv = (entries) => {
      const unique = new Set(entries.map(e => e.watch_id).filter(Boolean));
      return { unique: unique.size, total: entries.length, ratio: entries.length ? +(unique.size / entries.length).toFixed(2) : 0 };
    };
    const watchDiversity = {
      thisMonth: watchDiv(thisMonthEntries),
      lastMonth: watchDiv(lastMonthEntries),
    };

    // ── 3. Score trends ────────────────────────────────────────────────────
    const avgScore = (entries) => {
      const scores = entries.map(e => e.payload?.score).filter(s => s != null && !isNaN(s));
      return scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;
    };
    const scoreTrend = {
      thisMonth: avgScore(thisMonthEntries),
      lastMonth: avgScore(lastMonthEntries),
    };

    // ── 4. Garment utilization ─────────────────────────────────────────────
    const wornGarments = (entries) => {
      const worn = new Set();
      entries.forEach(e => (e.payload?.garmentIds ?? []).forEach(id => worn.add(id)));
      return worn;
    };
    const thisWorn = wornGarments(thisMonthEntries);
    const lastWorn = wornGarments(lastMonthEntries);
    const garmentUtil = {
      thisMonth: { worn: thisWorn.size, total: activeGarments.length, pct: activeGarments.length ? Math.round(thisWorn.size / activeGarments.length * 100) : 0 },
      lastMonth: { worn: lastWorn.size, total: activeGarments.length, pct: activeGarments.length ? Math.round(lastWorn.size / activeGarments.length * 100) : 0 },
      newlyWorn: [...thisWorn].filter(id => !lastWorn.has(id)).length,
    };

    // ── 5. Context distribution ────────────────────────────────────────────
    const ctxDist = (entries) => {
      const dist = {};
      entries.forEach(e => { const c = e.payload?.context ?? "unset"; dist[c] = (dist[c] ?? 0) + 1; });
      return dist;
    };
    const contextDist = {
      thisMonth: ctxDist(thisMonthEntries),
      lastMonth: ctxDist(lastMonthEntries),
    };

    // ── 6. Top repeated garments ───────────────────────────────────────────
    const gFreq = {};
    thisMonthEntries.forEach(e => (e.payload?.garmentIds ?? []).forEach(gid => { gFreq[gid] = (gFreq[gid] ?? 0) + 1; }));
    const topRepeats = Object.entries(gFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, count]) => {
        const g = activeGarments.find(x => x.id === id);
        return { id, name: g?.name ?? id, count };
      });

    // ── 7. Auto-tune history ───────────────────────────────────────────────
    let tuneHistory = [];
    try {
      const { data: ovRows } = await supabase.from("app_config").select("value").eq("key", "scoring_overrides").limit(1);
      tuneHistory = ovRows?.[0]?.value?._history ?? [];
    } catch {}

    // ── Build summary ──────────────────────────────────────────────────────
    const improved = [];
    const degraded = [];

    if (wearFreq.trend > 0) improved.push(`Wore ${wearFreq.trend} more outfits than last month`);
    else if (wearFreq.trend < 0) degraded.push(`Wore ${Math.abs(wearFreq.trend)} fewer outfits than last month`);

    if (watchDiversity.thisMonth.ratio > watchDiversity.lastMonth.ratio) improved.push("Better watch rotation diversity");
    else if (watchDiversity.thisMonth.ratio < watchDiversity.lastMonth.ratio) degraded.push("Watch rotation got more repetitive");

    if (scoreTrend.thisMonth && scoreTrend.lastMonth && scoreTrend.thisMonth > scoreTrend.lastMonth) improved.push(`Average score improved: ${scoreTrend.lastMonth} → ${scoreTrend.thisMonth}`);
    if (scoreTrend.thisMonth && scoreTrend.lastMonth && scoreTrend.thisMonth < scoreTrend.lastMonth) degraded.push(`Average score dropped: ${scoreTrend.lastMonth} → ${scoreTrend.thisMonth}`);

    if (garmentUtil.thisMonth.pct > garmentUtil.lastMonth.pct) improved.push(`Wardrobe utilization up: ${garmentUtil.lastMonth.pct}% → ${garmentUtil.thisMonth.pct}%`);
    if (garmentUtil.newlyWorn > 0) improved.push(`${garmentUtil.newlyWorn} garments worn for first time this month`);

    const report = {
      generatedAt: now.toISOString(),
      period: { thisMonth, lastMonth },
      wearFrequency: wearFreq,
      watchDiversity,
      scoreTrend,
      garmentUtilization: garmentUtil,
      contextDistribution: contextDist,
      topRepeatedGarments: topRepeats,
      autoTuneHistory: tuneHistory.slice(-5),
      summary: { improved, degraded },
    };

    await supabase.from("app_config").upsert({
      key: "monthly_report",
      value: report,
      updated_at: now.toISOString(),
    }, { onConflict: "key" });

    console.log(`[monthly-report] Generated for ${thisMonth}`, JSON.stringify({ improved: improved.length, degraded: degraded.length }));
    return { statusCode: 200, body: JSON.stringify(report) };

  } catch (err) {
    console.error("[monthly-report] Error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
