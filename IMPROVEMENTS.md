# Auto-Generated Improvement Proposals
Generated: 2026-04-23 (cumulative)

## Current State
- **Version**: 1.12.41
- **Engine integrity**: All checks PASS
- **Supabase**: 101 active garments (skill-snapshot), 0 dupes, 0 orphans
- **Watches**: 23 active + 2 pending (Atelier Wen Perception SG → IL; Fears Brunswick 38 Champagne SG → IL, invoice INV-3936 issued 22 Apr, £2,500 GBP)
- **Straps**: 42 total active (Santos Large +2 aftermarket alligator, Apr 29)
- **Tests**: 2477+ passing (144 files, +2 new autoHeal trap-guard tests) — critical paths verified green
- **Snapshot**: All health "ok", autoHeal healthy (9 checks now, was 8)
- **Build**: Auto-deploy on push to main
- **Model**: claude-sonnet-4-6
- **Acquisition target**: Fears Brunswick 38 Champagne ordered Apr 22 (pending SG→IL); anOrdain Model 2 Brown Fumé passive at $2,500 distressed-floor only

---

## Fixes Shipped — Cumulative Log

### v1.5.5 (March 2026)
1. **Retired watch UI leak** — SBGW267, Sinn 613, Rolex Date 15203 appeared in 6 UI paths. All filtered with `!w.retired`.

### v1.5.6 (March 2026)
2. **CRITICAL: SCORE_CEILING** — Was 0.60 (multiplicative era). Fixed to 30 (additive engine).
3. **AddOutfitModal weather hardcoded** — Was {tempC: 22}. Now threads forecast prop from WeekPlanner.
4. **explainSeasonContext timezone** — Used raw `new Date().getMonth()`. Now uses `Asia/Jerusalem`.
5. **Shuffle fake history missing garmentIds** — repetitionPenalty never fired on shuffled picks. Fixed.
6. **On-call UX duplicate** — WatchDashboard + OnCallPlanner both generated shift outfits. WatchDashboard returns null when shift.
7. **On-call auto-detect** — `useTodayFormState` auto-defaults to "shift" from onCallDates.
8. **Test fix** — calendarWatchRotationEdge shiftWatch gate test added.
9. **Grey Melange Kiral trousers** — missing `material` tag. Set to `cotton-blend`.

### v1.12.8 (April 2026)
10. **CRITICAL: IDB array crash** — `.filter()` crashes from IDB returning non-array truthy values. Replaced all `?? []` with `Array.isArray()` / `toArray()` utility. Six prior attempts failed for same root cause.
11. **bootstrap.js field name** — Destructured `{ history }` but field is named `entries`. Fixed.

### v1.12.9 (April 2026)
12. **AI chat history persistence** — Chat history persists to IDB across sessions. Base64 images stripped, metadata only.
13. **Multi-photo chat** — Up to 4 images, resized to 800px, preview strip, individual remove buttons.
14. **Multi-block Claude response fix** — All 15 serverless functions used `content[0].text`. Fixed via `extractText()` helper that finds `type:"text"` block explicitly.

### v1.12.12 (April 2026)
15. **Strap-shoe rule ELIMINATED** — `strapShoeScore()` always returns 1.0. `filterShoesByStrap` removed. Strap chip removed from UI.

### v1.12.15–v1.12.19 (April 2026)
16. **Never-worn scores lowered** — recencyScore 0.75→0.50, rotationPressure(Infinity) 0.70→0.50.
17. **Supabase env var fix** — `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` added to Netlify. App was connecting to example.supabase.co.
18. **New garments onboarded (Apr 10–11)** — 18 items added: Di Porto shirts, Fynch-Hatton flannel, multiple dress shirts, Gant dark navy cable knit, Greg Norman black zip knit, Nautica grey QZ, olive brown chinos, dark navy slim jeans, Blundstone Chelsea boots, Puma white multicolor, Pavarotti dress shirt, misc flannel/dress shirts. Total: 80→98.
19. **scoringOverrides system** — Runtime weight tuning via `app_config` without deploys.

### DB Maintenance (April 11 2026)
20. **+2 garments onboarded** — Kiral Old Money Green Cashmere Sweater (KRL-2605XX) + Kiral Grey Dress Trousers. Total: 98→100.
21. **Data fix** — Kiral TV70102 cardigan color corrected khaki→brown (tag confirmed KRL-2604XX, "BROWN").
22. **Full dedup audit** — 100 garments scanned, 0 duplicates found. Both Chelsea boots confirmed distinct items.

