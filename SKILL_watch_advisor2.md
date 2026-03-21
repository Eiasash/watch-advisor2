# SKILL — Watch Advisor 2

> Auto-generated skill file. Updated by `/update-skill` command.
> Do NOT edit manually — run `/update-skill` to refresh from codebase + Supabase.

---

## §1 Overview

| Metric | Value |
|--------|-------|
| Version | 1.4.0 |
| Stack | React 18 + Vite 7 + Zustand 4 + IndexedDB + Supabase + Netlify Functions |
| Source files | 71 |
| Source LOC | ~8,600 |
| Test files | 113 |
| Tests | 2084+ |
| Netlify functions | 17 (+2 helpers) |
| Cron functions | 3 (auto-heal 5am, push-brief 6:30am, keepalive /5d) |
| Components | 26 JSX |
| Zustand stores | 8 |
| Build output | 571 kB (167 kB gzip) |
| Live URL | https://watch-advisor2.netlify.app |
| Last audited | 2026-03-21 |

---

## §2 Architecture

```
src/
  app/
    AppShell.jsx          — router, nav, theme, boot status, storage quota toast
    bootstrap.js          — IDB load → cloud pull, task handlers, backup + storage quota + debugStore push
  components/             — 26 JSX UI components (see Key Components)
  config/
    scoringWeights.js     — SCORE_WEIGHTS + STYLE_LEARN — ONLY place to change weights
    strapRules.js         — strap-shoe rule constants
    weatherRules.js       — layer temp brackets
  data/
    watchSeed.js          — 23 watches (13 genuine + 10 replica), source of truth — IMMUTABLE
    dialColorMap.js       — CANONICAL dial color → garment color map (shared)
  domain/
    contextMemory.js      — repetitionPenalty() — recently-worn garment penalty (-0.28)
    rotationStats.js      — daysIdle(), rotationPressure(), garmentDaysIdle()
    preferenceLearning.js — learnPreferenceWeights() from history
  engine/                 — LEGACY watch scoring (still active for watch rotation)
    dayProfile.js         — scoreWatchForDay(), inferDayProfile(), DAY_PROFILES
    weekRotation.js       — genWeekRotation() — 7-day watch rotation
  outfitEngine/           — PRIMARY outfit scoring engine
    outfitBuilder.js      — buildOutfit() — entry point, all slot picking
    scoring.js            — scoreGarment(), strapShoeScore(), contextFormalityScore()
    watchStyles.js        — STYLE_TO_SLOTS, STYLE_FORMALITY_TARGET
    scoringFactors/
      diversityFactor.js  — diversity bonus
      repetitionFactor.js — garment repetition penalty (-0.28 if worn in last 5)
      rotationFactor.js   — rotation pressure × 0.40 weight
      seasonContextFactor.js — season/context tag matching
      weightFactor.js     — garment weight (light/heavy) scoring
  aiStylist/
    claudeStylist.js      — getAISuggestion() client
  classifier/
    pipeline.js           — runClassifierPipeline() — Vision fallback chain
    colorDetection.js     — detectDominantColor() (canvas pixel analysis)
  services/
    supabaseSync.js       — pullCloudState(), pushGarment(), uploadPhoto(), pushHistoryEntry()
    backgroundQueue.js    — IDB task queue, retry logic (max 3), orphan reset
    localCache.js         — IDB state/image/planner stores
    backupService.js      — rolling 4-snapshot weekly backup
    imagePipeline.js      — resizeImage(), processImage() (canvas, no worker)
    safeFetch.js          — hardened fetch: 502/504 handling, JSON fallback
  stores/
    wardrobeStore.js      — garments, weekCtx, onCallDates, _outfitOverrides
    watchStore.js         — watches, activeWatch
    historyStore.js       — wear history entries (quickLog + legacy flags preserved)
    strapStore.js         — per-watch active strap selection
    rejectStore.js        — rejected garment/watch combos
    styleLearnStore.js    — preference learning profile
    debugStore.js         — error ring buffer (max 200) + pushDebugEntry() helper
    themeStore.js         — dark/light mode
netlify/functions/
  _claudeClient.js        — shared Claude API client, retry + model from app_config + token logging
  _blobCache.js           — Netlify Blobs AI result cache
  auto-heal.js            — daily self-healing cron (5am UTC) — stamps orphans, detects stagnation
  classify-image.js       — Vision: garment type/color/formality (maxAttempts: 1)
  selfie-check.js         — Vision: outfit photo analysis (maxAttempts: 1, max_tokens: 1100)
  watch-id.js             — Vision: watch identification (maxAttempts: 1)
  verify-garment-photo.js — Vision: garment photo verification (maxAttempts: 1)
  ai-audit.js             — wardrobe AI audit + strap advisor
  claude-stylist.js       — AI outfit validation/improvement
  bulk-tag.js             — batch garment season/context/material tagging
  detect-duplicate.js     — duplicate garment detection
  extract-outfit.js       — extract outfit from photo
  occasion-planner.js     — occasion-based outfit planning
  relabel-garment.js      — AI garment relabelling
  push-subscribe.js       — push notification subscription
  push-brief.js           — scheduled daily outfit brief + no-wear 7-day reminder (cron, no CORS)
  supabase-keepalive.js   — Supabase ping every 5 days (cron, no CORS)
  skill-snapshot.js       — live app state + autoHeal status endpoint (GET, no auth)
  generate-embedding.js   — OpenAI embedding generation
.github/workflows/
  weekly-audit.yml        — Monday 6am UTC autonomous audit via Claude Code
supabase/migrations/      — SQL migration audit trail (commit .sql after every apply_migration)
tests/                    — 113 Vitest test files (2084+ tests)
```

