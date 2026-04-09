# SKILL — Watch Advisor 2

> Auto-generated skill file. Updated 2026-04-09.
> Do NOT edit manually — run `/update-skill` to refresh from codebase + Supabase.

---

## §1 Overview

| Metric | Value |
|--------|-------|
| Version | 1.12.15 |
| Stack | React 18 + Vite 7 + Zustand 4 + IndexedDB + Supabase + Netlify Functions |
| Source files | 146 |
| Source LOC | ~23,100 |
| Test files | 144 |
| Tests | 2475+ |
| Netlify functions | 24 (+3 helpers) |
| Cron functions | 3 (auto-heal 5am UTC, push-brief 6:30am UTC, keepalive /5d) |
| Components | 63 JSX |
| Zustand stores | 8 |
| Live URL | https://watch-advisor2.netlify.app |
| Netlify site ID | 4d21d73c-b37f-4d3a-8954-8347045536dd (NOT 85d12386 — Toranot) |
| Supabase project | oaojkanozbfpofbewtfq |
| Last audited | 2026-04-09 |

---

## §2 Repo Structure

```
src/
  app/
    AppShell.jsx          — router, nav, theme, boot status
    bootstrap.js          — IDB load → cloud pull, task handlers, backup + storage quota check
  config/
    scoringWeights.js     — SCORE_WEIGHTS + STYLE_LEARN — ONLY place to change weights
    scoringOverrides.js   — runtime weight overrides from app_config (April 2026)
    strapRules.js         — strap-shoe rule constants (DEAD — strapShoeScore always 1.0)
    weatherRules.js       — layer temp brackets
  data/
    watchSeed.js          — 23 watches (13 genuine + 10 replica), source of truth
    dialColorMap.js       — CANONICAL dial color → garment color map (shared)
  domain/
    contextMemory.js      — repetitionPenalty() (-0.28)
    rotationStats.js      — daysIdle(), rotationPressure(), garmentDaysIdle()
    preferenceLearning.js — learnPreferenceWeights() from history
  engine/                 — LEGACY watch scoring (still active for watch rotation)
    dayProfile.js         — scoreWatchForDay(), inferDayProfile(), DAY_PROFILES
    weekRotation.js       — genWeekRotation() — 7-day watch rotation
  outfitEngine/           — PRIMARY outfit scoring engine
    outfitBuilder.js      — buildOutfit() — entry point, all slot picking
    scoring.js            — scoreGarment(), contextFormalityScore()
    watchStyles.js        — STYLE_TO_SLOTS, STYLE_FORMALITY_TARGET
    scoringFactors/
      diversityFactor.js  — diversity bonus
      repetitionFactor.js — -0.28 if worn in last 5
      rotationFactor.js   — rotationPressure × 0.40 weight
      seasonContextFactor.js — +0.30 season, +0.25 context
      weightFactor.js     — light/heavy scoring
  services/
    supabaseSync.js       — pullCloudState(), pushGarment(), uploadPhoto()
    backgroundQueue.js    — IDB task queue, retry (max 3), orphan reset
    localCache.js         — IDB state/image/planner stores
    backupService.js      — rolling 4-snapshot weekly backup
    imagePipeline.js      — resizeImage(), processImage() (canvas, USE_WORKER=false)
    safeFetch.js          — hardened fetch: 502/504 handling, JSON fallback
  stores/
    wardrobeStore.js      — garments, weekCtx, onCallDates, _outfitOverrides
    watchStore.js         — watches, activeWatch
    historyStore.js       — wear history (quickLog + legacy flags preserved)
    strapStore.js         — per-watch active strap
    rejectStore.js        — rejected garment/watch combos
    styleLearnStore.js    — preference learning profile
    debugStore.js         — error ring buffer (max 200)
    themeStore.js         — dark/light mode
netlify/functions/
  _claudeClient.js        — shared Claude API client, retry + model from app_config
  _blobCache.js           — Netlify Blobs AI result cache
  classify-image.js       — Vision: garment type/color/formality (maxAttempts: 1)
  selfie-check.js         — Vision: outfit photo (maxAttempts: 1, max_tokens: 1100)
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
  wardrobe-chat.js        — AI wardrobe chat assistant
  auto-heal.js            — scheduled self-healing audit (cron, NO CORS, NO HTTP)
  monthly-report.js       — monthly wardrobe report (cron, NO CORS)
  run-migrations.js       — scheduled migration runner (cron, NO CORS)
  watch-value.js          — watch collection value tracking
  seasonal-audit.js       — seasonal wardrobe audit
  relabel-garment.js      — AI garment relabelling
  push-subscribe.js       — push notification subscription
  push-brief.js           — daily outfit brief (cron, NO CORS)
  push-no-wear.js         — push if no wear in 7 days (cron, NO CORS)
  supabase-keepalive.js   — Supabase ping every 5 days (cron, NO CORS)
  skill-snapshot.js       — live health endpoint (GET, no auth)
  generate-embedding.js   — OpenAI embedding generation
.github/workflows/
  weekly-audit.yml        — Monday 6am UTC autonomous audit via Claude Code
supabase/migrations/      — SQL migration audit trail (commit .sql after every apply_migration)
tests/                    — 144 Vitest test files, 2475+ tests
```