### v1.12.24 — Audit Fixes (April 13 2026)
23. **bulk-tag.js clinic context bug** — `clinic` was in CONTEXTS allowlist so AI suggestions passed through unfiltered. Removed from allowlist, prompt schema, and CONTEXT RULES. smart-casual now covers professional/medical contexts server-side — no manual strip needed.
24. **seasonContextFactor toArray** — `garment.seasons ?? []` and `garment.contexts ?? []` replaced with `toArray()`. Consistent with IDB array safety mandate — ?? [] passes truthy non-arrays.
25. **Dead filterShoesByStrap import removed** — `outfitBuilder.js` was still importing it. `strapShoeScore()` always returns 1.0 since v1.12.12 so it can never filter anything.
26. **SKILL_watch_advisor2.md** — Bumped to v1.12.24, updated garment count, audit date, 3 new gotchas.

### v1.12.25 — Token Cost + Garment Sync (April 13 2026)
27. **push-brief.js buildWeeklyBrief: sonnet→haiku** — Weekly 7-day rotation is structured list gen from explicit inputs; haiku handles it fine. Projected saving: ~$3-4/month (~15% of April spend).
28. **push-brief.js isMonday→isSunday** — Weekly brief was triggering on Western Monday (Tuesday in Jerusalem time). Fixed to use Sunday = Israeli work week start.
29. **+7 garments onboarded** — 4 shirts (Gant Blue/Brown/White Stripe, Kiral Stone Pinstripe, Olive Navy Block Plaid Flannel, White V-Neck Basic Tee), 2 sweaters (Kiral Brown Zippered Cardigan TV70102, Gant Dark Navy Cable Knit), 1 shoe (Blundstone Rustic Brown Chelsea). Total: 100→103.  
30. **Data fix** — Di Porto Navy Orange Plaid Flannel had wrong name/brand (was stored as "Tommy Hilfiger Red Striped Shirt" with brand Di Porto).

### v1.12.31 — Pending Watches + Atelier Wen Perception (April 18 2026)
31. **New `pending:true` watch flag** — parallel to `retired`, excludes from rotation everywhere (engine + UI) without treating as traded. First pending watch: Atelier Wen Perception x Revolution Paris-Beijing N°25/50.
32. **Centralized watch filter** — new `src/utils/watchFilters.js` with `isActiveWatch()` / `activeWatches()` helpers. Single source of truth replacing 19 inline `!w.retired` filter sites.
33. **19 filter points extended** — `!w.retired` → `!w.retired && !w.pending` across `src/engine/dayProfile.js`, `src/engine/weekRotation.js`, `src/domain/{rotationStats,tradeSimulator}.js`, and 13 components (OnCallPlanner, TodayPanel, WatchDashboard, WeekPlanner, Header, StatsPanel, StrapHealth, StrapHeatmap, TradeSimulator, NeglectedWatchNudge, WatchSelector).
34. **Atelier Wen Perception added** — 41mm-ish (39mm dial window), silver-white guilloché dial, integrated bracelet + grey FKM rubber w/ signed deployant, limited N°25/50. Bought by friend in Singapore for SGD 5,000 (~₪11,750). Status: `pending:true` until received. `dial:"silver-white"` chosen over `dial:"silver"` — latter broke colorMaterialDetection test (no DIAL_COLOR_MAP entry for "silver").

### v1.12.32 — Data Integrity + Kiral DB Suit (April 18 2026)
35. **CRITICAL: outfit-photo category trap** — Real garments silently miscategorized as `outfit-photo` are invisible to engine (`category NOT IN ('outfit-photo','watch','outfit-shot')` filter). Found 3 instances:
    - **Pavarotti Navy Pinstripe Suit Trousers** — stored under id `g_20260404_pavarotti_trousers` with name "Navy Suit Mirror Selfie" and category `outfit-photo` since Apr 4 2026. Half of the Pavarotti suit was broken in engine pairings for **14 days**. Recovered: category → `pants`, name → `Navy Pinstripe Suit Trousers`, proper notes.
    - **White V-Neck Basic Tee duplicate** (`g_1775897419_whtee1`) — orphan under outfit-photo. Real entry exists as `g_1776054760_white_vneck` in shirt category. Excluded the orphan.
    - **Tan Textured Knit Pullover orphan** (`g_1773490572693_2ybo2`) — no match to any real garment, no history references, likely leftover from camera-roll import. Excluded.
36. **watch_id canonical form normalized** — `gp-laureato` (1 history entry, Apr 16) vs `laureato` (7 entries) → merged to `laureato`. Single-source history for the GP.
37. **Kiral Navy Double-Breasted Suit acquired** — jacket + trousers added as formality 9 garments. Navy Prince of Wales check (glen plaid), dark tonal engraved buttons, DB peak lapel 6x2. First wear: wedding 17 Apr 2026 with GP Laureato blue (intentional texture match: Clous de Paris hobnail ↔ PoW check grid). Contexts: formal, date-night, eid-celebration, family-event (NOT smart-casual, NOT clinic).
38. **Pattern rhyme pairing principle documented** — Clous de Paris / hobnail dials (GP Laureato, VC Overseas rep) pair by structural grid with PoW check / glen plaid / nailhead / bird's-eye fabrics. Captured in Kiral DB jacket notes field so AI stylist surfaces it. New gotcha added to SKILL_watch_advisor2.md §7.
39. **3 new gotchas documented** — outfit-photo category trap, watch_id canonical form, pattern rhyme pairing. All in SKILL §7.
40. **Wardrobe doc reconciled** — removed duplicate "Kiral Cream Cable Knit Sweater" row, fixed stale footer counts (was 101, now 104), removed orphan "DB active count = 100" line, added Formal/Events + Pairing Principles sections.
41. **Active garment count**: 101 → 104 (+2 new Kiral DB pieces, +1 Pavarotti recovery).

