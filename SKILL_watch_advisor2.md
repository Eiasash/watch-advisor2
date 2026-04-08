# SKILL — Watch Advisor 2

> Auto-generated skill file. Updated by `/update-skill` command.
> Do NOT edit manually — run `/update-skill` to refresh from codebase + Supabase.

---

## §1 Overview

| Metric | Value |
|--------|-------|
| Version | 1.12.13 |
| Stack | React 18 + Vite 7 + Zustand 4 + IndexedDB + Supabase + Netlify Functions |
| Source files | 136 |
| Source LOC | ~22,500 |
| Test files | 131 |
| Tests | 2359 |
| Netlify functions | 25 (+3 helpers) |
| Cron functions | 3 (auto-heal 5am, push-brief 6:30am, keepalive /5d) |
| Components | 58 JSX |
| Zustand stores | 9 |
| Build output | ~570 kB |
| Live URL | https://watch-advisor2.netlify.app |
| Last audited | 2026-04-08 |

---

## §2 Architecture

```
src/
  app/
    AppShell.jsx          — router, nav, theme, boot status, storage quota toast
    bootstrap.js          — IDB load → cloud pull, task handlers (incl. upload-angle with URL writeback), backup + storage quota + debugStore push
  components/             — 58 JSX UI components (see Key Components)
  config/
    scoringWeights.js     — SCORE_WEIGHTS + STYLE_LEARN — ONLY place to change weights
    strapRules.js         — strap-shoe rule constants
    weatherRules.js       — layer temp brackets
  data/
    watchSeed.js          — 23 active + 3 retired watches, source of truth — IMMUTABLE
    dialColorMap.js       — CANONICAL dial color → garment color map (shared)
  domain/
    contextMemory.js      — repetitionPenalty() — recently-worn garment penalty (-0.28)
    rotationStats.js      — daysIdle(), rotationPressure(), garmentDaysIdle(), neglectedGenuine()
    preferenceLearning.js — learnPreferenceWeights() from history
    historyWindow.js      — recentHistory() calendar-day-based window, recentWatchIds()
  engine/                 — LEGACY watch scoring (still active for watch rotation)
    dayProfile.js         — scoreWatchForDay(), inferDayProfile(), DAY_PROFILES. shiftWatch gate.
    weekRotation.js       — genWeekRotation() — 7-day watch rotation
  outfitEngine/           — PRIMARY outfit scoring engine
    outfitBuilder.js      — buildOutfit() — entry point, beam-search combo + slot picking
    scoring.js            — scoreGarment(), strapShoeScore(), contextFormalityScore()
    confidence.js         — outfitConfidence() — SCORE_CEILING = 30 (additive engine)
    explain.js            — explainOutfit(), explainSeasonContext() — Jerusalem timezone
    watchStyles.js        — STYLE_TO_SLOTS, STYLE_FORMALITY_TARGET
    strapRecommender.js   — recommendStrap() — palette-aware strap scoring (shoe + outfit + dial + context)
    scoringFactors/
      index.js            — registerFactor(), applyFactors() — factor pipeline
      diversityFactor.js  — diversity bonus
      repetitionFactor.js — garment repetition penalty (-0.28 if worn in last 5)
      rotationFactor.js   — rotation pressure × 0.40 weight
      seasonContextFactor.js — season/context tag matching, Jerusalem timezone
      weightFactor.js     — garment weight (light/heavy) vs temperature scoring
  hooks/
    useTodayFormState.js  — TodayPanel form state, auto-detects shift from onCallDates
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
  weather/
    weatherService.js     — Open-Meteo API, geolocation fallback to Jerusalem, 7-day forecast
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
  github-pat.js           — GitHub PAT endpoint for Claude session access (GET, x-api-secret auth)
  generate-embedding.js   — OpenAI embedding generation
  daily-pick.js           — Claude-generated daily outfit pick (browser, CORS, maxAttempts: 1; 4h cache)
  monthly-report.js       — Monthly self-improvement analysis cron (1st of month 7am UTC, no CORS)
  style-dna.js            — Style DNA extraction from wear history (browser, CORS, maxAttempts: 1)
  wardrobe-chat.js        — Conversational AI wardrobe advisor (browser, CORS, maxAttempts: 1)
  watch-value.js          — Watch cost-per-wear calculation (browser, CORS)
  seasonal-audit.js       — Seasonal wardrobe audit + garment recommendations (browser, CORS)
  run-migrations.js       — Bundled migration runner (admin, no CORS)
.github/workflows/
  weekly-audit.yml        — Monday 6am UTC autonomous audit via Claude Code
supabase/migrations/      — SQL migration audit trail (commit .sql after every apply_migration)
tests/                    — 131 Vitest test files (2359 tests)
```

