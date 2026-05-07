# Auto-Generated Improvement Proposals
Generated: 2026-04-23 (cumulative)
Last updated: 2026-05-07 — v1.13.17 different-watch prompt drift + orphaned reasoning + style-dna auth

## v1.13.17 — 2026-05-07 different-watch prompt drift, orphaned reasoning, style-dna auth

Triggered by an in-app debug bundle (`wa2-debug-2026-05-07-1408.json`) plus two screenshots showing **Tudor BB41 displayed alongside reasoning text about the GP Laureato** ("The GP Laureato's blue integrated dial complements the olive shirt without competing—a..."). Four real bugs in one trace; one cosmetic noise channel deferred.

### Bugs shipped

- **#1 `daily-pick.js` watchId enum drifted from canonical seed IDs** (`netlify/functions/daily-pick.js`) — the system prompt (line 120) and user prompt (line 443) both told Claude to pick from `gp_laureato | ap_royal_oak | gmt_master | chopard_alpine | santos_35_rep | daydate_turq | rolex_op_grape | breguet_tradition | ...`. Real seed IDs: `laureato`, `royal_oak`, `gmt`, `alpine_eagle`, `santos_35`, `daydate`, `op_grape`. Claude faithfully echoed the wrong tokens, the validator (`validateDifferentWatchPick`) rejected every Different-watch reply, and the user saw the rotation fallback watch glued to AI prose written about a watch that was never applied. Fix: replaced both enums with canonical IDs from `watchSeed.js`. Locked down with `tests/dailyPickPromptWatchEnum.test.js` — 13 assertions that read the source, parse every enum, and check (a) every legacy id is gone, (b) every active seed id is present in both enums, (c) pending watches are not exposed to the model, (d) the two enums match each other.

- **#2 Orphaned reasoning + strap + garment overrides on watch rejection** (`src/components/WeekPlanner.jsx`) — when `validateDifferentWatchPick` returned `!ok` in Different-watch mode, the code logged the warning but kept executing: it applied the (partial) garment overrides, applied the strap suggestion, set `aiRationale[date] = pick.reasoning`. The reasoning was written ABOUT the rejected watch ("the GP Laureato's blue dial complements..."); the user's previous watch (Tudor BB41) was preserved. Result: visible mismatch. Fix: when the validator fails in Different-watch mode, surface as `aiErrorByDay` and early-return before any state mutation. The user gets an actionable error ("AI suggested a watch not in your collection (gp_laureato). Try again.") instead of a silently broken UI.

- **#3 Brand-prefix-strip fallback in `validateDifferentWatchPick`** (`src/utils/aiPickResolver.js`) — defense in depth. Anthropic's prompt cache holds responses for ~5 min, and Claude's training has strong "brand-prefix watch references" instincts regardless of prompt instructions. The validator now strips ONE recognized brand token + underscore (`gp_`, `ap_`, `chopard_`, `rolex_`, etc.) and retries the match before rejecting. Recursion is intentionally not enabled — `gp_ap_laureato` should not resolve, only one layer is stripped. Unknown prefixes are NOT stripped (prevents `weird_blackbay` → `blackbay` false matches). 10 new tests in `tests/aiPickResolver.test.js` covering exact-match wins, case-insensitive prefix, unknown-prefix rejection, single-strip-only, and active-filter respected after strip.

- **#4 `style-dna` 401: Bearer token missing** (`src/components/stats/StyleDNA.jsx`) — the StyleDNA card on the Stats panel used raw `fetch()` instead of `authedFetch()`, so the Supabase Auth JWT was never attached. Server-side `_auth.js` correctly returned 401, the card showed "Sign in to unlock Style DNA" even when the user WAS signed in. Fix: swapped both `fetch` calls (GET initial load + POST forceRefresh) to `authedFetch`. While auditing, found the same latent bug in `src/services/pushService.js#subscribePush` (POST became auth-gated in v1.13.16; the client wasn't updated). Fixed in the same patch. DELETE in `pushService.js` left as raw `fetch` — server does not auth-gate that path.

- **#5 Garment hallucination "navy pants" / "brown belt" / "stone jacket"** (`netlify/functions/daily-pick.js`) — partially mitigated. The AI was returning shortened category+color names ("navy pants") instead of the full wardrobe entries, so the resolver fell back to engine pick for those slots. Hardened the prompt instruction in front of the WARDROBE block: "copy the garment NAME (the part before the first `(`) VERBATIM. Do not abbreviate ('navy pants' or 'olive shirt' will NOT match). Do not invent items not in this list." Resolver still degrades gracefully (engine pick) when the AI ignores the instruction; logging via `unmatched` array preserved.

### Deferred

- **`ErrorBoundary` empty-object errors** logged twice on app boot (`[ErrorBoundary] {} {"componentStack":"..."}`). The minified component name `ds` doesn't survive without prod source maps. Likely a non-Error throw somewhere in the render tree; impact is cosmetic (wrapped boundary catches it). Adding a source-map-uploaded production diagnostic build is the right next step.

### Files touched

```
netlify/functions/daily-pick.js   |  +5 -3   (two enum replacements + verbatim-name reminder)
src/components/WeekPlanner.jsx    |  +13 -1  (full-rejection on validator fail)
src/components/stats/StyleDNA.jsx |  +2 -2   (authedFetch import + two call sites)
src/services/pushService.js       |  +3 -1   (authedFetch import + POST call site)
src/utils/aiPickResolver.js       |  +44 -8  (BRAND_PREFIXES + tryMatch + strip fallback)
tests/aiPickResolver.test.js      |  +96     (10 new brand-prefix-strip cases)
tests/dailyPickPromptWatchEnum.test.js | +112 (NEW: 13 regression-guard tests)
package.json                      |  +1 -1   (1.13.16 → 1.13.17)
```

### Why this matters

These weren't "AI being unreliable." Bugs #1 and #4 were our own infrastructure handing the model bad inputs and our own UI not authenticating itself. Bug #2 was UI logic continuing past a hard validation failure. The model-side flakiness (bug #3, #5) is real and gets defense-in-depth treatment, but the bulk of the user-visible breakage came from us.

## v1.13.16 — 2026-05-06 close last open POST + storage RLS for signed-in role

Follow-up to v1.13.15. While auditing the auth surface during the storage RLS investigation, two additional gaps surfaced that v1.13.15 didn't touch:

### Bugs shipped

- **#1 `push-subscribe` POST was unauthenticated** (`netlify/functions/push-subscribe.js`) — the only browser-callable function still missing `requireUser()`. Anyone with the function URL could register a push endpoint and start receiving the user's daily outfit briefs. DELETE was already gated via `x-api-secret`; now POST is gated by Supabase JWT + email allowlist matching the rest of the API surface. Coverage: 11 tests in `tests/pushSubscribe.test.js`, including explicit 401 (missing JWT) and 403 (valid JWT but wrong allowlist) paths to prevent regression.