---

## §3 Mandatory Workflow — After Every Change

```bash
# 1. Tests — zero failures required
timeout 120 node node_modules/.bin/vitest run

# 2. Bump version in package.json (patch=fix, minor=feature, major=breaking)
# 3. Commit + push
git add -A && git commit -m "<type>: <msg>"
git push origin main

# 4. Verify deploy via MCP
Netlify:netlify-project-services-reader → operation: "get-project"
  → siteId: "4d21d73c-b37f-4d3a-8954-8347045536dd"
  → assert state === "ready"
```

### Git identity (sandbox)
```bash
git config user.email "eias@watch-advisor2"
git config user.name "Eias"
git pull --rebase origin main
```

### Schema changes
`apply_migration` MCP → immediately commit `.sql` to `supabase/migrations/`.

---

## §4 Scoring Engine

### Base formula
```
scoreGarment = (colorMatch × 2.5) + (formalityMatch × 3) + (watchCompatibility × 3)
             + (weatherLayer × 1) + (contextFormality × 0.5)
```
All weights in `src/config/scoringWeights.js` — never inline elsewhere.

### Runtime overrides (April 2026)
`src/config/scoringOverrides.js` → `getOverride(key, defaultVal)` reads `app_config.scoring_overrides`.
```sql
UPDATE app_config SET value = '{"rotationFactor": 0.45}'::jsonb WHERE key = 'scoring_overrides';
-- Reset: UPDATE app_config SET value = '{}'::jsonb WHERE key = 'scoring_overrides';
```

### Post-score modifiers
| Modifier | Value | Source |
|----------|-------|--------|
| rotationFactor | ×0.40 | rotationFactor.js |
| repetitionPenalty | −0.28 (worn in last 5) | contextMemory.js |
| diversityFactor | −0.12 × min(count,5) last 7d | outfitBuilder.js |
| rejectPenalty | −0.30 | rejectStore |
| seasonMatch | +0.30 | seasonContextFactor.js |
| contextMatch | +0.25 | seasonContextFactor.js |
| weightFactor | ±light/heavy | weightFactor.js |

### Cross-slot coherence (v2)
| Condition | Delta |
|-----------|-------|
| Exact color repeat | −0.40 |
| Neutral candidate | +0.10 |
| Warm/cool contrast | +0.20 ← do NOT revert |
| Same tone, 1 piece | +0.15 |
| Same tone, 2+ pieces | −0.05 |

### Watch rotation (v2)
```
worn in last 7 days  → recencyScore 0.0
never worn           → recencyScore 0.50 (lowered April 2026, was 0.75)
idle N days          → min(N/14, 1.0)
rotationPressure(∞)  → 0.50 (lowered April 2026, was 0.70)
```

### Context values
Valid: `smart-casual`, `formal`, `shift`, `casual`, `date-night`, `riviera`, `eid-celebration`, `family-event`
**`clinic` is REMOVED** — Israeli hospital ward has no dress code. Use `smart-casual` for work days.