---

## §3 Scoring System (last audited: 2026-03-21)

### Base formula
```
scoreGarment = (colorMatch × 2.5) + (formalityMatch × 3) + (watchCompatibility × 3) + (weatherLayer × 1) + (contextFormality × 1.5)
```

### Modifiers
| Modifier | Value | Source |
|----------|-------|--------|
| rotationFactor weight | ×0.40 | `rotationFactor.js` |
| repetitionPenalty | -0.28 (if worn in recent window) | `contextMemory.js` |
| diversityPenalty | -0.12 per recent appearance (last 5) | outfit builder |
| rejectPenalty | -0.3 for rejected combos | rejectStore |
| seasonMatch | +0.3 | scoringWeights |
| contextMatch | +0.25 | scoringWeights |

### Cross-Slot Coherence — v2
```
Exact color repeat          → -0.40
Neutral candidate           → +0.10
Warm/cool contrast          → +0.20  ← reward contrast, do NOT revert
Same tone, 1 piece          → +0.15
Same tone, 2+ pieces        → -0.05
```

### Context Values
Valid: `clinic`, `smart-casual`, `formal`, `shift`, `casual`, `date-night`, `riviera`,
`eid-celebration`, `family-event`

### Watch Rotation — v2
```
worn in last 7 days  → recencyScore 0.0
never worn           → recencyScore 0.75 (not 1.0)
idle N days          → min(N/14, 1.0)
rotationPressure(Infinity) = 0.70
```

---

## §4 Automation & Self-Healing

### Daily auto-heal cron (`auto-heal.js` — 5:00 UTC)
Runs 7 diagnostic checks, auto-fixes what it can, logs results to `app_config.auto_heal_log`:

| Check | Auto-fix | Threshold |
|-------|----------|-----------|
| Orphaned history entries | Stamps quickLog/legacy | Any unstamped empty garmentIds |
| Watch rotation stagnation | Flags for rotationFactor increase | Same watch >40% of last 10 |
| Garment slot stagnation | Flags for repetitionPenalty increase | Same garment >3× in 14d |
| Context distribution | Flags broken UI | >80% null contexts |
| Untagged garments | Flags for BulkTagger | >10 missing season/context/material |
| Score distribution | Flags stuck scoring | All scores identical |
| Never-worn percentage | Flags for rotation pressure increase | >50% wardrobe never worn |

Results visible in: DebugConsole health dashboard → "Auto-Heal" section.
Also in: `GET /.netlify/functions/skill-snapshot` → `autoHeal` field.

### Daily push-brief (`push-brief.js` — 6:30 UTC)
- If no outfit logged in 7+ days → sends no-wear reminder instead of outfit brief
- AI-generated watch + outfit pick using Claude

### Supabase keepalive (`supabase-keepalive.js` — every 5 days)
- Prevents free tier pause after 7 days inactivity