### 2026-04-22 — /audit-fix-deploy § A full cycle

**Audit state snapshot**
- garmentCount=99, historyCount=59, orphanedHistoryCount=0, autoHeal.healthy=true
- 3024/3024 tests pass (175 files), build green (973 ms)
- RLS pass: 0 holes (0 tables with rowsecurity=false among user schemas), 0 zero-policy tables, 9 tables with policies reviewed

**Shipped**
1. **`security: drop public photos-bucket list policy`** (`7583604`) — Supabase advisor flagged `storage.objects` policy `photos_anon_select` (SELECT for anon, `USING bucket_id='photos'`) as allowing anon clients to enumerate the bucket. Dropped via migration `20260422210000_drop_photos_bucket_list_policy.sql`. Bucket stays public, `getPublicUrl()` still works, and `src/services/supabaseStorage.js` only calls `upload`/`getPublicUrl`/`remove`-by-path — never `.list()`. Precedent: same fix applied to Toranot's question-images bucket on 2026-04-21.

**Not auto-applied (held back, explanation below)**
2. **`neverWornRotationPressure` bump** — skill's § A.5 rule *said* "never-worn > 30% → bump +0.05". Current state: 35.4% (35/99). BUT production `netlify/functions/auto-heal.js` uses a stricter guard (>50% AND history-depth-sufficient, `hist.length ≥ active.length × 2` = 198; we have 59 entries). Auto-heal's nightly run correctly held back; I deferred to it. **Resolved same-day**: rewrote the audit-fix-deploy skill's § A.5 to defer to `auto-heal.js` as ground truth and document the actual thresholds there — skill will no longer drive weight tunes from ad-hoc SQL, so this source of drift is gone.
3. **`repetitionPenalty` bump** — skill rule *said* "same garment >3/14d → penalty -0.03". Two garments breached the skill's threshold: `g_belt_tan_daily` (Sarar Cognac belt, 7×/14d) and `g_1773168996440_gk2f4` (Brown Ecco shoes, 4×/14d). **Correction**: the production code already excludes `belt` + `shoes` categories (`DAILY_DRIVER_CATS = new Set(["belt","shoes"])` at `netlify/functions/auto-heal.js:108`), and its threshold is `>5/14d` — the belt at 7× trips the count but hits the category exclusion, the shoes at 4× don't trip the count. Auto-heal correctly logged `garment_stagnation: healthy`. The bug was in the skill's documented rule (`>3`, no category filter), not in the code. **Resolved same-day**: skill § A.5 rewritten to point at auto-heal as source of truth.

**New findings to track**
4. **65% of wear entries have null `score`** — 43 of 66 history rows have `payload.score === null`. The skill captures "score always 7.0" (force-default hint) but the actual data is worse: score is literally missing. Wear-log UI should enforce a numeric score input (or default-to-7 with ✎ affordance to change) before allowing the entry to persist. Distribution of the 23 scored entries is healthy (10:3, 9:3, 8:3, plus 8.0/8.5/8.7/8.2/7.5/7) — so users who do score, score thoughtfully.
5. **`scoring_overrides` is `{}`** — no auto-tunes have ever been persisted. Combined with finding #2, this means either (a) autoheal has never crossed its thresholds, or (b) persistence is broken. Worth verifying: write a known-override manually and confirm bootstrap.js loads it on next app refresh.
6. **Skill vs. code drift in `audit-fix-deploy` SKILL.md** — § A.1 claimed `rotationPressure(Infinity) === 0.7` and never-worn `recencyScore === 0.75`. Code has 0.50 for both since April 2026; repo's own `SKILL_watch_advisor2.md` already documented the lowering. Fixed the audit-fix-deploy skill in this run. Also added Windows-specific vitest invocation (`node node_modules/vitest/vitest.mjs run`) — on Windows, `node_modules/.bin/vitest` is a bash shim Node can't parse.
7. **Dependabot — 5 vulnerabilities (4 high, 1 low) — RESOLVED same-day**. All vulns sat behind `@netlify/plugin-lighthouse@6.0.4 → lighthouse@9.6.8 → puppeteer-core@13.7.0` which pins old `tar-fs@2.1.1` + `ws@8.5.0`. `@netlify/plugin-lighthouse` is actively used (`netlify.toml:49-56`) and 6.0.4 is the latest — upstream chain was stuck. `npm audit fix` (non-forced) left 7 of 8 vulns in place; `--force` would have downgraded the plugin to 2.1.3 (major downgrade). Instead: added a flat `overrides` block to `package.json` forcing `tar-fs ^2.1.4`, `ws ^8.17.1`, `cookie ^0.7.0`. `npm audit` → 0 vulnerabilities. Build + 3024 tests still green.
8. **Madge static cycle** — `services/persistence/historyPersistence.js ↔ stores/historyStore.js`. Runtime-safe (explicit lazy `import()` in both directions documented inline), but madge reports it on every audit. Either add `--exclude` for this specific pair to the skill check, or refactor into a third common module.
9. **CRLF noise in `netlify/functions/_migrations.json`** — `scripts/bundle-migrations.js` on Windows stores SQL strings with `\r\n`-encoded newlines; on Linux CI, clean `\n`. Ping-pongs on every cross-platform commit. Fix: add `.gitattributes` with `netlify/functions/_migrations.json text eol=lf`.
10. **Supabase advisor false-positive baseline (this project)** — 9× `rls_policy_always_true` WARN on `app_settings`, `errors`(INSERT), `garments`×3, `history`×3, `push_subscriptions`. All intentional given the single-user-no-Supabase-Auth architecture; anon *is* the user role. Documented in `~/.claude/projects/C--Users-User/memory/project_watchadvisor2_supabase.md` so future audits stop re-flagging them.