### Strap-shoe rule
**DEAD as of v1.12.12.** `strapShoeScore()` always returns 1.0. No filtering by strap.
Do NOT re-add strap-shoe filtering.

### On-call shift watch pool
`dayProfile.js` hard-gates shift: only watches with `shiftWatch: true` score > 0.
Pool: **Speedmaster, Tudor BB41, Hanhart** only.

### FORMAL_CONTEXTS set
`new Set(["formal", "hospital-smart-casual", "shift"])` — clinic removed April 2026.
Replica penalty only fires for these contexts.

---

## §5 Netlify Functions Rules

- Browser-called functions: CORS headers required
- Cron functions (`auto-heal`, `push-brief`, `push-no-wear`, `supabase-keepalive`, `monthly-report`, `run-migrations`): NO CORS, never browser-called
- `auto-heal.js`: Netlify rejects HTTP invocation. **Dashboard trigger only.**
- Vision functions (`classify-image`, `selfie-check`, `watch-id`, `verify-garment-photo`): `maxAttempts: 1` mandatory. `selfie-check` also `max_tokens: 1100`.

### Claude model
Current: `claude-sonnet-4-6`. Update without deploy:
```sql
UPDATE app_config SET value = '"claude-sonnet-4-6"'::jsonb WHERE key = 'claude_model';
```
Value must be JSONB string literal.

---

## §6 Data Layer

### Supabase tables
| Table | Purpose | Notes |
|-------|---------|-------|
| `garments` | Wardrobe items | 81 active as of Apr 9 2026 |
| `history` | Wear log | 47 entries. `payload_version: "v1"` on all new entries |
| `app_config` | Key-value config | JSONB. Never double-parse. |
| `errors` | Error logging | |
| `push_subscriptions` | Push notif subs | |
| `app_settings` | Legacy | Do NOT use — use `app_config` |

### Garment count (Apr 9 2026)
81 active. Includes 7 new garments added Apr 9 (3x Timberland bottoms, 2x Kiral shirts, 2x Gant shirts).
`clinic` removed from all garment contexts — replaced with `smart-casual`.

### History INSERT pattern
```sql
INSERT INTO history (id, watch_id, date, payload, created_at)
VALUES (
  'wear-YYYY-MM-DD-{watchId}', '{watchId}', 'YYYY-MM-DD',
  '{"context":"smart-casual","garmentIds":[...],"payload_version":"v1"}'::jsonb,
  NOW()
) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload;
```

### Garment exclusion
Never hard-delete. Always: `UPDATE garments SET exclude_from_wardrobe = true WHERE id = '...'`

---

## §7 Automation & Self-Healing

### Crons (netlify.toml)
| Function | Schedule | Purpose |
|----------|----------|---------|
| `auto-heal` | `0 5 * * *` | 8 diagnostic checks, orphan stamping, stagnation flags |
| `push-brief` | `30 6 * * *` | Daily outfit brief |
| `push-no-wear` | separate cron | Push if no wear in 7 days |
| `supabase-keepalive` | `0 6 */5 * *` | Prevents free-tier pause |

### Auto-heal checks
Orphans · Stale unscored · Watch stagnation · Garment stagnation · Context distribution · Untagged garments · Score distribution · Never-worn %

### Token usage (Apr 2026)
$5.79 / month (1.3M input + 127K output tokens). Check: `app_config.monthly_token_usage`.

---

## §8 Key Components

| Component | Role |
|-----------|------|
| `WatchDashboard.jsx` | Today's outfit. buildOutfit() only. Hidden when context=shift. |
| `TodayPanel.jsx` | Watch logging. Context pills — no clinic option. |
| `WeekPlanner.jsx` | 7-day rotation. buildOutfit in try/catch. |
| `OnCallPlanner.jsx` | Shift outfit. Speedmaster/BB41/Hanhart only. |
| `SelfiePanel.jsx` | Photo analysis. 640/512/420px scaling. |
| `AuditPanel.jsx` | AI audit + orphan patch + debug. |
| `GarmentEditor.jsx` | Metadata edit. Tailor badge for flagged garments. |
| `WardrobeGrid.jsx` | Browse + filter. |
| `BulkTaggerPanel.jsx` | Batch AI tagging. |
| `DebugConsole.jsx` | Error log + monthly API cost. |