---

## §3 Scoring System (last audited: 2026-04-06)

### Base formula
```
scoreGarment = (colorMatch × 2.5) + (formalityMatch × 3) + (watchCompatibility × 3)
             + (weatherLayer × 1) + (contextFormality × 0.5)
```
All weights live exclusively in `src/config/scoringWeights.js`. Never inline.

### Post-score modifiers (applied in outfitBuilder._scoreCandidate)
| Modifier | Value | Source |
|----------|-------|--------|
| rotationFactor weight | ×0.40 | `rotationFactor.js` |
| repetitionPenalty | -0.28 (if worn in recent 5 entries) | `contextMemory.js` |
| diversityPenalty | -0.12 × recent appearances (last 7 days) | `outfitBuilder.js diversityBonus()` |
| rejectPenalty | -0.30 | rejectStore |
| replicaPenalty | -60% of baseScore in clinic/formal/shift | `outfitBuilder.js` |
| seasonMatch | +0.30 (in-season), -0.80 (opposite season) | `seasonContextFactor.js` |
| contextMatch | +0.10 | `seasonContextFactor.js` |
| weightFactor | ±0.15 max (heavy in heat / ultralight in cold) | `weightFactor.js` |
| coherenceBonus | ±20% of baseScore (scaled from -0.40 to +0.20 raw) | `outfitBuilder.js _crossSlotCoherence()` |
| brightnessNudge | ±0.05 (dark penalty / light boost) | `scoring.js` |
| preferenceWeights | formality lean from wear history | `preferenceLearning.js` |

### Cross-Slot Coherence — v2
```
Exact color repeat          → -0.40
Neutral candidate           → +0.10
Warm/cool contrast          → +0.20  ← reward contrast, do NOT revert
Same tone, 1 piece          → +0.15
Same tone, 2+ pieces        → -0.05
```

### Confidence (SCORE_CEILING = 30)
Combo score = sum of 3 garment base scores + coherence bonuses × pair-harmony multiplier.
Typical range: 5–33. Normalised against ceiling of 30.
Labels: strong ≥0.75, good ≥0.55, moderate ≥0.35, weak <0.35.
**SCORE_CEILING was 0.60 (broken, multiplicative era) — fixed March 22 2026 to 30.**

### Context Values
Valid: `clinic`, `smart-casual`, `formal`, `shift`, `casual`, `date-night`, `riviera`,
`eid-celebration`, `family-event`

### Watch Rotation — v2
```
worn in last 7 days  → recencyScore 0.0
never worn           → recencyScore 0.50 (gentle nudge, not aggressive)
idle N days          → min(N/14, 1.0)
rotationPressure(Infinity) = 0.50
```

### On-Call / Shift Watch Pool
`dayProfile.js` hard-gates shift context: `if (!watch.shiftWatch) return 0;`
Only 3 watches have `shiftWatch: true` in watchSeed.js: **Speedmaster**, **Tudor BB41**, **Hanhart**.
All others score 0 in shift context — no dress watches, no replicas.

### Outfit Generation Pipeline
1. Read selected watch + active strap → enrichedWatch
2. Filter wearable garments (exclude accessories, tailor-flagged in formal)
3. Pre-filter shoes by strap-shoe rule (hard 0.0 elimination)
4. Build top-N shortlists per core slot (shirt/pants/shoes)
5. Beam-search over all combinations: sum-of-scores × pair-harmony × coherence
6. Fill remaining slots (jacket, sweater, layer, belt) per-slot greedy
7. Multilayer logic: sweater if <22°C, second layer if <8°C (pullover/zip differentiation)
8. Belt auto-matched to shoe color
9. Pants-shoe palette coherence swap if harmony ≤0.4
10. Dual-dial recommendation (Reverso: dark outfit → white side, light → navy)
11. Confidence + explanation