### v1.12.33 — Auto-heal outfit-photo trap guard (April 18 2026)
42. **NEW auto-heal check #9: `outfit_photo_trap`** — closes the class of bug that hid Pavarotti trousers for 14 days. Runs daily at 05:00 UTC via existing cron. Queries garments for `category IN ('outfit-photo','outfit-shot')`, filters out `exclude_from_wardrobe=true` rows, then flags any remaining entry where EITHER:
    - `name` contains a garment-word regex match (`shirt|jacket|trouser|pant|sweater|cardigan|coat|blazer|suit|polo|oxford|pullover|flannel|chino|denim|jean|boot|sneaker|derby|hoodie|tee|dress`), OR
    - `id` does not match the phantom-id pattern `^g_\d{13,}_[a-z0-9]{5,6}$` (i.e. handcrafted IDs like `g_20260404_pavarotti_trousers` fail and get flagged).
    
    When suspicious entries found: reports first 5 in `findings[].found`, action `WARN — N real garment(s) miscategorized as outfit-photo, invisible to engine`, flips `healthy: false`. Does NOT auto-fix (category changes need human review).
43. **Test coverage**: 2 new tests in `tests/autoHeal.test.js` (16 total, was 14) — positive case verifies dual-signal detection (flags Pavarotti handcrafted-id case AND White V-Neck garment-word case, skips phantom IMG/numeric names, skips already-excluded rows); negative case verifies `healthy: true` when outfit-photos are clean. All 16 autoHeal tests pass.
44. **Check count bumped**: auto-heal header comment `7 → 9`. Tests updated: `body.checks` from 8 → 9 (3 locations), findings length from 8 → 9, new `outfit_photo_trap` key added to `toContain` assertions.

### v1.12.35 — Fears Brunswick 38 Champagne added (April 23 2026)
45. **Fears Brunswick added as `pending:true`** — invoice INV-3936 issued 22 Apr 2026 by Fears Watch Co. Ltd. (Bristol, UK). Total £2,500 GBP (~₪11,600). Serial 1919, ref BS23800B, champagne dial, 38mm cushion, 20mm lug, formality 7, style `dress-sport`. Ships to Fish Jaafar, 15 Harper Road #01-01C, Singapore 367678 → forward to Israel as gift. 5-link SS bracelet pre-sized to 160mm + Pewter Grey Barenia leather (OEM complimentary, short).
46. **DIAL_COLOR_MAP extended** — new `"champagne"` key added to `src/data/dialColorMap.js`. Pairs with cream, ecru, beige, tan, camel, brown, cognac, stone, sand, navy, black, charcoal, grey, white, olive, khaki, denim, burgundy, brick. Warm-dial spec aligned with earth-tone wardrobe. 109 colorMaterialDetection tests still green.
47. **Test updates** — `tests/watchSeed.test.js` length assertion bumped 27 → 28; description updated `1 pending → 2 pending`. All 12 watchSeed tests pass.
48. **Seed header comment** — `src/data/watchSeed.js` v11.1 → v11.2, `1 pending → 2 pending`, date Apr 18 → Apr 23.
49. **Aftermarket bracelet order deferred** — Forstner Klip + Beads-of-Rice ($205 total) NOT ordered. Factory 5-link bracelet + complimentary Barenia cover day-one needs. Revisit after 6 months of wear.

