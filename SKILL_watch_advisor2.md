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
| Tests | 3748 tests, 212 files (Vitest) |
| Version | **1.13.48** |
| Device | OPPO Find X9 Pro |
| Deploys | Auto on push to `main` |
| Last audited | 2026-05-22. v1.13.48 in prod. Site health: garments=118, history=85, orphaned=0, active straps=41, model=claude-sonnet-4-6. v1.13.41–48 highlights: a11y contrast (24 WCAG AA fixes + residual 11→0), DIVERSITY ENFORCEMENT block in `buildUserPrompt` to escape shirt-color stuck loops, quantitative formality floors on `STEER_INSTRUCTIONS` (`more_formal` ≥6, `more_casual` ≤5 — no soften-back to soft verbs), Rules-of-Hooks fix across 3 components + static-scan regression guard `tests/hooksBeforeEarlyReturn.test.js`, shared `useAuthStore` + sign-in empty state + `WeekPlanner` auto-fetch gated on `isAuthed`, `GitHubLoginButton` migrated off local subscription with uniqueness guard `tests/authSubscriptionUniqueness.test.js`, and **v1.13.48 (PR #210): `CATEGORY_ROTATION_MULTIPLIER` in `scoringWeights.js` damps rotation/repetition/diversity factors per slot — shoes ×0 (rotation-neutral, re-wear free), pants ×0.4, others ×1; global 0.40/-0.28 weights untouched. Also `formalitySpreadMultiplier()` in `_pairHarmonyScore` — intra-outfit formality spread ≤3 free, -15% per excess pt, floor 0.55. Regression guards: `tests/categoryRotationDamping.test.js` + `tests/formalityCoherence.test.js`**. |
| Active model | `claude-sonnet-4-6` |
| May 2026 token cost | $2.02 (474K input / 39K output — 2026-05-10 snapshot) |
| Current scoring weights (live, from skill-snapshot) | rotationFactor=0.40, repetitionPenalty=-0.28, neverWornRotationPressure=0.50, neverWornRecencyScore=0.50, colorMatch=2.5, formalityMatch=3, watchCompatibility=3, weatherLayer=1, contextFormality=0.5, diversityFactor=-0.12, seasonMatch=0.3, contextMatch=0.1 — auto-heal has not yet written any tunes (`tuned: []`) |
| Wardrobe skill | SKILL_wardrobe_v10.md |

### Gotcha — date-dependent tests must inject `_transitionSeason`

`seasonContextFactor` reads `context._transitionSeason ?? transitionSeason()` — the
nullish coalesce only fires on `null`/`undefined`. A test passing `_transitionSeason: null`
still falls through to the real `Date.getMonth()`, making "adjacent season" assertions
flaky around month boundaries (April→May, July→August, etc.). Always pass a non-matching
sentinel like `"__none__"` to suppress the live transition lookup.

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
      diversityFactor.js  — diversity bonus from candidate.diversityBonus, ×CATEGORY_ROTATION_MULTIPLIER
      repetitionFactor.js — garment repetition penalty (-0.28 if worn in last 5), ×CATEGORY_ROTATION_MULTIPLIER
      rotationFactor.js   — rotation pressure × 0.40 weight, ×CATEGORY_ROTATION_MULTIPLIER
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
  skill-snapshot.js       — live app state endpoint (GET, **requires Bearer auth** — `requireUser()` gated)
  generate-embedding.js   — OpenAI embedding generation
.github/workflows/
  pr-test.yml             — vitest + build gate on every PR + push to main
  dependabot-auto-merge.yml — auto-merge dependabot PRs that pass CI
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
| rotationFactor | ×0.40, then ×CATEGORY_ROTATION_MULTIPLIER | `rotationFactor.js` |
| repetitionPenalty | -0.28 (worn in recent 5), then ×CATEGORY_ROTATION_MULTIPLIER | `contextMemory.js` |
| diversityPenalty | -0.12 × recent appearances (last 7 days), then ×CATEGORY_ROTATION_MULTIPLIER | `outfitBuilder.js` |
| rejectPenalty | -0.30 | rejectStore |
| replicaPenalty | -60% in clinic/formal/shift | `outfitBuilder.js` |
| seasonMatch | +0.30 (in-season), -0.80 (opposite) | `seasonContextFactor.js` |
| contextMatch | +0.25 | `seasonContextFactor.js` |
| weightFactor | ±0.15 max | `weightFactor.js` |
| coherenceBonus | ±20% of baseScore | `outfitBuilder.js _crossSlotCoherence()` |
| formalityCoherence | ×0.55–1.0 multiplier in `_pairHarmonyScore` — intra-outfit formality-spread penalty (spread ≤3 free; -15%/excess pt) | `outfitBuilder.js formalitySpreadMultiplier()` |

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

### CATEGORY_ROTATION_MULTIPLIER — empirical justification (v1.13.48)

The `shoes: 0` multiplier looks aggressive but is justified by the May 2026 history:
across 17 entries with `garmentIds` (May 1–19, pre-deploy), one shoe — the chestnut
Ecco S-Lite Hybrid derby — accounts for **8 of 17 wears (47%)** across 7 distinct
watches and contexts spanning dress (Reverso) through sport (Black Bay). The engine
was previously penalising re-wear via rotation/repetition/diversity factors, but the
user overrode the suggestion ~half the time. Setting `shoes: 0` stops the engine
fighting an empirical preference. Pants tell a softer story (Kiral Khaki = 4/17 ≈ 24%,
no single dominant pick), justifying `pants: 0.4` rather than 0. Shirts show no
concentration (10 unique items in 17 wears) — no damping needed, multiplier stays 1.

If you ever tune these multipliers, re-run the same SQL on `history.payload->garmentIds`
joined to `garments.category` for the last 30 days. The empirical floor for shoes
damping is the percentage of wears using the single most-worn shoe — if that drops
below ~25%, reconsider raising shoes back toward 0.2–0.3.

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
| `app_settings` | Per-watch active strap (`id='default'`, `active_straps` JSONB keyed by short watch_id) | **Active** — used by strap selector. Earlier skill versions tagged this "legacy"; that was wrong. Read/write via `app_settings`, not `app_config`. |

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
| **Version bump** | Always bump `package.json` version. Patch/minor/major. Current: **1.13.48**. |
| **w_ seed garments** | 53 exist, all excluded. Do NOT re-activate. |
| **quickLog/legacy** | Never remove from history entries — orphan check depends on them. |
| **sed vs python** | `python3 -c` with `str.replace()` is more reliable than `sed` for JSX edits. |
| **Scheduled functions** | Cannot be invoked via HTTP. Dashboard trigger only. |
| **Shirt idle rate** | 14/34 idle. Needs BulkTagger re-run + rotation pressure tuning. |
| **TV70102 color** | Kiral Khaki Zippered Cardigan is actually BROWN (tag KRL-2604XX confirmed). DB corrected Apr 11. |
| **Pending watches** | `pending:true` on watch excludes from rotation everywhere (engine + UI). Mirrors `retired` filter. Use `src/utils/watchFilters.js:isActiveWatch()` for any new filter point. 19 sites extend `!w.retired && !w.pending`. |
| **silver dial** | Not in DIAL_COLOR_MAP. Use `"silver-white"` for light silver dials (matches Snowflake). Adding a "silver" key broke colorMaterialDetection test. |
| **outfit-photo category trap** | Real garments silently miscategorized as `outfit-photo` (excluded by engine filter) are invisible landmines. Fixed Apr 18: Pavarotti navy suit trousers (14-day hidden from engine), White V-Neck Basic Tee dupe, Tan Textured Knit Pullover orphan. **v1.12.33: auto-heal check #9 `outfit_photo_trap` catches this daily** — dual signal (garment-word in name OR non-phantom id pattern). Flips `healthy: false` when found. Skips `exclude_from_wardrobe=true` rows. |
| **watch_id canonical form** | Keep one form per watch in history. Apr 18 found `gp-laureato` (1 entry) alongside `laureato` (7) — normalized to `laureato`. When logging wears via SQL, always query existing watch_ids first to match the canonical form. |
| **Strap ID alias map** | `src/data/strapAliases.js` normalizes legacy strap IDs (e.g., `rikka-titanium-bracelet` → `rikka-bracelet`) at IDB hydrate + cloud-pull boundary. Wired into `strapStore.hydrate` and `bootstrap`. **Never delete an alias entry** — users with stale IDB still need it. To rename a strap: (1) update seed, (2) add alias entry, (3) write Supabase migration normalizing `history.payload->>'strapId'`, (4) test guard `tests/watchSeedLegacyIds.test.js` enforces all three layers. |
| **Default-strap convention** | First strap in `watch.straps[]` array is the default per `buildInitialStraps()` in strapStore. To change a watch's default, reorder the array — `app_settings.active_straps` will sync on next user write but seed first-slot is the source of truth for new state. v1.13.40: Rikka + Snowflake bracelets moved to first slot per Eias's directive that bracelets are the default for both. |
| **Pattern rhyme pairing** | Clous de Paris / hobnail dials (Laureato, VC Overseas rep, Ingenieur rep hobnail texture) pair best with small-scale gridded fabrics: Prince of Wales check, glen plaid, nailhead, bird's-eye. The match is structural (grid-on-grid), not color. Documented on the Kiral DB Suit jacket notes for the AI stylist. |
| **storage.objects anon SELECT required** | Migration `20260422210000` dropped `photos_anon_select` to block bucket enumeration. Side effect: `uploadPhoto({ upsert: true })` and `deleteStoragePhoto()` (both used in `src/services/supabaseStorage.js`) silently broke for anon — upsert returned "new row violates RLS policy", and `.remove()` returned success while affecting zero rows (orphans accumulated). Restored on 2026-05-06 via `20260506050000_restore_photos_anon_select_for_upsert.sql`. **Do NOT drop this policy again** without first refactoring uploadPhoto + deleteStoragePhoto to never depend on UPSERT or row-level DELETE. |
| **storage.objects authenticated role policies** | Added 2026-05-06 v1.13.16 (`20260506050100_storage_authenticated_role_email_gated.sql`). When users sign in via Supabase Auth, the supabase-js client switches from `anon` → `authenticated`. Without explicit authenticated-role policies, every photo write from a signed-in browser fails RLS even though the parallel anon policies would allow it. Four policies (SELECT/INSERT/UPDATE/DELETE) gated on `auth.jwt()->>'email'`. Anon policies are kept for graceful sign-out fallback — RLS evaluates per-role so they don't widen each other. |
| **Email allowlist — three-layer sync** | The single-user email is hard-coded in three places: (1) `ALLOWED_USER_EMAIL` env var read by `_auth.js`, (2) `public.garments`/`public.history` RLS in `20260504052807_rls_email_restricted.sql`, (3) `storage.objects` RLS in `20260506050100_storage_authenticated_role_email_gated.sql`. Defense-in-depth: a single misconfig can't expose data. **If you ever rotate the email, update both migrations together** — there is no automated sync. |
| **push-subscribe POST auth** | v1.13.16 added `requireUser()` to the POST path. Was the only browser-callable function still ungated; open POST = spam vector for daily push briefs. DELETE keeps the legacy `x-api-secret`/`OPEN_API_KEY` scheme (separate consumer). All other browser-callable functions go through `_auth.js`. |
| **daily-pick.js watchId enum** | v1.13.17 incident — the system + user prompts both contained a hardcoded `watchId` enum that drifted from `src/data/watchSeed.js` IDs (`gp_laureato` instead of `laureato`, `ap_royal_oak` instead of `royal_oak`, etc.). Every Different-watch reply was rejected and the UI showed mismatched reasoning. Locked down with `tests/dailyPickPromptWatchEnum.test.js` — reads the source, parses every enum, asserts every id exists in seed and pending watches are excluded. **If you add or remove a watch in `watchSeed.js`, also update both enums in `daily-pick.js` (lines ~120 + ~443) — this test will fail until you do.** |
| **Different-watch validator failure = full rejection** | v1.13.17 — when `validateDifferentWatchPick` returns `!ok` in Different-watch mode, the entire AI response must be discarded (not just the watch field). Reasoning, strap suggestion, and garment overrides were all written ABOUT the rejected watch, so applying any of them while keeping the user's previous watch produces a visible mismatch. The branch in `WeekPlanner.jsx#handleAskClaude` sets `aiErrorByDay` and early-returns. Don't re-introduce partial application. |
| **`validateDifferentWatchPick` brand-prefix-strip** | v1.13.17 defense in depth. Anthropic's prompt cache holds responses ~5 min and Claude's training has strong brand-prefix instincts. The validator strips ONE recognized brand token + underscore (`gp_`, `ap_`, `chopard_`, `rolex_`, etc.) and retries before rejecting. Recursion intentionally disabled — only one strip layer. Unknown prefixes are NOT stripped (no false matches like `weird_blackbay` → `blackbay`). |
| **`authedFetch` for every privileged Netlify function** | Every browser-side call to a `_auth.js`-gated function MUST go through `src/services/authedFetch.js`. Raw `fetch()` won't attach the Bearer JWT and the server returns 401. Failure modes seen in the wild: v1.13.17 `style-dna` (StyleDNA card stuck on "Sign in" while signed in), v1.13.16/17 `pushService.subscribePush` (POST became gated, client wasn't updated). Audit grep: `grep -rn 'fetch(.*\\.netlify/functions' src/ \| grep -v authedFetch`. |
| **Layer tiers must agree across display + engine + prompt** | v1.13.18 — `getLayerRecommendation` (display badge), `_fillSweaterLayer`/`_fillJacket` (`outfitBuilder.js` engine), and the system prompt's layer-logic block (`netlify/functions/daily-pick.js`) all use temperature thresholds for the same decision. **Drift between any two = visible bug** (the 2026-05-07 incident: badge said "Sweater + jacket" at 16°C while engine refused sweater + prompt said "no sweater"). Canonical 4-tier model: `<10 coat / 10-13 sweater+jacket / 14-21 light jacket / ≥22 none`. The 14°C sweater gate is Eias-calibrated for the Mediterranean coast (no sweaters above 14°C). When changing any one of the three, change all three together and update boundary tests at 10/14/22°C in `tests/weatherService.test.js` + `tests/weatherRules.test.js`. |
| **`tempDressingMin/Max` not 24h `tempMin/Max` for chips** | v1.13.18 — `forecast.tempMin`/`tempMax` is the full 24h envelope from Open-Meteo. The min is typically the pre-dawn low (4-5am) — irrelevant since Eias is asleep. Chips must use `tempDressingMin`/`tempDressingMax`, computed as min/max across the 7-10am / 11-14pm / 17-20pm waking buckets. The chip falls back to the 24h envelope when hourly data is missing. Don't reintroduce `tempMin–tempMax` in user-facing chips. |
| **Error logging serialization — never JSON.stringify a raw Error** | v1.13.19 — `JSON.stringify(new Error("foo"))` returns `"{}"` because `name`, `message`, and `stack` are non-enumerable. From 2026-04-23 to 2026-05-07 every `console.error(err)` / unhandled `componentDidCatch` produced a useless `"{}"` debug entry — the May 7 mystery boot crash was unsolvable for hours because of this single helper bug. Always use `serializeForLog` (`src/services/debugLogger.js`) for any object that might be an Error, or unpack `name`/`message`/`stack` explicitly. The patched `console.error` and the `ErrorBoundary.componentDidCatch` already do this since v1.13.19; if you add another error-logging path, route it through `serializeForLog` too. |
| **Garment slot contract — id-first, name fallback** | v1.13.20 — the AI prompt sends each wardrobe garment as `id:<id> \| <Name> (<type>, <color>, <brand>, formality:N)` and asks the model to return the id. `resolveGarmentSlots` tries exact id match first (incl. stripping accidental `"id:"` prefix), then normalized name match, then unmatched. **Never add a fuzzy color+category fallback** — the wardrobe has multiple navy pants, multiple brown belts; fuzzy matching would silently pick the wrong one. The id channel exists precisely to avoid that ambiguity. |
| **Production source maps** | v1.13.20 — `vite.config.js` has `build.sourcemap = true`. The `.map` files ship alongside `index-*.js` and are fetched lazily by browser devtools (zero impact on user-facing initial bundle). Required for any future ErrorBoundary or unhandledrejection log to name the actual component instead of the minified `ds`/`je`/`Fs`. Repo is public on GitHub so the maps don't disclose anything new. Don't disable. |
| **Hooks before early return — Rules of Hooks** | v1.13.45 — three components shipped to prod with `if (!prop) return null;` BEFORE one or more hook calls (`WatchCard` in `WatchDashboard.jsx`, `GarmentDetail.jsx`, `StrapPanel.jsx`). On a fresh / unauthenticated session the relevant prop transitions null→defined across renders, hook count changes, React throws #300 ("Rendered fewer hooks than expected") and ErrorBoundary blanks the subtree. **All hooks must run before any conditional `return` in a component body.** Guard regression with `tests/hooksBeforeEarlyReturn.test.js` — static brace-depth scan over `src/**/*.{js,jsx}` flagging the anti-pattern at component body level only (depth=1, not inside nested callbacks). Opt-out comment `// hooks-order-ok` for the rare legitimate case. |
| **Shared auth state — `useAuthStore`** | v1.13.46 — `src/stores/authStore.js` is the single source of truth for `{ user, isAuthed, _initialized }`. Initialized once at boot from `bootstrap.js` via `initAuthStore()` (which calls `getSession()` and subscribes to `onAuthStateChange`). Components read with `useAuthStore(s => s.isAuthed)` — do NOT add another `getSession()` + `onAuthStateChange` subscription. `_initialized` flips true after the initial `getSession()` resolves; gate any "show sign-in hint" UI on `_initialized && !isAuthed` to avoid a flash of sign-in copy on real authed reloads. v1.13.47 migrated `GitHubLoginButton` off its local subscription; `tests/authSubscriptionUniqueness.test.js` now enforces the rule (only `authStore.js`, `authedFetch.js`, `supabaseAuth.js` may touch auth events). |
| **Auto-fetch effects must gate on `isAuthed`** | v1.13.46 — `WeekPlanner`'s two auto-fetch `useEffect`s (auto-refit on drift, first-render auto-load) early-return when `!isAuthed`. The auto-load specifically does NOT latch `autoLoadedRef = true` while unauthed, so sign-in mid-session correctly re-fires the effect (deps include `isAuthed`). Any new `useEffect` that calls an `_auth.js`-gated function MUST gate on `isAuthed` the same way — otherwise it produces a stream of 401s in the console and burns nothing useful. |
| **Backticks inside template literals — use double-quotes for inline code** | v1.13.20 mid-session catch — `\`...some code...\`` inside an outer `\`...\`` template literal is a parse error (Rollup: `Expected ';'`). When writing prompt strings that need to reference inline code-style snippets, use `"..."` markers or HTML entities, not backticks. The json reporter says `numFailedTests=0` when files fail to LOAD because no individual test ran to fail; trust the **text** reporter or check `numTotalTestSuites` count drift. v1.13.18→19 was 918 suites; my v1.13.20 first attempt produced 910 — that delta caught the broken file. |

---

## 8. Quick Reference

### Health check
```
curl -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  https://watch-advisor2.netlify.app/.netlify/functions/skill-snapshot
```
**Auth required** (Bearer token, anon JWT or higher). Endpoint started 401-ing on missing/invalid token after the email-restricted RLS migration on 2026-05-04. Earlier skill versions said "no auth" — that's stale.
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
- Never delete an entry from `STRAP_ID_ALIASES` (`src/data/strapAliases.js`) — users with stale IDB caches still need it. Audit history with the matching SQL in `supabase/migrations/` and confirm zero remaining rows before pruning.