### Shuffle Mechanism
- Each shuffle increment adds previous picks to `excludedPerSlot` (hard) AND injects
  5 fake history entries with both `.outfit` and `.garmentIds` so both `diversityBonus`
  and `repetitionPenalty` fire on shuffled-away picks.
- Three shuffle paths (all consistent): WatchDashboard, WeekPlanner rotation, AddOutfitModal.

### Weather Integration
- Open-Meteo API with geolocation (fallback: Jerusalem 31.7683, 35.2137)
- WatchDashboard: single current weather, deferred 2s after mount
- WeekPlanner: 7-day forecast with 1-hour IDB cache, per-day weather to buildOutfit
- AddOutfitModal: receives forecast prop, resolves per-day weather
- OnCallPlanner: 2-day forecast (Day 1 + Day 2), independent fetch
- Layer brackets: <10°C = coat (1.0), <16°C = sweater (0.8), <22°C = light jacket (0.5), ≥22°C = no layer (0.1)

---

## §4 Automation & Self-Healing

### Daily auto-heal cron (`auto-heal.js` — 5:00 UTC)
Runs 7 diagnostic checks, auto-fixes what it can, logs results to `app_config.auto_heal_log`:

| Check | Auto-fix | Threshold |
|-------|----------|-----------|
| Orphaned history entries | Stamps quickLog/legacy | Any unstamped empty garmentIds |
| Watch rotation stagnation | Auto-tunes rotationFactor +0.05 (cap 0.60) | Same watch >40% of last 10 |
| Garment slot stagnation | Auto-tunes repetitionPenalty -0.03 (cap -0.40) | Same garment >5× in 14d |
| Context distribution | Flags broken UI | >80% null contexts |
| Untagged garments | Flags for BulkTagger | >10 missing season/context/material |
| Score distribution | Flags stuck scoring | All scores identical |
| Never-worn percentage | Flags for rotation pressure increase | >50% wardrobe never worn |

### Daily push-brief (`push-brief.js` — 6:30 UTC)
- If no outfit logged in 7+ days → sends no-wear reminder instead of outfit brief

### Supabase keepalive (`supabase-keepalive.js` — every 5 days)
- Prevents free tier pause after 7 days inactivity