### v1.12.40 — Santos Large aftermarket straps (April 29 2026)
50. **Santos Large strap inventory expanded 2 → 4** — added two AliExpress aftermarket alligator-pattern leather straps with steel + gold deployant clasp (Santos-aesthetic, brushed steel exterior + polished gold center plate with two screws):
    - `santos_large-brown-alligator` (color: `brown`, type: `leather`, useCase: smart casual / brown Eccos)
    - `santos_large-blue-alligator` (royal blue; engine color `navy` for outfit pool, label "Royal blue alligator (aftermarket)", dressy / navy outfits)
51. **Engine integration** — both straps inherit standard scoring (no `pending:true` flag, immediately rotation-eligible). 205 targeted tests pass (strapRecommender, strapStore, strapPanel, strapLifecycle, strapLibrary, strapRulesConfig, watchValue, dailyPick, claudePick, sweaterWarmTransition).
52. **Total active straps:** 40 → 42. Watch_Collection_v11-5.md updated (Santos row, total row, header, corrections log).

### v1.12.41 — Santos blue strap reclassified cobalt (April 29 2026)
53. **Color reclassification** — `santos_large-blue-alligator` color changed `navy` → `blue` per Eias correction ("it's clearly cobalt blue"). Label updated `"Royal blue alligator (aftermarket)"` → `"Cobalt blue alligator (aftermarket)"`. UseCase updated from `"Dressy / navy outfits"` → `"Statement / dressy"`.
54. **Engine impact** — strap now pools into `blue` outfit bucket (pairs with grey, white, beige, stone, black, charcoal, blue, khaki, tan, brick, light-blue, camel, yellow, denim) rather than `navy` bucket. Distinct from Reverso/Pasha/Snowflake navy alligators. Avoids tonal mush when paired with navy bottoms.
55. **Lesson logged** — when classifying aftermarket straps, defer to user's eye on saturation. Don't bucket bright cobalt/royal as `navy` for engine convenience.

---

## Scoring Weights (Verified April 11 2026)
| Weight | Value | Status |
|--------|-------|--------|
| colorMatch | 2.5 | Correct |
| formalityMatch | 3.0 | Correct |
| watchCompatibility | 3.0 | Correct |
| weatherLayer | 1.0 | Correct |
| contextFormality | 0.5 | Correct |
| rotationFactor | 0.40 | Correct |
| repetitionPenalty | -0.28 | Correct |
| diversityFactor | -0.12 | Correct |
| seasonMatch | 0.30 | Correct |
| contextMatch | 0.10 | Correct |
| neverWornRecencyScore | 0.50 | Updated (was 0.75) |
| neverWornRotationPressure | 0.50 | Updated (was 0.70) |
| SCORE_CEILING | 30 | Correct |
| strapShoeScore | 1.0 always | DEAD — never re-add |

---

## Remaining TODO

### High Priority
1. **BulkTagger re-run** — 36 shirts now in DB; many missing season/context tags. Run BulkTagger on shirt + sweater categories to improve rotation scoring.
2. **Token cost monitoring** — $11.47 at Apr 13 (projected ~$26/month). buildWeeklyBrief downgraded to haiku (v1.12.25). Monitor post-fix; if still spiking, audit wardrobe-chat usage.
3. ~~**Auto-heal: outfit-photo trap guard**~~ — DONE v1.12.33. Check #9 `outfit_photo_trap` runs daily, flips `healthy: false` on any miscategorized real garment.
4. **Shirt list reconciliation** — DB has 36 shirts, SKILL_wardrobe_v10.md table lists 34. Names drift (`Olive Striped Shirt (Gant)` vs `Gant Olive Striped Shirt`) making audit hard. One-off alignment pass needed.

### Medium Priority
3. **Pasha navy alligator strap** — pending DayDayWatchband delivery. Move to pasha straps when arrived.
4. **Tudor canvas straps** — navy + olive pending. Move to blackbay straps when delivered.
5. ~~**GS Rikka bracelet repair**~~ — DONE. Collar/bushing repaired Apr 13 2026. Titanium bracelet now usable.
6. ~~**SKILL_wardrobe update in repo**~~ — DONE (v10 published in commit 3b28889).

### Low Priority
7. **Scoring weight review** — if shirt stagnation persists after BulkTagger, consider rotationFactor 0.40→0.45 via scoringOverrides.
8. **GP Laureato Infinite Grey** — primary acquisition target (~₪65,000). Preserve resources.

---

## 2026-05-01 Audit Pass — Findings

Run mode: deep audit-fix-deploy cycle (this skill is documentation; auto-heal owns weight tunes).