- **#2 `storage.objects` had only `anon`-role policies** (`supabase/migrations/20260506050100_storage_authenticated_role_email_gated.sql`) — latent issue masked by no one being signed in yet. Once the auth gate (v1.13.7) had a user actually authenticated, the supabase-js client switches from `anon` to `authenticated` role, and every photo write would fail RLS because no `authenticated` policies existed on the photos bucket. Added four `authenticated`-role policies (SELECT/INSERT/UPDATE/DELETE) gated by `auth.jwt()->>'email' = 'eiasashhab@gmail.com'`, matching the email-restriction pattern from `20260504052807_rls_email_restricted.sql` for `garments` + `history`.

### Defense-in-depth posture

The same email allowlist is now enforced at three layers — Netlify functions (`ALLOWED_USER_EMAIL` env var), `public.garments`/`public.history` RLS, and `storage.objects` RLS. A single misconfig (env var typo, accidental policy widening, function bypass) can't expose the data. **If you ever rotate the allowlist email, update both `20260504052807` and `20260506050100` together** — the literal is hard-coded in both for defense reasons; keeping them in sync is a manual checklist item.

### Open items

- `github-pat.js` uses a separate `x-api-secret`/`OPEN_API_KEY` scheme (legitimate — it's for Claude Code session pushes, not browser callers). Unified auth across both schemes is out of scope.
- Storage policies still allow anon ops (graceful degradation if a session signs out mid-flow). PostgreSQL RLS evaluates per role, so the parallel anon/authenticated policy sets don't widen each other.

## v1.13.15 — 2026-05-06 storage RLS upsert fix + skill corrections

While logging today's wear (Snowflake on titanium bracelet, light blue Gant cable knit) and uploading the outfit photos to Supabase Storage, raw curl + supabase-js client both returned `403 "new row violates RLS policy"` for any `upsert: true` upload — even on brand-new paths. Investigation traced this to migration `20260422210000_drop_photos_bucket_list_policy.sql`, which dropped `photos_anon_select` to block bucket enumeration. Side effect not noticed at the time:

- **`uploadPhoto({ upsert: true })`** in `src/services/supabaseStorage.js` failed for both new and existing paths. Supabase Storage's UPSERT path issues an internal SELECT to decide INSERT vs UPDATE; with no anon SELECT policy, that internal SELECT returns nothing → server treats the write as a UPDATE → "new row violates RLS" because `with_check` rejects.
- **`deleteStoragePhoto()`** silently leaked orphans. `.remove()` returned `{ data: [], error: null }` (success!) while affecting zero rows in `storage.objects`. Verified by uploading 3 test files, calling remove, and confirming via SQL that all 3 were still present.

This was real prod breakage since 2026-04-22 — every garment thumbnail re-upload or deletion was a no-op for any non-authenticated session (which is the default browser session in this app).

### Bugs shipped in v1.13.15

- **#1 Restored anon SELECT on photos bucket** (`supabase/migrations/20260506050000_restore_photos_anon_select_for_upsert.sql`) — re-creates `photos_anon_select` policy with `USING (bucket_id = 'photos')`. Trade-off accepted: re-enables `.list()` enumeration on the bucket, but every file is already reachable via `getPublicUrl` (paths are deterministic — `garments/{id}/...` and `wear/{id}/...`) and there are no secrets in this single-user app. Functional correctness wins over marginal obscurity. Verified post-migration: upsert on new path ✅, upsert overwriting existing ✅, remove ✅.

- **#2 SKILL `app_settings` correction** — earlier skill versions claimed `app_settings` was legacy and to use `app_config`. Wrong. `app_settings` is actively used for the per-watch active-strap selection (`id='default'`, `active_straps` JSONB keyed by short watch_id). Updated the table.

- **#3 SKILL skill-snapshot auth correction** — earlier skill versions said `skill-snapshot` had no auth. After the 2026-05-04 email-restricted RLS migration, the function now 401s on missing/invalid Bearer token. Updated the quick-reference to show the correct curl invocation.

- **#4 Storage RLS gotcha documented** — added a new row to §7 Key Gotchas warning future Claude not to drop `photos_anon_select` again without first refactoring `uploadPhoto`/`deleteStoragePhoto` to never depend on UPSERT or row-level DELETE.

### Wear logged

History entry `wear-2026-05-06-snowflake` written to Supabase: GS Snowflake SBGA211 on titanium bracelet, Gant Light Blue Cable Knit + Kiral Navy Slim Fit Chinos + Geox Cognac Lace-Up Boot, work context, score 7.5, weight 7. Outfit + wrist photos uploaded to `wear/wear-2026-05-06-snowflake/full.jpg` and `wrist.jpg`.

### Open items

- The fix is asymmetric: `garments` and `history` tables are email-restricted, but `storage.objects` for the `photos` bucket is anon-permissive (insert/update/delete/select). If the threat model wants storage parity, the photo policies should also gate on `auth.jwt()->>'email'` — but that requires the app to authenticate (not just use anon JWT for the publishable client). Out of scope here. Flagging.

## v1.13.7 — 2026-05-05 supabase embed + weather context

User asked: "embed the supabase credentials to the user login and make the weather adjustment clothing real" + "it doesn't look factual or updated the weather in the app and I want context ie if I pickup outfit for work hours adjust for those if evening fir use evening weather".

- **#8 Supabase creds embedded** — `src/services/supabaseClient.js` had `https://example.supabase.co` / `public-anon-key` as dummy fallbacks; if `VITE_SUPABASE_*` env vars were missing the app silently bound to a non-existent project. Replaced fallbacks with the real watch-advisor2 project URL `https://oaojkanozbfpofbewtfq.supabase.co` and the public anon JWT (already shipped in the live bundle, RLS enforces access). Pattern matches ward-helper's `src/storage/cloud.ts`. Forks override via `.env.production`.
- **#9 Dead Settings UI removed** — `SettingsPanel.jsx` had a "Cloud Sync (Supabase)" section asking users to enter URL + Anon Key, stored to `localStorage` keys `wa-supabase-url` / `wa-supabase-key` — but `supabaseClient.js` ONLY reads `import.meta.env.VITE_*` and ignores localStorage entirely. The inputs went to the void. Removed the section, the unused state, and the now-dead `handleSaveLogin` callback.
- **#10 Weather thresholds realigned with engine reality** (`src/weather/weatherService.js:120`) — old 4-tier `getLayerRecommendation` (10/16/22) drifted from the engine's actual behavior in `outfitBuilder.js` (`_fillSweaterLayer` <22, `_fillJacket` <22, second layer <12). At 18°C the user read "Light layer recommended" while the engine added a heavy sweater + jacket — display ≠ outfit. Realigned to 3 tiers matching engine: `<12` coat (sweater + jacket + extra), `<22` sweater + jacket, `≥22` none. Updated `getLayerTransition` to match. Two test files updated (10 assertions adjusted).
- **#11 Context-driven weather (`pickContextualTemp`)** — new helper picks tempMorning vs tempMidday vs tempEvening based on day's context. Wired into BOTH the engine path (`weekOutfits` useMemo line ~1132) and the AI path (`handleAskClaude` line ~1363). `date-night`/`family-event`/`eid-celebration` now use evening temp; `casual` uses midday; default (`smart-casual`/`shift`/null) uses morning. So a Date Night plan with morning 22°C / evening 11°C gets a coat in the outfit, not a tee. Falls back through Morning → Midday → Evening → tempC for partial forecasts.
- **#12 Forecast freshness UX** — `WeekPlanner` now tracks `forecastTs` in state and shows "Weather: 5m ago" + a `↻ Refresh` button next to the "7-Day Rotation" header. The button bypasses the 1-hour cache and hits Open-Meteo. Fixes "doesn't look factual or updated" — the user can see live data age and force-refresh.

Tests: 3549 passing (+3 from `pickContextualTemp.test.js`). Build green, bundle 209.89 kB / 61.61 gz (negligible delta). Engine threshold drift is fixed forever.

## v1.13.6 — 2026-05-05 race fix (follow-up to v1.13.5)

A fourth deep-audit subagent surfaced two more lost-update races in the same family that v1.13.4's `5eae24f` fixed for `localCache.js` + `settingsPersistence.js`. The pattern was already documented in `localCache.setCachedState()`'s comment, but two stores hadn't been migrated yet.

- **#6 styleLearnStore lost-update race** (`src/stores/styleLearnStore.js:31–32, 44–45`) — `hydrate()` and `recordWear()` did `getCachedState().then(cached => setCachedState({ ...cached, styleLearning }))`. The read+merge ran in one microtask, the write in another, so two concurrent calls (e.g. user logs two outfits in fast succession) both read the same `cached` and the second `setCachedState` dropped the first's update. `setCachedState` is already atomic + merging since v1.13.4, so the explicit get-then-set chain was BOTH redundant AND racy. Replaced with `setCachedState({ styleLearning: profile })` directly.
- **#7 rejectStore lost-update race** (`src/stores/rejectStore.js:30–31, 47–48`) — same pattern in `addRejection()` and `clearAll()`. Same fix.
- Removed the now-unused `getCachedState` import from `styleLearnStore.js`.

Tests still 3546 passed (198 files) — no regression.

## v1.13.5 — 2026-05-05 deep audit-fix-deploy

User report: "https://watch-advisor2.netlify.app/# find bugs deeeeeeeeeeeep audit fix deploy main auto" + screenshots showing literal `🗑` text in Reset App Data buttons + DEBUG CONSOLE showing two `[style-fixed-watch] HTTP 400` errors with `[WeekPlanner] AI pick failed: 400` warnings. Followup: "AI ask claude not responsive when i ask for different watch or choose different sweater etc it doesnt recalibrate the rest of outfit vice versa and idk what to click ask claude or shuffle or reset confusing".

### Bugs shipped in v1.13.5
- **#1 Encoding** (`SettingsPanel.jsx:293,322,360`) — JSX text/attribute strings written as JS escape syntax (`🗑`, `—`) which JSX does NOT parse, so source-as-bytes "\\ud83d\\uddd1" rendered literally as text in the UI. Replaced with actual UTF-8 emoji codepoints (🗑️, 🔄, —, 🪲). One-shot helper `scripts/fix-jsx-emoji-escapes.mjs` left in repo for any future occurrences.
- **#2 WeekPlanner endpoint routing** (`WeekPlanner.jsx:~1442–1454`) — body conditionally omitted `pinnedWatch` (when `isDifferentWatchMode === true` or `pinnedWatch === null`) but the URL was hardcoded to `/.netlify/functions/style-fixed-watch`, which 400s when `pinnedWatch.id` missing. Both branches now route to `/.netlify/functions/daily-pick` when not sending a pin. New `sendingPin` flag is the single source of truth gating both URL and body shape; structural mismatch guard at line 1475 now uses the same flag so they cannot drift again. Regression test: `tests/weekPlannerEndpointRouting.test.js`.
- **#3 daily-pick.js cache mismatch** (`daily-pick.js:644`) — `skipCache = !!steer || excludeRecent.length>0 || !!rejected || variants>1` was a STRICT SUBSET of `forceRefresh = body.forceRefresh===true || ...|| pastCorrections.length>0 || why ||...`. Callers sending `forceRefresh:true` (every WeekPlanner Ask Claude) skipped the legacy 4h cache at line 543 but still HIT the input-hash cache — returning stale picks for up to 4h. Unified by setting `skipCache = forceRefresh`. This was the second half of "AI feels stale".
- **#4 Auto-refit on garment override** (`WeekPlanner.jsx:~1611–1634`) — auto-refit useEffect drift-checked only `(watchId, strapId)` against `aiContextRef.current[date]`; user changing a sweater via "Different one" or manual swap did nothing because `outfitOverrides` wasn't in deps and there was no garment fingerprint. Added `outfitFingerprintFor()` helper, included `outfitOverrides` in deps, recorded `outfitFingerprint` in `aiContextRef` at end of `handleAskClaude` (sync write before any subsequent render so Claude's response doesn't re-trigger us). Caveat: this fixes "rest of outfit recalibrates when I pick a sweater" structurally, but Claude's prompt still does not honor a `pinnedSlots` shape — see Open Items below.
- **#5 SW caches style-fixed-watch errors** (`public/sw.js:19`) — `style-fixed-watch` was missing from `NO_CACHE_FUNCTIONS`, so transient 400s/5xx responses cached for up to 4h and replayed. Without this fix, even after #2 ships, the SW would keep serving the old 400 response for the same date until cache expires. Added.

### Open items — surface to follow-up sessions

- **Bug #3c — UX confusion (button purposes)**: User reported "idk what to click ask claude or shuffle or reset confusing." UI audit produced an inventory of 13 buttons in the planner row; recommendation: consolidate AI refinement chips into a single "Ask Claude" primary with a dropdown for steers (different watch, more casual, more formal, why, 👎). Relabel "Shuffle" → "Next combo (this watch)". Add subtitle to "Reset" → "(your picks only)". This is a UX-design pass, not a bug fix — wants `brainstorming` skill to scope.
- **Prompt gap — `pinnedSlots` mechanism**: The daily-pick prompt accepts `pinnedWatch` but has no analogous block for user-pinned garments. To make Bug #4 fully effective ("user picks sweater → other slots refit AROUND it, not refit the sweater too"), the prompt needs a `CURRENT-DAY USER PICKS (pinned — refit other slots around these)` block analogous to `PINNED WATCH`. Server-side change: extend `buildUserPrompt()` to accept `currentDayOverrides`, append a pin block, instruct model to honor it. Client-side change: WeekPlanner sends `outfitOverrides[date]` mapped to garment names. Estimated 30 LOC.
- **Touch-target compliance**: ~40% of WeekPlanner buttons are below the CLAUDE.md-required 44px minimum (chips at 20px, context buttons 24–34px). Bump padding once, retest mobile.
- **Accessibility**: Icon-only buttons (`×`, `‹`, `›`, `A`/`B` strap toggles) lack aria-labels — screen readers can't distinguish purpose.
- **`auto-heal.js:13` VITE fallback**: Initially flagged by audit; verified intentional (Netlify exposes VITE_ vars to functions, fallback is belt-and-suspenders). Documented here so future audits don't re-flag.
- **`outfitBuilder.js:181` magic 0.60 divisor**: Documented as the span of the coherence range (-0.40 to +0.20). Code-quality refactor opportunity (extract `COHERENCE_SPAN` const), not a bug.
- **Unstaged migrations**: `netlify/functions/_migrations.json` has two locally-drafted RLS migrations (`20260503222400_extend_rls_to_authenticated`, `20260504052807_rls_email_restricted`) that are NOT in any branch. They're cross-session work from a different effort and were intentionally NOT committed in this run. Must land in a dedicated PR with the corresponding `_auth.js` allowlist verification.

## Current State
- **Version**: 1.13.7
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

---

## Session: May 3 2026 — Summer Wardrobe Audit + Photo Upload

### Current State (v1.12.42)
- **Garments**: 114 active (101 existing + 13 new summer pieces added 2026-05-03)
- **Tests**: 55 files, all passing — zero failures
- **Engine integrity**: All invariants confirmed PASS:
  - `generateOutfit()` legacy: CLEAN (generateOutfitCard ≠ legacy engine) ✅
  - Vision functions: all `maxAttempts: 1` ✅
  - Warm/cool coherence: +0.20 ✅
  - repetitionPenalty: −0.28 ✅
  - neverWornRotationPressure: 0.50 (April 2026 update) ✅
  - contextFormality: 0.5 (reduced from 1.5 — rigid context buckets fix) ✅
- **autoHeal**: Ran 5am UTC, found/fixed 1 stale unscored entry (today's wear before score set). Will be clean on next cron. Not a code bug.
- **AI audit**: ai-audit endpoint responding correctly ✅
- **Photos**: 13 new garments had null photo_url — all uploaded to Supabase Storage via service key ✅

### New Garments Added (2026-05-03)
Summer SS poloshirts and tees confirmed fit and added to DB with photos:
1. Blend BHELWOOD Navy Polo Cream Tipping
2. Pierre Cardin Cobalt Blue Polo (loose fit flagged)
3. Tommy Hilfiger Cobalt Blue Tee
4. Blend Mustard Polo Cream Tipping
5. Nautica Salmon Performance Polo
6. Max White Linen Shirt
7. Timberland Ecru Polo
8. Greg Norman Light Blue Polo
9. Tommy Hilfiger Olive Tee
10. Tommy Hilfiger White Polo Navy/Red Tipping
11. Lee Cooper Plain Navy Tee
12. Fox Black Polo
13. Lee Cooper Epic Stillness Navy Graphic Tee

### Documentation Drift Notes (no code fix needed — values are CORRECT in code)
- SKILL.md §1 "Last audited": stale (was 2026-03-21, skill version 1.5.4 vs app v1.12.42)
- SKILL.md §6 garmentCount: stale (was 75, now 114)
- SKILL.md scoringWeights table: contextFormality listed as 1.5 in formula — correct value is 0.5 (intentional reduction, documented in scoringWeights.js comment)
- neverWornRotationPressure: SKILL.md says 0.70 in watch rotation table, actual is 0.50 (April 2026 update — matches memory)

### RLS Pass: CLEAN
No schema changes this session — upload used service role key directly. No new migrations.


---

## Session: May 5 2026 — Version Resync + 30-Commit Catch-Up Bump (v1.13.0)

### Why a minor bump
30 commits accumulated on top of `v1.12.42` without a version bump. Substantive enough to warrant a minor — not a patch — release:

1. **Security hard-gate (PR #138–#140, #148)** — Supabase JWT auth gate applied to all 17 Netlify functions + 14 frontend callers. RLS policies tightened to single owner email. Effectively breaking change for any anonymous caller.
2. **Fail-closed prod auth (PR #144)** — `skill-snapshot` and friends now reject unauthenticated requests with 401. Was permissive before. Means the curl-based health check needs a Bearer token going forward.
3. **AI pick infrastructure (PR #145–#147)** — server-side cache keyed by inputs hash, `cardSource` provenance flag (logged / AI / cached AI / manual), split `style-fixed-watch` endpoint with schema enforcement, latency + token metrics emitted on every call.
4. **Plan/Today UX overhaul (PR #149–#159)** — every plan card now carries source/status header, collapsible AI reasoning with first-sentence summary, "Changed/Kept" diff after "Different one →", green-tint visual state for logged cards, watch + strap paired as one visual block, dev-mode "Styled around: <watch>" label, explicit AI error state with Retry / Use planner pick. Tab order reset to Today | Plan | Audit | History | Travel.
5. **AI flexibility (PR #160–#162)** — Claude reasoning now receives the user's actually-selected strap so reasoning matches reality; auto-refit fires on watch or strap change; "Different watch" steer chip is wired through to actually change the watch (it was a no-op before).

### Health snapshot at bump
- `npm install` clean (PUPPETEER_SKIP_DOWNLOAD=true)
- `vitest run` — 192 files / 3422 tests, all green, 192.9s wall
- `vite build` — 5.5s, ~600 kB raw, ~155 kB gzip
- Deployed bundle (pre-bump) = `index-DRcH4Rye.js` containing literal `"1.12.42"` — matches `package.json` pre-bump
- Test files since v1.12.42 audit: 192 (up from 183); test count: 3422 (up from 3281); +9 files / +141 tests of net coverage growth without flakes

### Engine invariants — re-verified PASS
- `strapShoeScore()` returns 1.0 always ✅
- `buildOutfit()` is the only scoring path; `generateOutfit()` legacy stays absent ✅
- `extractText()` used by all Claude functions ✅
- `Array.isArray()` guards on every IDB load ✅
- SCORE_CEILING = 30 ✅
- Coherence v2 warm/cool = +0.20 ✅
- Never-worn 0.50/0.50 ✅
- `FORMAL_CONTEXTS` includes "clinic" ✅
- `isActiveWatch()` filters `!retired && !pending` — 19+ filter points intact ✅
- contextFormality = 0.5 (not 1.5) ✅

### Documentation drift fixed
- `SKILL_watch_advisor2.md` § header: version `1.12.40` → `1.13.0`, tests `3281 tests, 183 files` → `3422 tests, 192 files`, last-audited block rewritten for 2026-05-05.
- `IMPROVEMENTS.md`: this entry.
- `package.json`: bumped.

### Open carry-forward
- Skill-snapshot now requires Bearer — automation that scrapes it (incl. any local audit scripts) needs to wire the auth header. Cron path is unaffected (server-internal).
- R3 candidates from May 1 round still open: vitest 4.1.5 patch, uuid override after `@netlify/blobs` v11, hoist `vi.mock`, coverage threshold gate, SW integration tests, `scripts/rls-audit.sh`.
- Next physical drift to watch: when Atelier Wen Perception or Fears Brunswick land in Israel, flip `pending: true` → `pending: false` in `watchSeed.js` and bump version.

---

## Session: May 5 2026 R2 — Quality + Security Coverage Pass (v1.13.1)

### Why a patch (not minor)
Pure quality + security work. No new app features. No user-facing surface changes. Patch bump 1.13.0 → 1.13.1 is the right tier.

### Real audit finding worth flagging
The single biggest gap was not on the R3+ list — it was that **`netlify/functions/_auth.js` had zero direct test coverage** despite gating all 17 browser-callable functions (PRs #138–#140). The behaviour is non-trivial:
- Three-state rollout flag (`true` / `false` / unset) with production-context auto-enforcement
- "Two scary flags" requirement to disable in prod (`AUTH_GATE_ENABLED=false` AND `ALLOW_INSECURE_PROD=true`) — single-flag misconfig must NOT open the gate
- Fail-closed when `ALLOWED_USER_EMAIL` is missing (returns 500, not "allow all")
- Auth-validator throw → 500 (caller is innocent), not 401

A "simplification" PR could easily collapse the three-state flag back into a boolean and silently re-open the gate. Now pinned by 27 regression tests.

### Coverage added (+60 tests / +3 files)

**`tests/auth.test.js` (27 tests)** — full `_auth.js` contract:
- Rollout flag: `true` enforces; `false` in prod ignored without `ALLOW_INSECURE_PROD`; case-insensitive `TRUE` accepted; arbitrary values like `"1"` fall through to defaults; prod-default-on via `CONTEXT=production` and `NODE_ENV=production`
- Bearer parsing: missing header, missing prefix, empty token, whitespace-only token, capitalized vs lowercase header key, missing headers object, null event
- Supabase validation: error path, no-user path, validator throws, missing creds = 500
- Allowlist: exact match, case-insensitive match, whitespace-trim, mismatch returns 403 (not 401), missing email field, fail-closed on missing `ALLOWED_USER_EMAIL`

**`tests/serviceWorkerRuntime.test.js` (20 tests)** — closes R3 candidate #5 (SW integration gap):
- Sandboxes `public/sw.js` via `new Function()` with mocked `self`/`caches`/`fetch`, captures the registered handlers, exercises them with synthetic FetchEvents
- Install: precaches SHELL_URLS, tolerates precache failure
- Activate: deletes outdated caches, keeps current 3, calls `clients.claim()`
- Fetch routing: `daily-pick`/`claude-stylist`/`skill-snapshot` bypass cache (NO_CACHE_FUNCTIONS); offline returns 503 with `code: NO_CACHE_FUNCTION`; non-listed functions fall through to networkFirst; Supabase Storage uses cacheFirst with second-call cache hit; non-GET passes through; cross-origin non-storage passes through; same-origin app shell uses networkFirst with offline fallback to cached
- Push: valid JSON triggers showNotification with morning-brief tag; invalid JSON silently returns; no data does nothing
- Message: `SKIP_WAITING` calls skipWaiting; other types ignored; malformed event doesn't crash

**`tests/claudeStylistEdge.test.js` (13 tests)** — closes the gap IMPROVEMENTS.md flagged for `aiStylist/claudeStylist.js`:
- Response failures: 4xx, 5xx, non-JSON content-type, missing content-type, charset suffix accepted (`application/json; charset=utf-8`), sync-throw fetch, `res.json()` rejects on malformed body
- pinnedSlots: transforms each slot to `{name, type, color}` only (drops formality/id/thumbnail), preserves `null` slots, defaults to `{}` when omitted
- engineOutfit: sweater + jacket slot transformation (gap not covered by base test), all five slots default to null when missing

### Dep upgrades
- `uuid: ^14` added to `overrides` — clears moderate `GHSA-w5hq-g745-h8pq` (transitive via `@netlify/blobs` → `@netlify/dev-utils`; no direct uuid usage in our code, so override is safe)
- `vitest`: `^4.0.18` → `^4.1.5`
- `@vitest/coverage-v8`: `^4.1.4` → `^4.1.5`
- `npm audit` reports 0 vulnerabilities (was 1 moderate)
- `npm audit fix` no longer needed for routine maintenance

### New tooling
- `scripts/rls-audit.sh` — closes R3 candidate #6 (RLS audit unblocked from interactive MCP OAuth)
  - Runs 6 policy checks against the live DB via `psql`
  - Required env: `SUPABASE_DB_URL`, `ALLOWED_USER_EMAIL`
  - Verifies: RLS enabled on garments/history/app_config, single-owner SELECT policies present, app_config grants `authenticated` role (PR #140 fix), no anon INSERT/UPDATE on garments+history
  - Exits non-zero on any weakening — usable from CI later

### R3 candidates — status
1. ~~uuid override~~ ✅ shipped
2. ~~vitest 4.1.4 → 4.1.5~~ ✅ shipped
3. ~~Hoist `vi.mock` calls~~ ✅ already shipped in commit 39352e2 (verified clean)
4. Coverage threshold gate — already in `vite.config.js` at `lines: 50, branches: 40` (was overlooked in earlier R3 list)
5. ~~SW integration tests~~ ✅ shipped (`serviceWorkerRuntime.test.js`)
6. ~~`scripts/rls-audit.sh`~~ ✅ shipped

### Health snapshot at bump
- `npm install` clean, `npm audit` 0 vulns
- `vitest run` — 195 files / 3482 tests, all green
- `vite build` — clean, ~600 kB raw / ~155 kB gzip (unchanged from 1.13.0)

### Documentation drift fixed
- `SKILL_watch_advisor2.md` § header: version 1.13.0 → 1.13.1, tests 3422 → 3482, files 192 → 195, last-audited block rewritten with R2 detail
- `IMPROVEMENTS.md`: this entry
- `package.json`: bumped + overrides updated

### Open carry-forward
- Coverage report at lines:50/branches:40 not actually enforced in CI yet — the threshold is in `vite.config.js` but no CI step runs `vitest run --coverage`. Wire that into `.github/workflows/weekly-audit.yml` next round.
- Reuse `scripts/rls-audit.sh` from CI: needs `SUPABASE_DB_URL` as a GH Actions secret, then add a job step. Skipped this round to avoid a multi-PR setup.
- React 18 → 19, vite 7 → 8, jsdom 28 → 29, zustand 4 → 5 majors all still deferred — none are blocking and each needs its own breaking-change review session.

---

## Session: May 5 2026 R3 — Real Bug Fix: AI Cache Stale-on-Edit (v1.13.2)

### The bug

`computeCacheKey` in `netlify/functions/daily-pick.js` was using

```js
gsig = `${garments.length}-${maxCreatedAt}`
```

as the wardrobe-state signature. This catches additions and removals (length changes; if a brand-new garment is added, maxCreatedAt also moves forward) but **not in-place edits**. An edit to a garment's color, formality, category, name, or brand via `GarmentEditor.jsx` leaves both `length` and `created_at` unchanged → cache key unchanged → cache hit → user gets a recommendation that didn't see the edit.

TTL for today is 4 hours, so the staleness window is real and user-observable. Repro:

1. Open WeekPlanner, ask Claude for today's outfit. Cached.
2. In Wardrobe → tap a garment → change its color.
3. Ask Claude again. Returns the pre-edit answer.

Single-user app + 4h window means Eias would notice this in normal use.

### The fix

Replace the gsig with a content-hash dimension:

```js
gsig = `${length}-${maxCreatedAt}-${contentHex}`
```

`contentHex` is an 8-char hex render of a 32-bit XOR sum of per-garment FNV-1a hashes. Each garment contributes `H(id|name|color|formality|type|brand)`. XOR-sum is order-independent, which is correct here because the prompt re-derives ordering — two arrays with identical content in different order should hit the same cache.

Why FNV-1a + XOR rather than a stronger hash:
- Wardrobe is ~100 garments → collision probability across 32 bits is negligible
- No crypto deps, no async, runs inline in the request path
- 8 hex chars keeps the cache key under the 200-char test bound and grep-friendly when debugging "why is this stale"

Why per-garment hash + XOR rather than hashing the whole serialized array:
- Order independence comes for free (commutative)
- Still busts on any single edit (any flip of any field changes that garment's hash, which changes the XOR)

### Tests added (+8)

In `tests/dailyPickCache.test.js`, pinning each editable field as a cache-busting signal:

1. editing color → different key
2. editing formality → different key
3. editing category → different key
4. editing name → different key
5. editing brand → different key
6. different array order, identical content → SAME key (order independence)
7. garment with no `created_at` still contributes to content hash (defensive)
8. falls back to `g.type` when `g.category` is absent (DB schema variance — both shapes exist in our garment rows)

Existing tests still pass — adding/removing a garment still produces a different key, weather rounding still buckets, history additions still bust.

### Test totals
192 files / 3422 tests (1.12.42)
→ 195 files / 3482 tests (1.13.1)
→ 195 files / **3490 tests** (1.13.2) — all green

### Other audit findings considered, not actioned this round

- **Variants response missing `cardSource`** (daily-pick.js line 723): when the user requests >1 variants, each entry gets `generatedAt + weather` but not `cardSource`. The Plan card UI labels rely on cardSource (PR #149). The variant render path may default-display "AI" without distinguishing fresh vs cached. Cosmetic, not a logic bug. Defer.
- **Auth gate `getSession()` per-fetch**: `authedFetch` calls Supabase's `getSession()` on every browser → function fetch. It hits Supabase's local cache (no network round trip), so cost is sub-millisecond. Not a perf bug but worth noting if call volume ever 10×.
- **`recordMetric` order in catch path**: when supabase init throws (line 446 area), the catch block's `recordMetric(supabaseForMetrics, ...)` correctly null-guards and returns. No bug — just confirmed safe.

### What I looked at but did NOT find
- `Array.isArray()` IDB guards: clean. No `?? []` patterns remain on IDB-derived data in `supabaseSync.js`, `wardrobeStore.js`, `historyStore.js`.
- `console.log` in production: all 18 occurrences are gated behind `import.meta.env.DEV` and stripped by vite's esbuild `pure` config. Clean.
- `vi.mock` non-top-level: zero remain (commit 39352e2 cleaned this up).
- `_auth.js` rollout flag: comprehensive coverage now in `tests/auth.test.js` (R2). No drift.

---

## Session: May 5 2026 R4 — Five Real Bugs in the AI ↔ Planner Recommendation Loop (v1.13.3)

The deepest round so far. Every bug below was reproducible and either user-visible or a concrete data-corruption risk; none were on the R3 backlog.

### Bug 1 — Reverso dialSide override silently lost on strap change

`WeekPlanner.jsx` line ~1156 had:

```js
if (enrichedWatch?.dualDial && dialSide) {
  enrichedWatch = { ...enrichedWatch, dial: dialColor }; // dial override applied
}
if (dayStrapObj) {
  enrichedWatch = { ...day.watch, strap: strapStr };    // ← BUG: spreads day.watch
}
```

Reverso is the only `dualDial: { sideA, sideB }` watch in the collection. User flips to side B (white) → tapping a strap reverts the displayed dial to side A (navy). Two state changes, only one survived.

Fix: spread `enrichedWatch` instead of `day.watch` so both overrides compose.

### Bug 2 — `handleAskClaude` stale closure

useCallback deps were `[garments, watches, recentAiPicks, compactPickForExclude, aiAppliedDays, outfitOverrides]`. The function body actually reads `rotation`, `watchOverrides`, `strapOverrides`, `straps`, and `activeStrap` (to build the `pinnedWatch + currentStrap` blocks for the prompt). All five were missing.

The auto-refit useEffect (line ~1568) correctly listed those state slices in its deps, so it re-ran when the user changed strap. But it called `handleAskClaude` — and `handleAskClaude` was the *stale* closure that captured pre-change values. Symptom: change strap → AI gets the old strap → prose explains a strap the user didn't pick. Same shape as the BB41/Rikka mismatch class (PR #141), just on the strap axis instead of the watch axis.

Repo had no eslint, so `react-hooks/exhaustive-deps` never flagged it.

Fix: added the missing deps. The auto-refit's existing early-return guards (`currentWatchId === seen.watchId && currentStrapId === seen.strapId`) plus `aiContextRef`'s synchronous self-write protection prevent any cascading re-fires from the new dep set.

### Bug 3 — Brittle AI garment-name match

Inline matching was strict equality + lowercase fallback:

```js
const match = garments.find(g =>
  g.name === name || g.name?.toLowerCase() === name?.toLowerCase());
```

Broke silently on AI responses with: trailing whitespace, surrounding straight or smart quotes, trailing punctuation (`"Navy Polo."`), or extra padding the model occasionally adds when wrapping a name as a noun phrase. The slot would fail to map → fell back to engine pick → user saw an outfit that didn't match Claude's reasoning. No surfaced warning.

Fix: extracted to `src/utils/aiPickResolver.js` with two pure functions:
- `normalizeAiName(value)` — trim, strip one layer of quotes (straight + smart), strip trailing punctuation, lowercase. Defensive for non-strings.
- `resolveGarmentSlots(pick, garments, slots)` — uses `normalizeAiName` on both sides; returns `{ overrides, unmatched }`. The unmatched array surfaces via `console.warn` when names don't resolve, so future model drift is visible.

### Bug 4 — Different-watch-mode response had no validation

PR #162 wired the "Different watch" steer chip to apply `pick.watchId` as a watch override. The match logic was:

```js
const matchedWatch = watches.find(w => w.id === pick.watchId);
if (matchedWatch) { setWatchOverrides(prev => ({ ...prev, [date]: pick.watchId })); }
```

Two failure modes:
- Hallucinated id: model returns a watchId not in our collection → silent no-op, chip "did nothing" from the user's POV.
- Retired/pending leak: the prompt was built from `watches.filter(isActiveWatch)` so the model shouldn't return a retired or pending one, but defense in depth says we should validate on receipt too.

Fix: `validateDifferentWatchPick(pickWatchId, watches, isActiveWatch)` returns `{ ok, watch?, reason? }`. WeekPlanner now logs the reason on rejection and only applies the override on success.

### Bug 5 — AI-request race conditions (the worst of the five)

Two related races:
- **Rapid double-tap of "Ask Claude":** fires two parallel requests; the responses' `setOutfitOverrides` / `setStrapOverrides` / `setRecentAiPicks` calls interleave unpredictably. Whichever resolves second wins, but with a torn write of internal state.
- **Change watch mid-flight:** user taps "Ask Claude" → user changes watch (auto-refit useEffect debounces 1500ms) → user-original-request response lands at t=2s while the auto-refit's request is still in-flight at t=2.5s → the OLD watch's outfit gets applied, then the auto-refit response lands later and corrects it. Without the abort, the OLD response can fully overwrite the NEW one if request order reverses.

Fix: per-date `AbortController` in `inflightAbortersRef`. At the start of every `handleAskClaude`, the prior controller for that date is aborted. After `await fetch` resolves, a staleness check (`if (inflightAbortersRef.current[date] !== aborter) return;`) drops the response on the floor if a newer request superseded us. AbortError is suppressed from the user-facing error banner — a deliberate supersession isn't a failure.

Also handles double-tap correctly: second tap aborts the first; user accepts a small UX cost (waits one more time) in exchange for getting the right answer. No state torn-write.

### Bonus — Past-corrections false-positive prevention

The fixed name-matching expanded the set of slots that successfully resolve to overrides. The past-corrections synthesis compares AI-suggested name to user-overridden garment name to detect "user disagreed with AI"; with the more permissive matcher, whitespace/punctuation drift between `aiPick[slot]` (raw AI string) and `garments.find(...).name` (DB) would now surface as false-positive disagreements.

Fix: normalize both sides via `normalizeAiName` before the diff predicate. Real disagreements still register; trivial drift is filtered out.

### Tests

New file `tests/aiPickResolver.test.js` (+33 tests):
- `normalizeAiName` (10): lowercase, trim, straight quotes, single quotes, smart quotes, trailing period, trailing comma, mid-string punctuation preserved, non-string defensive, single-layer quote stripping
- `resolveGarmentSlots` happy path (5): exact, case-insensitive, whitespace, surrounding quotes, trailing period
- `resolveGarmentSlots` explicit null (3): literal `null`, string `"null"`, empty string
- `resolveGarmentSlots` unmatched (2): hallucinated → in `unmatched`, partial unmatched
- `resolveGarmentSlots` defensive (5): null pick, non-array garments, non-array slots, non-string slot value, garment without name
- `validateDifferentWatchPick` (8): matched + active, not in collection, retired, pending, missing id, non-string id, non-array watches, optional active predicate

Test totals: 3490 → **3523** (+33), 195 → **196** files. All green.

### Why these all slipped through

- No eslint → no `react-hooks/exhaustive-deps` → bug 2 invisible to tooling.
- Bug 1 was a 1-line variable-spread mistake; only manifests for a single watch (Reverso), only when both dial-override and strap-override are set. Easy to miss in code review, no test exercised the combination.
- Bugs 3, 4, 5 are response-handling issues; the model rarely returns whitespace/quoted names AND the network rarely takes long enough for a race AND failure modes are silent (no thrown error). The combined "rare * rare * silent" probability hides them in routine usage but they accumulate over weeks.

### What I considered but did NOT fix this round

- **Variants response missing `cardSource`** (daily-pick.js variants path): variants UX isn't currently a WeekPlanner flow. Cosmetic only when wired up. Defer.
- **Substring/contains strap match**: Claude sometimes says "navy alligator" for a strap labeled "Navy alligator (aftermarket)". Could ease this with substring fallback, but introduces ambiguity if two straps share a substring. Punted — current behavior leaves strap unchanged on ambiguity, which is safe.
- **Slot retention on unmatched name**: when AI returns a slot name that doesn't resolve, we currently leave the slot out of `overrides`, which means the engine pick is shown. Some users might prefer "keep my prior manual override." Ambiguous design call; defer until evidence of pain.

### Pipeline
- 196 files / 3523 tests, all green
- `npm audit` 0 vulnerabilities
- Build: 4.93s, ~600 kB raw / ~155 kB gzip (unchanged)
- Bumped 1.13.2 → 1.13.3 patch

---

## Session: May 5 2026 R5 — Stress + Accumulated-Usage Hunt (v1.13.4)

User asked for the deepest pass yet — simulated heavy load, accumulated usage, throttle, until-failure. Found one real lost-update race that was reproducible under realistic concurrency, and confirmed several other surfaces hold under 100× normal load.

### The bug — `setCachedState` / `patchBlob` lost-update race

Both `src/services/localCache.js` `setCachedState` and `src/services/persistence/settingsPersistence.js` `patchBlob` did the classic three-microtask read-modify-write:

```js
const existing = await db.get("state", "app");          // T1
const merged = { ...existing, ...partial };
await db.put("state", merged, "app");                   // T2
```

Two concurrent callers race:
- Caller A: reads existing = `{x: 1}`
- Caller B: reads existing = `{x: 1}` (same)
- Caller A: writes `{x: 1, a: 2}`
- Caller B: writes `{x: 1, b: 3}` ← drops A's `a`

Real-world callsites that fire concurrently:
- `WeekPlanner` persisting `_outfitOverrides` on slot change
- `travelStore` persisting `travelStore` on trip add
- `strapStore` persisting `strapStore` on strap activation
- `prefStore` persisting `prefProfile` on preference change
- `styleLearnStore` persisting `styleLearning` on preference profile update

All write to the same `state/app` blob via the same merge-then-put pattern. Any two firing in the same tick can lose-update each other.

**Symptom:** rapid edits across multiple panels + a quick reload = silently lost changes. Hard to spot in logs because the write "succeeded."

**Fix:** wrap read + write in a single IDB transaction:

```js
const tx = db.transaction("state", "readwrite");
const existing = (await tx.store.get("app")) || {};
await tx.store.put({ ...existing, ...partial }, "app");
await tx.done;
```

IDB's per-store readwrite-tx queue serializes operations across all concurrent callers. The second tx's `get` reads what the first tx just `put`. No data loss.

### New stress test file: `tests/stressSimulation.test.js` (17 tests)

Each `describe` block targets one stress dimension with deliberately-extreme loads:

**Concurrent persistence (3 tests)**
- 50 concurrent `setCachedState` calls to 50 distinct fields → all 50 survive
- 50 concurrent same-field writes → some value 0–49 wins (last-write-wins preserved, no `undefined`)
- 4 interleaved writes to overlapping field sets (mimics tab-A + tab-B persistence collision) → all 4 fields present

**Cache key scaling (4 tests)**
- 1000-garment wardrobe → key stays under 200 chars (Postgres index bound)
- 10000-garment wardrobe → key still under 200 chars (FNV-1a hash is constant-width)
- 100 calls on identical input run in <50ms (no quadratic behaviour)
- 200 distinct wardrobe states → 0 hash collisions (32-bit XOR sum sufficient at this scale)

**`resolveGarmentSlots` under load (3 tests)**
- 1000-item wardrobe with mixed input shapes (padded / quoted / trailing-period) → all resolve, <20ms
- Duplicate-name wardrobe → returns one of the duplicates without crashing
- 100 unmatched slots → 100 entries in `unmatched`, no runaway memory

**`normalizeAiName` adversarial (4 tests)**
- 10000 calls in <100ms throughput
- 100000-char input → no stack overflow
- `""nested""` → preserves inner quotes (single-layer strip only, not infinite)
- `""`, `...`, `"."` pathological strings → no crash

**AbortController lifecycle (3 tests)**
- Aborting an already-finished controller doesn't throw
- 1000 sequential "asks" on the same date → 0 controllers leak in the ref
- Rapid double-tap mid-flight → only latest aborter survives, prior is `.signal.aborted = true`

### Mock infrastructure

Real IDB serializes readwrite transactions on the same store via an internal queue. Most existing test mocks didn't model this, so:

1. `tests/localCache.test.js` mock — added `tx.store.get` / `tx.store.put` for the state store path
2. `tests/localCacheEdge.test.js` mock — same, with error injection through the tx path
3. `tests/clearCachedState.test.js` mock — added `get/put` to all three (state/images/planner) tx store stubs
4. `tests/settingsPersistence.test.js` mock — added `transaction()` returning a `tx.store` with `get/put`. Also rewrote two assertions that were checking `db.put` mock call signature directly (the May 5 R5 fix migrated `patchBlob` from `db.put` to `tx.store.put`, so the contract is now "data lands at state:app" rather than "db.put called with 3 args"). The original "key parameter regression" test was guarding a 2024-era bug where the key arg was missing; the new assertion guards the same contract on the new code path.
5. `tests/stressSimulation.test.js` — built a global per-store tx serialization queue (`txChain`) so concurrent test calls properly model real IDB semantics. Without the queue, the stress test would falsely "pass" against a non-serializing mock and miss real production races.

### What I looked at but did NOT find a bug for

- **Per-date state dict accumulation** (`recentAiPicks`, `aiSourceByDay`, `aiAppliedDays`, etc.): these dicts are NOT persisted across reloads (only `_outfitOverrides` is, and that already prunes >7 days on load). Within-session growth is bounded by session length × dates user interacts with. After a week of daily use → ~7 entries per dict × 12 dicts = 84 small entries. Memory cost is negligible. **Not a real bug at current scale.**
- **`aiAppliedDays` iteration in past-corrections synthesis**: scales linearly with date count. With 100+ entries (months of usage), still 100 × 5 slots = 500 iterations per AI call (sub-millisecond). **Not a real bug.**
- **Backup-service concurrent createBackup**: two tabs could both insert + prune to 4-snapshot rolling buffer, briefly producing 5 entries. Self-corrects on next backup. **Marginal, not worth fixing.**
- **`forecast` cache 1-hour TTL across midnight**: if forecast was fetched at 11:30pm and used at 12:15am, dates don't match — but `forecast.find(f => f.date === day.date)` returns `undefined` and the auto-load skips firing (`if (!dayForecast) continue;`), so no AI call uses stale weather. Visual-only stale forecast bar. **Not functional.**
- **`handleResetOutfit` partial cleanup**: clears AI state but not `watchOverrides`/`strapOverrides`/`dialSideOverrides` for the date. Reviewed — there are separate "Reset watch" and strap reset affordances; the separation is intentional UX, not a bug.
- **`recordMetric` tail-100 in catch path**: null-guarded, safe.
- **`createBackup` 5-snapshot peak in memory**: 4-snapshot rolling buffer briefly holds 5 during put → prune. With ~600 KB per snapshot and 8 GB OPPO RAM, immaterial.

### Pipeline
- 197 files / 3540 tests, all green
- `npm audit` 0 vulnerabilities
- Build clean, ~600 kB raw / ~155 kB gzip (unchanged)
- Bumped 1.13.3 → 1.13.4 patch

### Where to push next under-load testing if it ever matters
- **Service-worker cache stampede**: parallel fetches for the same Supabase Storage URL — currently each `cacheFirst` runs independently and would all fetch + put. Could dedupe via an in-flight Map. Not currently observed as a problem; defer.
- **Claude 429 / billing-error recovery**: backoff strategy not currently tested. `recordMetric` records the error but no client-side circuit breaker. Defer until cost or rate-limit incident provides the data.
- **IDB quota exhaustion**: blob store can fill up if image cache accumulates without TTL. The image-cache eviction is by garment-id presence (`evictOrphanImages`), not size. Could add an LRU bound. Defer.
