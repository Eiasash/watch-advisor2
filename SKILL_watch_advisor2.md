---
name: watch-advisor2
description: >
  Complete development skill for watch-advisor2, Eias's personal wardrobe + watch
  styling PWA. ALWAYS use this skill when: fixing bugs, adding features, auditing code,
  modifying the outfit engine, editing scoring weights, working with watch/garment data,
  touching Netlify functions, Supabase migrations, or deploying. Also trigger on:
  "fix the app", "deploy", "push", "audit", "add feature", "outfit engine", "scoring",
  "watch rotation", "wardrobe", "strap", "selfie check", "on-call planner",
  references to watch-advisor2.netlify.app, any mention of the watch-advisor2 repo,
  IndexedDB issues, sync bugs, or Netlify function errors. Contains repo structure,
  engine architecture, coding conventions, deployment pipeline, and key gotchas.
  Always read before touching any watch-advisor2 code — prevents the most common mistakes.
---

# Watch-Advisor2 Development Skill

## Overview

watch-advisor2 is a React PWA that coordinates daily outfits with a 23-piece watch
collection using AI-powered recommendations, rotation tracking, and outfit scoring.
Sole developer: Eias (physician, inpatient geriatric ward, Jerusalem).

| Item | Value |
|------|-------|
| Repo | `github.com/Eiasash/watch-advisor2` |
| Live | `https://watch-advisor2.netlify.app` |
| Netlify site ID | `4d21d73c-b37f-4d3a-8954-8347045536dd` (**NOT** `85d12386` — that's Toranot) |
| Supabase project | `oaojkanozbfpofbewtfq` |
| Supabase URL | `https://oaojkanozbfpofbewtfq.supabase.co` |
| Stack | React 18 + Vite + Zustand + IndexedDB (idb) + Netlify Functions + Supabase |
| Tests | 2475+ tests, 144 files (Vitest) |
| Version | **1.12.25** |
| Device | OPPO Find X9 Pro |
| Deploys | Auto on push to `main` |
| Last audited | 2026-04-13 |
| Active model | `claude-sonnet-4-6` |
| April token cost | $11.47 (2.6M input / 249K output — Apr 13 snapshot, ~$26/mo projected) |
| Wardrobe skill | SKILL_wardrobe_v10.md |

---

## 1. Repo Structure

```
src/
  app/
    AppShell.jsx          — router, nav, theme, boot status
    bootstrap.js          — IDB load → cloud pull, task handlers, backup + storage quota check
  components/             — 30 UI components (see Key Components)
  config/
    scoringWeights.js     — SCORE_WEIGHTS + STYLE_LEARN — ONLY place to change weights
    scoringOverrides.js   — runtime weight overrides from app_config (April 2026)
    strapRules.js         — strap-shoe rule constants (DEAD — strapShoeScore always 1.0)
    weatherRules.js       — layer temp brackets
  data/
    watchSeed.js          — 23 watches (13 genuine + 10 replica), source of truth
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
    scoring.js            — scoreGarment(), strapShoeScore() [ALWAYS 1.0], contextFormalityScore()
    watchStyles.js        — STYLE_TO_SLOTS, STYLE_FORMALITY_TARGET
    scoringFactors/
      diversityFactor.js  — diversity bonus from pre-computed candidate.diversityBonus
      repetitionFactor.js — garment repetition penalty (-0.28 if worn in last 5)
      rotationFactor.js   — rotation pressure × 0.40 weight
      seasonContextFactor.js — season/context tag matching (+0.30 season, +0.25 context)
      weightFactor.js     — garment weight (light/heavy) scoring
  aiStylist/
    claudeStylist.js      — getAISuggestion() client — calls claude-stylist function
  classifier/
    pipeline.js           — runClassifierPipeline() — Vision fallback chain
  features/wardrobe/
    classifier.js         — garment classification logic
    garmentNamer.js       — buildGarmentName() — camera roll → descriptive names
  services/
    supabaseSync.js       — pullCloudState(), pushGarment(), uploadPhoto()
    backgroundQueue.js    — IDB task queue, retry logic (max 3), orphan reset
    localCache.js         — IDB state/image/planner stores
    backupService.js      — rolling 4-snapshot weekly backup to separate IDB DB
    imagePipeline.js      — resizeImage(), processImage() (canvas, no worker)
    safeFetch.js          — hardened fetch: 502/504 handling, JSON fallback
  stores/
    wardrobeStore.js      — garments, weekCtx, onCallDates, _outfitOverrides
    watchStore.js         — watches, activeWatch
    historyStore.js       — wear history entries
    strapStore.js         — per-watch active strap selection
    rejectStore.js        — rejected garment/watch combos
    styleLearnStore.js    — preference learning profile
    debugStore.js         — error ring buffer (max 200)
    themeStore.js         — dark/light mode
  wardrobe/
    wardrobeInsights.js   — computeInsights() — wardrobe stats
netlify/functions/
  _claudeClient.js        — shared Claude API client + extractText() helper for multi-block responses
  _blobCache.js           — Netlify Blobs AI result cache
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
  daily-pick.js           — AI daily outfit pick
  style-dna.js            — AI style DNA analysis
  wardrobe-chat.js        — AI wardrobe chat assistant (multi-photo, history persists to IDB)
  auto-heal.js            — scheduled self-healing audit (cron, no CORS)
  monthly-report.js       — monthly wardrobe report (cron, no CORS)
  run-migrations.js       — scheduled migration runner (cron, no CORS)
  watch-value.js          — watch collection value tracking
  seasonal-audit.js       — seasonal wardrobe audit
  relabel-garment.js      — AI garment relabelling
  push-subscribe.js       — push notification subscription
  push-brief.js           — scheduled daily outfit brief (cron, no CORS)
  push-no-wear.js         — push if no wear logged in 7 days (cron, no CORS)
  supabase-keepalive.js   — Supabase ping every 5 days (cron, no CORS)
  skill-snapshot.js       — live app state endpoint (GET, no auth required)
  generate-embedding.js   — OpenAI embedding generation
.github/workflows/
  weekly-audit.yml        — Monday 6am UTC autonomous audit via Claude Code
supabase/migrations/      — SQL migration audit trail
tests/                    — 144 Vitest test files (2475+ tests)
```

---

## 2. Mandatory Workflow — After Every Code Change

```
1. timeout 120 node node_modules/.bin/vitest run   — ALL tests must pass
2. git add -A && git commit -m "<type>: <msg>"
3. git push origin main
4. Verify Netlify deploy state = "ready" via MCP
5. Bump version in package.json (patch for fixes, minor for features, major for breaking)
```

### Deploy Verification
```
Netlify:netlify-project-services-reader
  operation: "get-project"
  params: { siteId: "4d21d73c-b37f-4d3a-8954-8347045536dd" }
```

### Supabase Changes
- Reads/DML: `execute_sql`
- DDL: `apply_migration` + commit `.sql` to `supabase/migrations/` IMMEDIATELY

### Git Identity (sandbox)
```bash
git config user.email "eias@watch-advisor2"
git config user.name "Eias"
git pull --rebase origin main  # if diverged
```

### Environment Variables (Netlify)
Both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be set in Netlify env vars.
Root cause of Apr 10 2026 failure: missing VITE_ prefix → app connected to example.supabase.co.

---

## 3. Engine Architecture

### Primary Path: `buildOutfit()` in `src/outfitEngine/outfitBuilder.js`
- Single scoring path. Legacy `generateOutfit()` removed — do NOT re-add.
- WeekPlanner wraps in try/catch — non-Error throws caught gracefully.

### Garment Scoring Weights
All weights in `src/config/scoringWeights.js` — never inline elsewhere.
```
score = (colorMatch × 2.5) + (formalityMatch × 3) + (watchCompatibility × 3)
      + (weatherLayer × 1) + (contextFormality × 0.5)
```

### Runtime Scoring Overrides
`src/config/scoringOverrides.js` provides `getOverride(key, defaultVal)` — reads from
`app_config.scoring_overrides` at boot. All scoring functions use this for live tuning
without deploys. Currently no overrides active.
```sql
UPDATE app_config SET value = '{"rotationFactor": 0.45}'::jsonb WHERE key = 'scoring_overrides';
```

### Post-score Modifiers
| Modifier | Value | Source |
|----------|-------|--------|
| rotationFactor | ×0.40 | `rotationFactor.js` |
| repetitionPenalty | -0.28 (worn in recent 5) | `contextMemory.js` |
| diversityPenalty | -0.12 × recent appearances (last 7 days) | `outfitBuilder.js` |
| rejectPenalty | -0.30 | rejectStore |
| replicaPenalty | -60% in clinic/formal/shift | `outfitBuilder.js` |
| seasonMatch | +0.30 (in-season), -0.80 (opposite) | `seasonContextFactor.js` |
| contextMatch | +0.25 | `seasonContextFactor.js` |
| weightFactor | ±0.15 max | `weightFactor.js` |
| coherenceBonus | ±20% of baseScore | `outfitBuilder.js _crossSlotCoherence()` |

### Cross-Slot Coherence — v2
```
Exact color repeat          → -0.40
Neutral candidate           → +0.10
Warm/cool contrast          → +0.20  ← reward contrast, do NOT revert
Same tone, 1 piece          → +0.15
Same tone, 2+ pieces        → -0.05
```

### Strap-Shoe Rule — DEAD (v1.12.12)
`strapShoeScore()` always returns 1.0. `filterShoesByStrap` removed. Strap chip gone from UI.
Do NOT re-add any strap-shoe filtering or scoring logic.

### Context Values
Valid: `clinic`, `smart-casual`, `formal`, `shift`, `casual`, `date-night`, `riviera`,
`eid-celebration`, `family-event`

### Watch Rotation — v2
```
worn in last 7 days  → recencyScore 0.0
never worn           → recencyScore 0.50 (lowered April 2026 from 0.75)
idle N days          → min(N/14, 1.0)
rotationPressure(Infinity) = 0.50 (lowered April 2026 from 0.70)
```

### Confidence (SCORE_CEILING = 30)
Labels: strong ≥0.75, good ≥0.55, moderate ≥0.35, weak <0.35.
**SCORE_CEILING was 0.60 (broken) — fixed March 22 to 30. Never lower without recalibrating.**

### On-Call / Shift Watch Pool
`dayProfile.js` hard-gates: `if (!watch.shiftWatch) return 0;`
Only 3 watches: **Speedmaster**, **Tudor BB41**, **Hanhart**.

---

## 4. Netlify Functions — Key Rules

Browser-called functions require CORS headers. Cron functions — NO CORS, never browser-called.

Vision functions: `maxAttempts: 1` mandatory (10s Netlify hard timeout). selfie-check `max_tokens: 1100`.

### Claude client
`_claudeClient.js` reads `claude_model` from `app_config` on cold start. Uses `extractText()` helper
that finds `type:"text"` block explicitly — never `content[0].text` (breaks with multi-block responses).

### Multi-block response fix (v1.12.9)
All 15 serverless functions use `extractText()` from `_claudeClient.js`. This finds the text block
in Claude responses that may contain thinking blocks + text blocks.

---

## 5. Data Layer

### Supabase Tables
| Table | Purpose | Notes |
|-------|---------|-------|
| `garments` | Wardrobe items | **100 active as of April 11 2026** |
| `history` | Wear log | 48 entries. payload_version: "v1" on all |
| `app_config` | Key-value config | JSONB. Never double-parse. |
| `errors` | Error logging | |
| `push_subscriptions` | Push notif subs | |
| `app_settings` | **Legacy** | Do NOT use — use `app_config` |

### Wardrobe Health (April 11 2026)
| Category | Count | Notes |
|----------|-------|-------|
| Shirts | 34 | 14 idle — BulkTagger needed |
| Pants | 22 | +1 Kiral Grey Dress Trousers |
| Sweaters | 21 | +1 Kiral Old Money Green Cashmere |
| Shoes | 14 | |
| Jackets | 5 | |
| Belts | 4 | |
| **Active total** | **100** | |

### History Logging Pattern
```sql
INSERT INTO history (id, watch_id, date, payload, created_at)
VALUES (
  'wear-YYYY-MM-DD-{watchId}', '{watchId}', 'YYYY-MM-DD',
  '{"context":"...","garmentIds":[...],"outfit":{...},"strap":"...","score":8.5,"notes":"...","payload_version":"v1"}'::jsonb,
  NOW()
) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW();
```

### IDB Array Safety
`.filter()` crashes traced to IDB cache returning non-array truthy values (strings) for array fields.
`?? []` fails — use `Array.isArray()` / `toArray()` utility at all data entry points.

---

## 6. Key Components

| Component | Role |
|-----------|------|
| `WatchDashboard.jsx` | Today's outfit. Hidden when context="shift". |
| `WeekPlanner.jsx` | 7-day rotation. buildOutfit in try/catch. |
| `OnCallPlanner.jsx` | Shift outfit. Shift watch pool only. |
| `SelfiePanel.jsx` | Photo analysis. 640/512/420px scaling. |
| `AuditPanel.jsx` | AI audit + orphan patch tool. |
| `StrapPanel.jsx` | Strap selection + AI hint. |
| `GarmentEditor.jsx` | Metadata edit. |
| `WardrobeGrid.jsx` | Browse + filter. |
| `BulkTaggerPanel.jsx` | Batch AI tagging. |
| `DebugConsole.jsx` | Error log + monthly cost + App Health. |

### AI Chat (v1.12.9)
- Chat history persists to IDB across sessions (base64 images stripped, metadata only)
- Multi-photo support: up to 4 images, resized to 800px, preview strip, individual remove

---

## 7. Key Gotchas

| Gotcha | Detail |
|--------|--------|
| **Netlify site ID** | `4d21d73c` = watch-advisor2. `85d12386` = Toranot. NEVER mix. |
| **VITE_ env vars** | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` must exist in Netlify. Missing = connects to example.supabase.co. |
| **Vision timeout** | 10s hard limit. `maxAttempts: 1` mandatory. |
| **extractText()** | All Claude functions use `extractText()` — never `content[0].text`. |
| **Strap-shoe rule** | DEAD. `strapShoeScore()` always returns 1.0. Do NOT re-add. |
| **Legacy engine** | `src/engine/outfitEngine.js` exists but NOT used. Do not re-add fallback. |
| **DIAL_COLOR_MAP** | Only in `src/data/dialColorMap.js`. Never inline. |
| **Scoring weights** | Only in `src/config/scoringWeights.js`. |
| **Coherence** | warm/cool = +0.20. Do NOT revert to -0.15. |
| **Never-worn** | recencyScore 0.50, rotationPressure(Infinity) 0.50. |
| **SCORE_CEILING** | 30. Never lower without recalibrating. |
| **IDB arrays** | Use `Array.isArray()` not `?? []`. Six prior attempts all failed. |
| **seasonContextFactor** | Uses `toArray()` for seasons/contexts (v1.12.23). Was `?? []`. |
| **filterShoesByStrap** | Removed from outfitBuilder import (v1.12.23). Was dead code — strapShoeScore always 1.0. |
| **Migration commit** | Always commit `.sql` after `apply_migration`. |
| **garmentIds** | Always include + `payload_version: "v1"` in history payload. |
| **app_config JSONB** | Supabase auto-parses. Never double `JSON.parse()`. |
| **app_config model** | `'"model-name"'::jsonb`, not bare text. |
| **Vitest** | `timeout 120 node node_modules/.bin/vitest run` — never `npx vitest`. |
| **npm install** | `PUPPETEER_SKIP_DOWNLOAD=true npm install` required. |
| **Feature branches** | Claude Code tends to push to feature branches. Verify + merge to main. |
| **Version bump** | Always bump `package.json` version. Patch/minor/major. Current: **1.12.23**. |
| **w_ seed garments** | 53 exist, all excluded. Do NOT re-activate. |
| **quickLog/legacy** | Never remove from history entries — orphan check depends on them. |
| **sed vs python** | `python3 -c` with `str.replace()` is more reliable than `sed` for JSX edits. |
| **Scheduled functions** | Cannot be invoked via HTTP. Dashboard trigger only. |
| **Shirt idle rate** | 14/34 idle. Needs BulkTagger re-run + rotation pressure tuning. |
| **TV70102 color** | Kiral Khaki Zippered Cardigan is actually BROWN (tag KRL-2604XX confirmed). DB corrected Apr 11. |

---

## 8. Quick Reference

### Health check
```
GET https://watch-advisor2.netlify.app/.netlify/functions/skill-snapshot
```
Expected: garmentCount ≥100, orphanedHistoryCount 0, all health "ok", autoHeal.healthy true.

### Update Claude model (no deploy)
```sql
UPDATE app_config SET value = '"new-model-id"' WHERE key = 'claude_model';
```

### Scoring overrides (live tune, no deploy)
```sql
UPDATE app_config SET value = '{"rotationFactor": 0.45}'::jsonb WHERE key = 'scoring_overrides';
-- Reset: UPDATE app_config SET value = '{}'::jsonb WHERE key = 'scoring_overrides';
```

### Check auto-heal
```sql
SELECT value FROM app_config WHERE key = 'auto_heal_log';
```

### Check token cost
```sql
SELECT value FROM app_config WHERE key = 'monthly_token_usage';
```

### Run tests
```bash
timeout 120 node node_modules/.bin/vitest run
```

### Hard constraints — never violate
- Never re-add `generateOutfit()` fallback
- Never re-add strap-shoe filtering or scoring
- Never inline `DIAL_COLOR_MAP` or scoring weights
- Never set `maxAttempts > 1` on Vision functions
- Never use `content[0].text` — always `extractText()`
- Never use `?? []` for IDB arrays — always `Array.isArray()`
- Never hard-delete garments
- Never reactivate `w_` seed garments
- Never mix Netlify site IDs
- Never apply migration without committing `.sql`
- Never double `JSON.parse` app_config values
- Never skip `garmentIds` + `payload_version: "v1"` in history
- Never invoke cron functions via HTTP
- Never lower SCORE_CEILING without recalibrating