### Audit clean (no action)
- Madge circular: 1 cycle (`historyPersistence ↔ historyStore`) — deliberate, runtime-broken via dynamic `import()`. Acceptable per § A.1.
- `generateOutfit` source grep: clean (only `generateOutfitCard` for image generation, fine).
- `console.log` in `src/`: all 11 occurrences gated behind `import.meta.env.DEV`.
- `console.log` in `netlify/functions/`: 6 occurrences, all server-side (Netlify logs), not client leak.
- `maxAttempts` in vision functions: all 7 are `maxAttempts: 1` (Netlify 10s hard limit respected).
- `DIAL_COLOR_MAP`: only sourced from `src/data/dialColorMap.js`.
- `SCORE_WEIGHTS`: only sourced from `src/config/scoringWeights.js`.
- Engine invariants verified:
  - `rotationPressure(Infinity) === 0.50` ✓ (`src/domain/rotationStats.js:137` via getOverride default)
  - never-worn `recencyScore === 0.50` ✓ (`src/engine/dayProfile.js:154`, April 2026 lowering present)
  - `rotationFactor` weight `=== 0.40` ✓ (`scoringFactors/rotationFactor.js:8`)
  - `repetitionPenalty === -0.28` ✓ (`domain/contextMemory.js:48`)
  - `_crossSlotCoherence` warm/cool `=== +0.20` ✓ (`outfitBuilder.js:110`)
  - `applyFactors()` actually called in scoring pipeline ✓ (`outfitBuilder.js:156`)
  - `buildOutfit()` pre-filters wearable garments ✓ (`outfitBuilder.js:360-365`)