---

## §9 Key Gotchas

| Gotcha | Detail |
|--------|--------|
| Netlify site ID | `4d21d73c` = watch-advisor2. `85d12386` = Toranot. NEVER mix. |
| Vision timeout | 10s hard limit. `maxAttempts: 1` mandatory. |
| Legacy engine | `src/engine/outfitEngine.js` NOT used. Do not re-add `generateOutfit()`. |
| DIAL_COLOR_MAP | Only in `src/data/dialColorMap.js`. Never inline. |
| Scoring weights | Only in `src/config/scoringWeights.js`. Never inline. |
| Coherence v2 | warm/cool contrast = +0.20. Do NOT revert to −0.15. |
| rotationFactor | 0.40 default. Do not lower. |
| repetitionPenalty | −0.28 in contextMemory.js. |
| clinic context | REMOVED Apr 2026. Use smart-casual for work. Never re-add clinic. |
| Strap-shoe rule | DEAD. strapShoeScore() always 1.0. Do not re-add filtering. |
| FORMAL_CONTEXTS | formal, hospital-smart-casual, shift ONLY. clinic removed. |
| Migration commit | Always commit `.sql` after `apply_migration`. |
| garmentIds | Always include + `payload_version: "v1"` in history payload. |
| legacy history | `today-{ts}` IDs = no garmentIds. Stamp with [] + legacy note only. |
| w_ seed garments | 53 exist, all excluded. Do NOT re-activate. |
| app_config model | Value must be JSONB string: `'"model-name"'::jsonb`. |
| scoringOverrides | Runtime weight overrides via app_config. getOverride() in scoring. |
| USE_WORKER | false in imagePipeline.js. Don't re-enable. |
| auto-heal | Dashboard trigger only. HTTP invocation fails. |
| Vitest command | `timeout 120 node node_modules/.bin/vitest run` — never `npx vitest`. |
| quickLog/legacy | Never remove from history entries — orphan check depends on them. |
| never-worn | recencyScore 0.50, rotationPressure(∞) 0.50 (lowered April 2026). |

---

## §10 TODO

1. **Tailor follow-up** — Nautica White/Navy stripe + Tommy Hilfiger slate micro-check still need tailor visit. Gant Oxford cuffs need to go back (cuffs too long, not done Apr 9).
2. **BulkTagger** — Run on newly added garments (7 added Apr 9) to refine tags.
3. **Rikka bracelet** — Sent to watchmaker Apr 6. Repair status pending.
4. **Pasha + BB41 straps** — DayDayWatchband delivery pending.

---

## §11 Quick Reference

### Health check
```
GET https://watch-advisor2.netlify.app/.netlify/functions/skill-snapshot
```

### Run tests
```bash
timeout 120 node node_modules/.bin/vitest run
```

### Trigger auto-heal
Netlify dashboard → Functions → `auto-heal` → Trigger button.

### Check token cost
```sql
SELECT value FROM app_config WHERE key = 'monthly_token_usage';
```

### Scoring overrides (live, no deploy)
```sql
UPDATE app_config SET value = '{"rotationFactor": 0.45}'::jsonb WHERE key = 'scoring_overrides';
```

### Hard constraints — never violate
- Never re-add `generateOutfit()` fallback
- Never inline `DIAL_COLOR_MAP` or scoring weights
- Never set `maxAttempts > 1` on Vision functions
- Never hard-delete garments
- Never reactivate `w_` seed garments
- Never mix Netlify site IDs
- Never apply migration without committing `.sql` immediately
- Never double `JSON.parse` app_config values
- Never skip `garmentIds` + `payload_version: "v1"` in history payload
- Never invoke `auto-heal.js` via HTTP
- Never re-add `clinic` as a context option
- Never re-add strap-shoe filtering (strapShoeScore always 1.0)