### Weekly GitHub Action (`weekly-audit.yml` — Monday 6am UTC)
- Full autonomous audit via Claude Code. Secrets: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`

### Token usage
`_claudeClient.js` fire-and-forget calls `increment_token_usage` RPC after every Claude call.
Visible in DebugConsole + `app_config.monthly_token_usage`.

---

## §5 Data Layer

### Supabase Tables
| Table | Purpose | Notes |
|-------|---------|-------|
| `garments` | Wardrobe items | 72 active, fully tagged (seasons/contexts/material/weight) |
| `history` | Wear log | 45 entries. `payload_version: "v1"` on all entries |
| `app_config` | Key-value config | JSONB. Never double-parse. |
| `errors` | Error logging | |
| `push_subscriptions` | Push notif subs | |
| `app_settings` | **Legacy** | Do NOT use — use `app_config` |

### History entry flags
| Flag | Meaning | Orphan check excluded |
|------|---------|----------------------|
| `quickLog: true` | One-tap watch log, no garments | Yes |
| `legacy: true` | Pre-March 2026, garmentIds unrecoverable | Yes |
| `payload_version: "v1"` | Schema version | Required on all entries |

### Garment exclusion
Never hard-delete. Always: `UPDATE garments SET exclude_from_wardrobe = true WHERE id = '...'`

---

## §6 Key Components

| Component | Role |
|-----------|------|
| `WatchDashboard.jsx` | Today's outfit. buildOutfit only. Hidden when context="shift" (OnCallPlanner takes over). |
| `TodayPanel.jsx` | Watch logging (full + quick). Context pills. Shows OnCallPlanner when shift selected. |
| `OnCallPlanner.jsx` | Shift outfit. Watch pool: Speedmaster, BB41, Hanhart only (`shiftWatch` flag). |
| `WeekPlanner.jsx` | 7-day rotation + AddOutfitModal. Weather-aware per-day. |
| `SelfiePanel.jsx` | Photo analysis. 640/512/420px scaling. |
| `AuditPanel.jsx` | AI audit + orphan patch (search + camera) + Sync Angles backfill + Debug section. |
| `StatsPanel.jsx` | Wear analytics. Lives under History tab. |
| `DebugConsole.jsx` | Error log + App Health dashboard (tokens, wear rates, auto-heal). |
| `GarmentEditor.jsx` | Metadata edit. Tailor badge for flagged garments. |
| `WardrobeGrid.jsx` | Browse + filter. Tailor badge visible. |
| `WatchSelector.jsx` | Watch dropdown. Filters retired watches (`!w.retired`). |

### Tab layout
| Tab | Contents |
|-----|----------|
| Today | TodayPanel + WatchDashboard (hidden when shift) |
| Wardrobe | ImportPanel + WardrobeGrid |
| Plan | WeekPlanner + WatchRotationPanel |
| History | OutfitHistory + StatsPanel |
| Audit | AI Audit + OrphanedHistoryPatch + DebugSection |

### On-Call UX Flow
1. User marks dates as on-call in WeekPlanner calendar
2. `useTodayFormState` auto-detects on-call → defaults context to "shift"
3. OnCallPlanner renders inside TodayPanel (orange border card)
4. WatchDashboard returns null — no duplicate outfit
5. OnCallPlanner generates 3 Day-1 alternatives + Day-2 post-call outfit + pack list

---

## §7 Key Gotchas

| Gotcha | Detail |
|--------|--------|
| **Netlify site IDs** | `4d21d73c` = watch-advisor2. `85d12386` = Toranot. NEVER mix. |
| **Vision timeout** | 10s hard limit. `maxAttempts: 1` mandatory on all 4 Vision functions. |
| **auto-heal HTTP** | Netlify rejects scheduled function HTTP calls → Internal Error. Dashboard only. |
| **Legacy engine** | `src/engine/outfitEngine.js` exists but NOT used. Do not re-add `generateOutfit()`. |
| **DIAL_COLOR_MAP** | Only in `src/data/dialColorMap.js`. Never inline. |
| **Scoring weights** | Only in `src/config/scoringWeights.js`. Never inline. |
| **Coherence v2** | warm/cool contrast = +0.20. Do NOT revert to -0.15. |
| **Never-worn** | recencyScore 0.50 (gentle nudge). rotationPressure(Infinity) = 0.50. |
| **rotationFactor** | 0.40 default, auto-tunable via `scoringOverrides`. Do not lower. |
| **repetitionPenalty** | -0.28 default in `contextMemory.js`, auto-tunable via `scoringOverrides`. |
| **SCORE_CEILING** | `confidence.js` ceiling = 30 (additive engine). Was 0.60 (broken). Never lower without recalibrating. |
| **Context soft nudge** | `contextFormality` weight = 0.5 (was 1.5). No -Infinity hard gate. Context is optional — null = "Any Vibe" (0.75 neutral). Shift mode still hard-gates via dayProfile.js shiftWatch flag. |
| **contextMatch** | seasonContextFactor bonus = 0.10 (was 0.25). Context is a nudge, weather+rotation+color drive selection. |
| **AddOutfitModal weather** | Must receive `forecast` prop. Was hardcoded 22°C. Fixed March 22. |
| **Shuffle garmentIds** | Fake history entries MUST include `.garmentIds` array so repetitionPenalty fires. |
| **Season timezone** | Both `seasonContextFactor.js` and `explain.js` use Asia/Jerusalem. Must match. |
| **Retired watches** | 3 retired in watchSeed.js. Filtered from ALL UI selectors + engine. Kept for history display. |
| **shiftWatch gate** | `dayProfile.js`: shift context → `return 0` if `!watch.shiftWatch`. Only speedmaster/blackbay/hanhart. |
| **WatchDashboard shift** | Returns null when `todayContext === "shift"` — OnCallPlanner is sole shift UI. |
| **useTodayFormState** | Auto-detects on-call from `onCallDates` store. Defaults to "shift" if today is on-call. |
| **Migration commit** | Always commit `.sql` to `supabase/migrations/` after `apply_migration`. |
| **garmentIds** | Always include + `payload_version: "v1"` in history payload. |
| **w_ seed garments** | 53 exist, all `exclude_from_wardrobe = true`. Do NOT re-activate. |
| **app_config JSONB** | Supabase auto-parses JSONB. Never double `JSON.parse()`. |
| **app_config model** | Must be `'"model-name"'::jsonb`, not bare text. |
| **watch-rec.js** | DELETED March 21 2026. |
| **push-no-wear.js** | Does NOT exist. No-wear logic is embedded in `push-brief.js`. |
| **Dead code removed** | `VersionChip`, `detectDominantColorFromDataURL` — deleted March 21 2026. |
| **USE_WORKER** | `false` in `imagePipeline.js`. Do not re-enable. |
| **quickLog/legacy flags** | Never remove from history entries — orphan health check depends on them. |
| **Vitest command** | `timeout 120 node node_modules/.bin/vitest run` — never `npx vitest`. |
| **Outfit overrides** | Keyed by ISO date string, not `day.offset`. |
| **Rejection context** | Uses actual context, not hardcoded `"smart-casual"`. |
| **upload-angle handler** | Must write publicUrl back to garment.photoAngles + pushGarment. Was broken (discarded URL) until April 3 2026 fix. |
| **SyncAnglesPanel** | Audit tab backfill tool for garments with local-only base64 angles. Queries Supabase directly (not local state). Auto-hides when nothing to sync. |
| **strapRecommender v2** | Scores straps against shoe color + outfit palette + dial harmony + context. Used by both outfitBuilder (Plan tab) and WatchDashboard (Today tab). Never revert to shoe-only matching. |
| **strapRules.js** | Single source of truth for strap-shoe rules. olive/green straps allow brown/tan/white/black shoes. |
| **WeekPlanner AI button** | `handleAskClaude` must NOT override user's watch selection. AI only sets garment overrides via `setOutfitOverrides`. Watch override removed in v1.12.13. |
| **WeekPlanner retired filter** | Both watch-override picker and AddOutfitModal must filter `!w.retired`. Was missing until v1.12.13. |
| **Reverso dual-dial in Plan** | `dialSideOverrides` state (per-day) in WeekPlanner. Feeds `enrichedWatch.dial` to `buildOutfit()` for color matching. Toggle UI renders when `day.watch?.dualDial` exists. |

---

## §8 v1.9.0 Features (April 2026)

| Feature | Files | Notes |
|---------|-------|-------|
| **Required score rating** | TodayPanel.jsx | Score defaults null, log disabled until rated. Amber border nudge. |
| **Never-worn slot reservation** | outfitBuilder.js | Every 3rd outfit forces never-worn garment into beam-search shortlist (shirt/pants). |
| **NeglectedWatchNudge** | today/NeglectedWatchNudge.jsx + TodayPanel | Amber card for genuine watches idle 14+ days. Tap to select. |
| **Cross-strap tracking** | strapStore.js | `moveStrap(strapId, from, to)`, `returnStrap(strapId)`, `getCrossStrapped()`. Tracks `originalWatchId` + `crossStrapped` flag. |
| **Photo prompt after log** | TodayPanel.jsx | Camera button shown post-log if no outfit photo. One tap capture + attach. |
| **Weather-driven strap scoring** | strapRecommender.js | Rain: leather -0.10, bracelet +0.15, NATO/rubber +0.10. Heat >28°C: NATO/rubber +0.10. `poorFit` flag halves score. |
| **Tailor queue countdown** | today/TailorCountdown.jsx + TodayPanel | Green card shows tailor pieces + days-until-pickup. Reads tailor-flagged garment notes. |
| **recommendStrap weather param** | strapRecommender.js | `recommendStrap(watch, outfit, context, weather)` — 4th arg optional. |

### Key gotchas added
- **outfitScore default** is `null` (not 7). Log button requires score selection.
- **Never-worn reservation** fires on `history.length % 3 === 0`. Uses `_wornIds` Set built from all history garmentIds.
- **strapStore.moveStrap** sets `originalWatchId` and `crossStrapped: true`. `returnStrap` reverses.
- **TailorCountdown pickupDate** is hardcoded to `2026-04-09`. Update when tailor schedule changes.
- **strapRecommender weather** — `weather.precipMm` and `weather.tempC` drive bonuses. Undefined = no weather effect.

---

## §8b TODO (not yet implemented)

1. **Tailor follow-up (UI badge only)** — Scoring exclusion already exists in `outfitBuilder.js:337-342`. Remaining work: add visual "at tailor" badge in wardrobe grid. Nautica White/Navy stripe + Tommy Hilfiger slate micro-check blocked from clinic/formal until cleared. 5 pieces dropped off Apr 5, pickup Apr 9.
2. **Cross-strap UI** — strapStore has moveStrap/returnStrap but no UI component yet. Build StrapSwapCard for visual strap management.
3. **Dynamic tailor pickupDate** — currently hardcoded. Move to app_config or wardrobeStore.
4. **Garment picker sort bias** — add "recently worn" / "frequency" sort to check-in garment picker so daily drivers (e.g. Ecco S-Lite, RL light blue shirt) float above similar-looking duplicates. Currently mis-suggests wrong Ecco and wrong light blue shirt during check-in.

---

## §9 Quick Reference

### Health check
```
GET https://watch-advisor2.netlify.app/.netlify/functions/skill-snapshot
```

### GitHub PAT (auto-fetch at session start)
```
GET https://watch-advisor2.netlify.app/.netlify/functions/github-pat
Header: x-api-secret: <OPEN_API_KEY>
```
Returns: `{ "pat": "github_pat_..." }` — use for clone/push to `Eiasash/watch-advisor2`.
Returns: `garmentCount`, `orphanedHistoryCount`, `activeModel`, `tokenUsage`,
`autoHeal`, `outfitQualityTrend`, `wardrobeHealth`, `health` checks.

Expected healthy state:
- `garmentCount >= 70`
- `orphanedHistoryCount === 0`
- `activeModel !== "unknown"`
- All `health.*` === `"ok"`
- `autoHeal.healthy === true`
- `tokenUsage.month` === current month

### Run tests
```bash
timeout 120 node node_modules/.bin/vitest run   # 2359 tests, zero failures
```

### Trigger auto-heal
Netlify dashboard → Functions → `auto-heal` → Trigger button. (HTTP invocation will fail.)

### Hard constraints — never violate
- Never re-add `generateOutfit()` fallback
- Never inline `DIAL_COLOR_MAP` or scoring weights
- Never set `maxAttempts > 1` on Vision functions
- Never hard-delete garments
- Never reactivate `w_` seed garments
- Never mix Netlify site IDs `4d21d73c` / `85d12386`
- Never apply migration without committing `.sql` immediately
- Never double `JSON.parse` app_config values
- Never skip `garmentIds` + `payload_version: "v1"` in history payload
- Never invoke `auto-heal.js` via HTTP
- Never lower SCORE_CEILING without recalibrating confidence labels

### Claude's Pick (daily-pick.js + ClaudePick.jsx) — Added April 3 2026
- Netlify function `daily-pick.js` fetches garments, watches, 14d history, hourly weather
- Calls Claude with full styling rules (same as human conversation)
- Returns JSON: watch, strap, all garment slots, reasoning, score, layerTip
- 4-hour cache in `app_config.daily_pick`, force-refresh button in UI
- ClaudePick.jsx: purple accent card in Today tab, collapsible
- Plan tab: "🤖" button per day calls daily-pick with that day's weather, applies as overrides

### Hourly Weather — Added April 3 2026
- `fetchWeatherForecast()` requests `hourly=temperature_2m` from Open-Meteo
- Computes `tempMorning` (7-10am), `tempMidday` (11-14), `tempEvening` (17-20)
- Primary outfit temp = morning temp (you dress for the morning)
- WeatherBadge shows: 🌅 8° · ☀️ 15° · 🌙 10° + "Shed the layer after noon"
- Default temp fallback: 22°C → 15°C everywhere (outfitBuilder, WatchDashboard, WeekPlanner)

### Weekly AI Brief — push-brief.js enhanced April 3 2026
- Mondays: buildWeeklyBrief() generates a 7-day watch rotation with outfit suggestions per day
- Other days: buildBrief() with hourly weather (morning/midday temps from Open-Meteo)
- Both include: layer transition tips, strap recommendations, Pasha bracelet avoidance
- Weekly brief cached in app_config.weekly_brief
- Daily brief includes layerTip field