- Live skill-snapshot: garmentCount=101 (≥75 ✓), orphanedHistoryCount=0 ✓, all `health.*` ok except `autoHeal: WARN` (only signal: `stale_unscored:1` — already self-marked legacy by today's run, transient).

### Fixed
1. **Date-dependent flake in `tests/seasonContextFactor.test.js`** — pre-existing failure on `main` (1 of 3253 tests red). The "summer in spring" adjacent-season assertion expected `-0.15` but got `+0.10` because the source uses `context._transitionSeason ?? transitionSeason()` — a nullish coalesce that lets `null`/`undefined` fall through to live `Date.getMonth()`. In month 4 (May) the transition target is `"summer"`, so the test gained the +0.10 transition bonus instead of the -0.15 adjacent penalty. Switched the helper default from implicit `null` to a sentinel string `"__none__"` so the assertion is calendar-month independent.

### Test expansion (`tests/auditExpansion2026May.test.js`, +29 tests)
Targeting under-tested high-risk surfaces:
- `utilizationScore` — zero direct unit coverage prior; 9 tests for empty/null collections, 100%/0%/rounded buckets, ghost ids, dedupe, falsy watchId.
- `_crossSlotCoherence` boundaries via `buildOutfit` — 4 tests covering -0.4 same-color penalty, +0.20 warm/cool contrast, +0.10 neutral, single-slot degenerate.
- `rotationPressure` × override propagation — 4 tests for never-worn override, finite-idle isolation, non-numeric rejection, legitimate-zero floor.
- `garmentDaysIdle` on degenerate post-migration history shapes — 7 tests for mixed root/payload shapes, malformed dates, empty arrays, root-precedence, watch-vs-garment key isolation.
- Auto-heal `never_worn` history-depth guard — 3 tests for sparse-data suppression, sufficient-data tune, 0.90 cap.
- Auto-heal `_history` ringbuffer trim — 1 test verifying 20-event window maintained on tune.

Test count: 3252 → 3281 (+29). Build green (922ms).

### Non-auto items (per § A.5 — surface only, do not tune)
- `autoHeal.findings.score_distribution` = "6.5–10": healthy spread, no action.
- `autoHeal.findings.context_distribution` = healthy.
- `autoHeal.findings.untagged_garments` = 0: BulkTagger already run.
- `autoHeal.findings.outfit_photo_trap` = healthy.
- `autoHeal.findings.never_worn` = "26% (65 entries / sparse data)": below 50% threshold AND sparse-depth guard would suppress anyway. Fine.
- `scoring_overrides`: empty `{}` after months of history. Reading `auto_heal_log.tuned: []` confirms no tune has fired in this lookback window — consistent with healthy `tuned: []` in last 9-check run. Not a persistence bug.

### Carry forward
- **Supabase MCP RLS sanity pass** could not run in this session — interactive OAuth flow is not callable from a non-interactive run. Live skill-snapshot health channel was used as a proxy (orphans, garment count, health.*). Run the four pg_tables/pg_policies queries manually next session, or via direct `psql` with service-role key.
- **Hard-coded `vi.mock("@supabase/supabase-js")`** inside `describe` block in the new test file produces a vitest hoisting warning but executes correctly. Future cleanup: lift to module top-level alongside the other mocks for warning-free runs.

---

## 2026-05-01 Round 2 Audit Pass — Deeper Dig

### R1 open items — resolution

1. **`autoHeal: WARN (stale_unscored:1)`** — root-caused, NOT a real data issue. Source: `auto-heal.js:240` defines healthy as `action ∈ {none, stamped, minor, auto-tuned*}`. The `stale_unscored` check uses `marked_legacy` action when it self-fixes, which is NOT in the healthy whitelist. So once auto-heal stamps the row legacy, the next run finds 0 stale → reports `none` → healthy. The row in question is a single legacy unscored entry that exists on a 3-day-old timestamp — auto-heal already self-marked it; the WARN bit was a one-cycle artifact. Verified by re-querying via skill-snapshot (still shows the same finding because skill-snapshot caches the LAST auto_heal_log row, which was the run that marked the row). Next 05:00 UTC cron run will flip it green. No row backfill needed; auto-heal is self-healing.

2. **Supabase RLS sanity pass** — STILL BLOCKED on interactive OAuth. Supabase MCP requires browser auth flow (https://api.supabase.com/v1/oauth/authorize?...) which cannot be completed from a non-interactive session. Documented; auto-memory baseline (9 intentional `rls_policy_always_true` lints, photos bucket list policy already dropped) remains the trusted reference until human runs the queries. Captured query SQL in skill § COMMON SKELETON RLS sanity pass block — they're ready to paste into the SQL editor.

3. **`_transitionSeason` flake root cause** — verified `?? Date.getMonth()` is intentional live behavior, NOT a bug. `seasonContextFactor.js:67` uses `context._transitionSeason ?? transitionSeason()` so production code falls back to live month when no override is provided. The R1 sentinel-string injection (`"__none__"`) is the correct test pattern — a refactored signature would risk live behavior. Documented as a deliberate design choice. No source change.

### R2 deeper audit — findings

#### Vision-function `maxAttempts:1` violations (skill § A.6 hard constraint)

Static analysis caught **two violations**:
- `netlify/functions/extract-outfit.js:104` — vision function (image source blocks) calling `callClaude` without `{ maxAttempts: 1 }`. Default is 3 retries × ~2-8s delay per attempt → can blow Netlify 10s hard limit on 529/503.
- `netlify/functions/detect-duplicate.js:42` — same violation. Compares two image base64 sources via Claude Haiku.

**Fixed both** by adding `, { maxAttempts: 1 }` to each `callClaude` call. New regression net (`tests/auditExpansion2026MayRound2.test.js` block 2) does static read of `netlify/functions/*.js` and asserts every vision file passes `maxAttempts:1` AND no other function ever sets `maxAttempts: ≥2`. This catches future regressions at unit-test time.

#### Bundle baseline (May 2026)

| Chunk | Raw | Gzipped |
|-------|-----|---------|
| `index-BxE2j8eR.js` | 208 kB | 60.6 kB |
| `vendor-supabase-CgvU8WD9.js` | 171 kB | 45.5 kB |
| `vendor-react-x4-XjnM8.js` | 134 kB | 43.1 kB |
| `WeekPlanner-C9Hw5fzk.js` | 49 kB | 14.5 kB |
| `WardrobeGrid-Th8TcCdk.js` | 44 kB | 13.2 kB |
| `AuditPanel-D6DylxOM.js` | 44 kB | 12.8 kB |

Total ≈ 570 kB raw / 167 kB gzip — matches CLAUDE.md target. No regression from R1.

#### Dependencies

`npm outdated` (12 packages outdated, all minor/major):

| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| `react`, `react-dom` | 18.3.1 | 19.2.5 | Major — defer (would break createElement patterns + plugin-react) |
| `vite` | 7.3.2 | 8.0.10 | Major — defer (rollup transitive churn) |
| `@vitejs/plugin-react` | 5.1.4 | 6.0.1 | Major — couples to React 19 |
| `vitest` | 4.1.4 | 4.1.5 | Patch — safe |
| `@supabase/supabase-js` | 2.98.0 | 2.105.1 | Minor — safe but defer to single coordinated bump |
| `@netlify/blobs` | 10.7.0 | 10.7.4 | Patch — safe |
| `jsdom` | 28.1.0 | 29.1.1 | Major |
| `react-window` | 1.8.11 | 2.2.7 | Major |
| `zustand` | 4.5.7 | 5.0.12 | Major |

`npm audit`: **3 moderate severity** vulnerabilities, all transitive via `uuid <14.0.0` (consumed by `@netlify/blobs > @netlify/dev-utils`). Fix would require `npm audit fix --force` → bumps `@netlify/blobs` to a breaking 8.2.0. Not auto-fixed; the existing `overrides` block in package.json (tar-fs, ws, cookie) does not cover uuid. **Decision**: leave for now — `@netlify/blobs` is dev-only (devDependencies), the vulnerable code path is the buffer-bounds-check on `uuid.v3/v5/v6` with caller-provided buffer arg, which is not how Netlify dev-utils invokes it. R3 candidate: add `"uuid": "^14"` to overrides block once @netlify/blobs supports it.

#### Auto-heal threshold table — VERIFIED accurate against `auto-heal.js`

| Check | Threshold | Source line | Auto-tune |
|-------|-----------|-------------|-----------|
| watch_stagnation | one watch >40% of last 10 wears | L:90 (`> 0.4`) | `+0.05` cap 0.60 |
| garment_stagnation | one garment >5× in 14d, EXCLUDING belt+shoes | L:117 (`> 5`) | `-0.03` cap -0.40 |
| never_worn | >50% never worn AND history.length ≥ active.length × 2 | L:181 | `+0.05` cap 0.90 |
| score_distribution | flagged only — `> 5` scores AND `Set.size === 1` | L:159 | none — UI fix |
| context_distribution | `> 80%` null context | L:133 (`nullPct > 80`) | none — UI fix |
| untagged_garments | `> 10` rows missing material/seasons | L:154 (`> 10`) | none — BulkTagger |
| outfit_photo_trap | garment-word in name OR non-phantom-id pattern | L:206 | none — recategorize |

Skill § A.5 table matches. No drift detected.

#### Coverage gaps surfaced (R3+ candidates)

- `src/services/supabaseSync.js`, `src/services/supabaseAuth.js` — light test density relative to LOC.
- `src/features/wardrobe/classifier.js` — 1 file, 500+ LOC; touched by `classifier.test.js` but boundary cases (e.g., `topF < 0.15 && topNB < 12 && midF+botF > 0.85`) need explicit unit pinning.
- `src/aiStylist/claudeStylist.js` — single test (`claudeStylist.test.js`); error-path coverage missing.
- Service-worker integration tests — flagged as known gap in CLAUDE.md "Recommended Additions".

### R2 test expansion (`tests/auditExpansion2026MayRound2.test.js`, +49 tests)

Targeting different surfaces than R1:

- **Auto-heal threshold matrix gaps** (12 tests): belt/shoes daily-driver exclusion, score_distribution allSame WARN, context_distribution >80% null, score_distribution range string, watch/garment auto-tune cap-respect, untagged_garments boundary at 10/11.
- **Vision `maxAttempts:1` static enforcement** (8 tests): static-read each vision function file + sweep every netlify function for `maxAttempts: [2-9]`. CAUGHT extract-outfit + detect-duplicate violations during this run; both now fixed.
- **Skill-snapshot health.* contract** (8 tests): `health.{garments,history,orphanedHistory,wardrobeHealth,autoHeal}` keys present; orphan WARN flips correctly; pinned IDs (oaojkanozbfpofbewtfq + 4d21d73c-…); 405 on non-GET; scoringWeights mirror config.
- **Persistence migration round-trip** (5 tests): v1 root-level `garmentIds` and v2 `payload.garmentIds` shapes both readable; `??` operator semantics pinned (root precedence, empty array does not fall through).
- **Mutation-resistant boundaries** (16 tests):
  - `rotationFactor`: never-worn = 0.20 exact, defensive null guards, override scaling factor 1.5×, midpoint=14 logistic centre.
  - `repetitionPenalty`: `< 0` strictly (not `<=0`) — 0 diversityBonus must apply -0.28; MEMORY_WINDOW=5 boundary; defensive null.
  - `_crossSlotCoherence` via buildOutfit: -0.4 same-color penalty bites (pants avoids navy when shirt is navy); warm/cool tone closure (tan + navy contrast lands); neutral baseline.

Test count: 3281 → 3330 (+49). Build green (908ms). New file uses Node `node:fs` static-read for vision-function audit — one-shot at test run, no runtime cost.

### Bundle size + dependencies — recap

- Bundle: ≈570 kB raw, 167 kB gzip — flat from R1.
- Outdated: 12 packages, 8 majors deferred, 1 patch (vitest 4.1.4→4.1.5) safe to bump in R3.
- Audit: 3 moderate uuid deps, dev-only path; defer pending `@netlify/blobs` major.

### Open R3+ candidates

1. **uuid override** — wait for `@netlify/blobs` v11 with non-breaking uuid bump, then add `"uuid": "^14"` to `overrides` to clear the audit warnings.
2. **Vitest 4.1.4 → 4.1.5** — patch-level, safe; bump in R3.
3. **Hoist `vi.mock` calls in audit-expansion test files to module top-level** — vitest 5 will hard-error on the current pattern.
4. **Coverage threshold** — R1 noted `vitest run --coverage` is set up but no minimum gate enforced. Add `coverage.lines >= 60` in `vite.config.js` once known-untested branches are filled in.
5. **Service-worker integration tests** — single largest known gap; CLAUDE.md tracks as "Recommended Addition #2".
6. **Supabase RLS pass via direct `psql`** — write a `scripts/rls-audit.sh` that uses service-role key from env to run the four queries from skill § RLS, so the audit is automated rather than blocked on MCP OAuth.
