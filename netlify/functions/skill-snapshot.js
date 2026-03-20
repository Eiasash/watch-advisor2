/**
 * skill-snapshot.js
 * Returns live ground truth about watch-advisor2 app state.
 * Used by Claude Code /update-skill command to keep SKILL_watch_advisor2.md accurate.
 *
 * GET /.netlify/functions/skill-snapshot
 */

import { createClient } from '@supabase/supabase-js';

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );

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

    // History entries missing garmentIds (health check)
    const { data: orphanedHistory } = await supabase
      .from('history')
      .select('id, date')
      .or('payload->garmentIds.is.null,payload->garmentIds.eq.[]');

    // Latest migration version
    let latestMigration = null;
    try {
      const { data: migData } = await supabase
        .from('schema_migrations')
        .select('version')
        .order('version', { ascending: false })
        .limit(1);
      latestMigration = migData?.[0]?.version ?? null;
    } catch {
      // schema_migrations may not exist — non-fatal
    }

    // App settings sanity check
    const { data: appSettings } = await supabase
      .from('app_settings')
      .select('key, value')
      .limit(10);

    // Scoring weights — read from env or return known values
    // These are hardcoded here as source of truth backup
    // Primary source: src/config/scoringWeights.js
    const scoringWeights = {
      colorMatch: 2.5,
      formalityMatch: 3.0,
      watchCompatibility: 3.0,
      weatherLayer: 1.0,
      contextFormality: 1.5,
      rotationFactor: 0.40,
      repetitionPenalty: -0.28,
      diversityFactor: -0.12,
      seasonMatch: 0.30,
      contextMatch: 0.25,
      neverWornRecencyScore: 0.75,
      neverWornRotationPressure: 0.70,
      note: "Primary source of truth: src/config/scoringWeights.js — verify against codebase"
    };

    const snapshot = {
      snapshotAt: new Date().toISOString(),
      appUrl: "https://watch-advisor2.netlify.app",
      supabaseProject: "oaojkanozbfpofbewtfq",
      netliftSiteId: "4d21d73c-b37f-4d3a-8954-8347045536dd",
      garmentCount: garmentCount ?? null,
      historyCount: historyCount ?? null,
      orphanedHistoryCount: orphanedHistory?.length ?? 0,
      orphanedHistoryIds: orphanedHistory?.map(h => h.id) ?? [],
      latestMigration,
      appSettingsCount: appSettings?.length ?? 0,
      scoringWeights,
      health: {
        garments: gErr ? `ERROR: ${gErr.message}` : "ok",
        history: hErr ? `ERROR: ${hErr.message}` : "ok",
        orphanedHistory: (orphanedHistory?.length ?? 0) === 0 ? "ok" : `WARN: ${orphanedHistory.length} entries missing garmentIds`,
      },
      skillFileNote: "Run /update-skill in Claude Code to sync SKILL_watch_advisor2.md with this snapshot"
    };

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify(snapshot, null, 2)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message, snapshotAt: new Date().toISOString() })
    };
  }
}
