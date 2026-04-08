/**
 * skill-snapshot.js
 * Returns live ground truth about watch-advisor2 app state.
 * Used by Claude Code /update-skill command to keep SKILL_watch_advisor2.md accurate.
 *
 * GET /.netlify/functions/skill-snapshot
 */

import { createClient } from '@supabase/supabase-js';
import { cors } from "./_cors.js";

export async function handler(event) {
  const CORS = cors(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!process.env.SUPABASE_URL || !serviceKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Server configuration missing" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, serviceKey);

  try {
    // Active garment count
    const { count: garmentCount, error: gErr } = await supabase
      .from('garments')
      .select('*', { count: 'exact', head: true })
      .eq('exclude_from_wardrobe', false)
      .not('type', 'in', '(outfit-photo,watch)');

    // History entry count
    const { count: historyCount, error: hErr } = await supabase
      .from('history')
      .select('*', { count: 'exact', head: true });

    // History entries missing garmentIds (health check) — excludes legacy + quickLog entries
    const { data: _rawOrphans } = await supabase
      .from('history')
      .select('id, date, payload')
      .or('payload->garmentIds.is.null,payload->garmentIds.eq.[]');
    const orphanedHistory = (_rawOrphans ?? []).filter(h => !h.payload?.legacy && !h.payload?.quickLog);

    // Latest migration version
    let latestMigration = null;
    try {
      const { data: migData } = await supabase
        .from('_migrations')
        .select('name')
        .order('name', { ascending: false })
        .limit(1);
      latestMigration = migData?.[0]?.name ?? null;
    } catch {
      // _migrations may not exist — non-fatal
    }

    // App settings sanity check (columns: id, week_ctx, on_call_dates, active_straps, custom_straps, updated_at)
    let appSettings = null;
    try {
      const { data: settingsRow } = await supabase
        .from('app_settings')
        .select('*')
        .eq('id', 'default')
        .single();
      appSettings = settingsRow;
    } catch { /* non-fatal — legacy table */ }

    // Active Claude model from app_config
    let activeModel = null;
    try {
      const { data: modelRow } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'claude_model')
        .single();
      const raw = modelRow?.value;
      if (typeof raw === 'string') {
        try { activeModel = JSON.parse(raw); } catch { activeModel = raw; }
      } else {
        activeModel = raw ?? null;
      }
    } catch { /* non-fatal */ }

    // Monthly token usage from app_config
    let tokenUsage = null;
    try {
      const { data: tokenRow } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'monthly_token_usage')
        .single();
      tokenUsage = tokenRow?.value ? (typeof tokenRow.value === 'string' ? JSON.parse(tokenRow.value) : tokenRow.value) : null;
    } catch { /* non-fatal */ }

    // Auto-heal last run
    let autoHeal = null;
    try {
      const { data: healRow } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'auto_heal_log')
        .single();
      autoHeal = healRow?.value ? (typeof healRow.value === 'string' ? JSON.parse(healRow.value) : healRow.value) : null;
    } catch { /* non-fatal */ }

    // Outfit quality trend — weekly average scores for last 12 weeks
    let outfitQualityTrend = null;
    try {
      const cutoff = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { data: scoreTrend } = await supabase
        .from('history')
        .select('date, payload')
        .gte('date', cutoff)
        .order('date', { ascending: true });

      if (scoreTrend?.length) {
        const weeklyScores = {};
        for (const entry of scoreTrend) {
          const week = entry.date.slice(0, 7); // YYYY-MM
          if (!weeklyScores[week]) weeklyScores[week] = { total: 0, count: 0 };
          const score = entry.payload?.score;
          if (score && !isNaN(score)) { weeklyScores[week].total += score; weeklyScores[week].count++; }
        }
        outfitQualityTrend = Object.entries(weeklyScores).map(([month, s]) => ({
          month,
          avgScore: s.count ? +(s.total / s.count).toFixed(2) : null,
          count: s.count,
        }));
      }
    } catch { /* non-fatal */ }

    // Wardrobe health by category
    let wardrobeHealth = null;
    try {
      const { data: healthData } = await supabase.rpc('wardrobe_health_by_category');
      wardrobeHealth = healthData;
    } catch { /* non-fatal — RPC may not exist yet */ }

    // Scoring weights — read from env or return known values
    // These are hardcoded here as source of truth backup
    // Primary source: src/config/scoringWeights.js
    const scoringWeights = {
      colorMatch: 2.5,
      formalityMatch: 3.0,
      watchCompatibility: 3.0,
      weatherLayer: 1.0,
      contextFormality: 0.5,
      rotationFactor: 0.40,
      repetitionPenalty: -0.28,
      diversityFactor: -0.12,
      seasonMatch: 0.30,
      contextMatch: 0.10,
      neverWornRecencyScore: 0.50,
      neverWornRotationPressure: 0.50,
      note: "Primary source of truth: src/config/scoringWeights.js — verify against codebase"
    };

    const snapshot = {
      snapshotAt: new Date().toISOString(),
      appUrl: "https://watch-advisor2.netlify.app",
      supabaseProject: "oaojkanozbfpofbewtfq",
      netlifySiteId: "4d21d73c-b37f-4d3a-8954-8347045536dd",
      garmentCount: garmentCount ?? null,
      historyCount: historyCount ?? null,
      orphanedHistoryCount: orphanedHistory?.length ?? 0,
      orphanedHistoryIds: orphanedHistory?.map(h => h.id) ?? [],
      latestMigration,
      appSettings: appSettings ?? null,
      scoringWeights,
      activeModel: activeModel ?? "unknown",
      tokenUsage,
      autoHeal,
      outfitQualityTrend,
      wardrobeHealth,
      health: {
        garments: gErr ? `ERROR: ${gErr.message}` : "ok",
        history: hErr ? `ERROR: ${hErr.message}` : "ok",
        orphanedHistory: (orphanedHistory?.length ?? 0) === 0 ? "ok" : `WARN: ${orphanedHistory.length} entries missing garmentIds`,
        wardrobeHealth: wardrobeHealth?.some(c => c.cnt > 25 && parseFloat(c.wear_rate_30d) < 0.30)
          ? `WARN: category over-saturated with low wear rate`
          : "ok",
        autoHeal: autoHeal?.healthy === true ? "ok" : autoHeal?.healthy === false ? "WARN: issues found" : "unknown — never run",
      },
      skillFileNote: "Run /update-skill in Claude Code to sync SKILL_watch_advisor2.md with this snapshot"
    };

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify(snapshot, null, 2)
    };

  } catch (err) {
    console.error("[skill-snapshot] Error:", err.message);
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", snapshotAt: new Date().toISOString() })
    };
  }
}