### Weekly GitHub Action (`weekly-audit.yml` — Monday 6am UTC)
- Full autonomous audit via Claude Code
- Commits findings to IMPROVEMENTS.md
- Requires: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` secrets

### Token usage tracking
`_claudeClient.js` fire-and-forget calls `increment_token_usage` RPC after every Claude API response.
Monthly cost visible in DebugConsole + `app_config.monthly_token_usage`.

---

## §5 Data Layer

### Supabase Tables
| Table | Purpose | Notes |
|-------|---------|-------|
| `garments` | Wardrobe items | 76 active as of March 21 2026 |
| `history` | Wear log | 19 entries. 6 legacy stamped. quickLog + legacy fields preserved. |
| `app_config` | Key-value config | Model, token usage, keepalive, auto_heal_log. Values are JSONB. |
| `errors` | Error logging | |
| `push_subscriptions` | Push notif subs | |
| `app_settings` | Legacy (not key-value) | Do NOT use — use app_config |

### History entry flags
| Flag | Meaning | Effect on health checks |
|------|---------|------------------------|
| `quickLog: true` | One-tap watch log, no garments selected | Excluded from orphan count |
| `legacy: true` | Pre-March 2026 entry, garmentIds unrecoverable | Excluded from orphan count |
| `payload_version: "v1"` | Schema version stamp | Required on all entries |

### History Logging
```sql
INSERT INTO history (id, watch_id, date, payload, created_at)
VALUES (
  'wear-YYYY-MM-DD-{watchId}', '{watchId}', 'YYYY-MM-DD',
  '{"context":"clinic","garmentIds":[...],"quickLog":false,"payload_version":"v1"}'::jsonb,
  NOW()
) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload;
```

---

## §6 Key Components

| Component | Role |
|-----------|------|
| `WatchDashboard.jsx` | Today's outfit. buildOutfit only. |
| `TodayPanel.jsx` | Watch logging (full + quick). quickLog flag on one-tap entries. |
| `WeekPlanner.jsx` | 7-day rotation. buildOutfit in try/catch. |
| `OnCallPlanner.jsx` | Shift outfit. Excludes dress watches. |
| `SelfiePanel.jsx` | Photo analysis. 640/512/420px scaling. |
| `AuditPanel.jsx` | AI audit + orphan patch (with search + camera) + Debug section. |
| `StatsPanel.jsx` | Wear analytics. Lives under History tab. |
| `DebugConsole.jsx` | Error log + App Health dashboard (tokens, wear rates, auto-heal). |
| `GarmentEditor.jsx` | Metadata edit. ⚠️ NEEDS TAILOR badge. |
| `WardrobeGrid.jsx` | Browse + filter. Tailor badge visible. |

### Tab layout
| Tab | Contents |
|-----|----------|
| Today | TodayPanel + WatchDashboard |
| Wardrobe | ImportPanel + WardrobeGrid |
| Plan | WeekPlanner + WatchRotationPanel |
| History | OutfitHistory + StatsPanel |
| Audit | AI Audit + OrphanedHistoryPatch + DebugSection |

---

## §7 Key Gotchas

| Gotcha | Detail |
|--------|--------|
| Netlify site ID | `4d21d73c` = watch-advisor2. `85d12386` = Toranot. Never mix. |
| Vision timeout | 10s hard limit. `maxAttempts: 1` mandatory. |
| Legacy engine | `src/engine/outfitEngine.js` exists but NOT used. Do not re-add. |
| `DIAL_COLOR_MAP` | Only in `src/data/dialColorMap.js`. Never inline. |
| Scoring weights | Only in `src/config/scoringWeights.js`. |
| Coherence | warm/cool = +0.20. Do NOT revert to -0.15. |
| Never-worn | recencyScore 0.75, rotationPressure(Infinity) 0.70. |
| Migration commit | Always commit `.sql` after `apply_migration`. |
| garmentIds | Always include + `payload_version: "v1"` in history payload. |
| Legacy history | `today-{ts}` / `dash-{ts}` = stamped legacy:true. |
| w_ seed garments | 53 exist, all excluded. Do NOT re-activate. |
| app_config JSONB | Supabase auto-parses JSONB. Never double JSON.parse. |
| app_config model | `'"model-name"'::jsonb` not bare text. |
| watch-rec.js | **DELETED** March 21 2026. Dead code. |
| push-no-wear.js | Does NOT exist. Logic embedded in `push-brief.js`. |
| Dead code removed | VersionChip, detectDominantColorFromDataURL — deleted March 21. |
| Storage quota | Boot warns >70% via toast + debugStore. |
| Worker | USE_WORKER = false. Don't re-enable. |
| auto-heal.js | Cron at 5am UTC. No CORS. Logs to app_config.auto_heal_log. |

---

## §8 Quick Reference

### Health check
```
GET https://watch-advisor2.netlify.app/.netlify/functions/skill-snapshot
```
Returns: garmentCount, historyCount, orphanedHistoryCount, activeModel,
tokenUsage, autoHeal, outfitQualityTrend, wardrobeHealth, health checks.

### Update Claude model (no deploy)
```sql
UPDATE app_config SET value = '"claude-sonnet-4-6"'::jsonb WHERE key = 'claude_model';
```

### Run tests
```bash
timeout 120 node node_modules/.bin/vitest run
```

### Manual auto-heal trigger
```
curl -X POST https://watch-advisor2.netlify.app/.netlify/functions/auto-heal
```

### DebugConsole
→ Audit tab → 🪲 App Health & Debug (collapsible).
Shows: API cost, wear rates, health checks, auto-heal findings, error log.
