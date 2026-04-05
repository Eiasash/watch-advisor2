# Auto-Generated Improvement Proposals
Generated: 2026-04-05 (evening session)

## v1.9.0 — April 5 2026

### Data Analysis Driving Changes
- **4/44 history entries had scores** — scoring system unused, preference learning starved
- **28/68 non-accessory garments never worn** — 40% wardrobe idle despite NeverWornSpotlight
- **Pasha (2 wears), Hanhart (0), Laco (1), Monaco (1)** — genuine watches neglected
- **No strap location tracking** — cross-strapping (Laco→BB41, Rikka→Speedy) invisible to engine

### Features Shipped
1. **Required score rating** — outfitScore defaults null, log button disabled until user taps 5-10. Amber border nudge when unrated.
2. **Never-worn slot reservation** — every 3rd outfit (history.length % 3 === 0), engine forces best-scoring never-worn garment into beam-search shortlist for shirts/pants.
3. **NeglectedWatchNudge** — new component. Amber card surfaces most idle genuine watch (14+ day threshold). Tap to select in TodayPanel.
4. **Cross-strap tracking** — strapStore gains moveStrap(strapId, from, to), returnStrap(strapId), getCrossStrapped(). Tracks originalWatchId + crossStrapped flag.
5. **Photo prompt after log** — camera button appears in post-log summary if no outfit photo attached. One-tap capture + attach to entry.
6. **Weather-driven strap scoring** — strapRecommender now accepts weather param. Rain (precipMm > 1): leather -0.10, bracelet +0.15, NATO/rubber +0.10. Heat >28°C: NATO/rubber +0.10. poorFit flag halves strap score.
7. **Tailor queue countdown** — TailorCountdown component. Green card shows pieces at tailor + days until pickup (hardcoded Apr 9). Reads tailor-flagged garment notes.
8. **recommendStrap weather param** — 4th arg (optional) flows weather data into strap scoring.

### Files Changed
- `src/components/TodayPanel.jsx` — features 1, 3, 5, 7, 8 wired in
- `src/components/today/NeglectedWatchNudge.jsx` — NEW
- `src/components/today/TailorCountdown.jsx` — NEW
- `src/outfitEngine/outfitBuilder.js` — feature 2 (never-worn reservation)
- `src/outfitEngine/strapRecommender.js` — features 6, 8 (weather param)
- `src/stores/strapStore.js` — feature 4 (moveStrap, returnStrap, getCrossStrapped)

### Remaining TODO
1. Cross-strap swap UI component (StrapSwapCard) — backend ready, no frontend yet
2. Dynamic tailor pickupDate — currently hardcoded, move to app_config
3. Auto-unblock tailor garments on pickup day

---

## v1.8.0 — April 6 2026

### Audit Summary
- **Supabase**: 75 active garments, 42 history entries, 0 dupes, 0 orphans, 0 untagged
- **Tests**: 42 files passing, 0 failures
- **Snapshot**: All health checks pass (autoHeal WARN is informational — garment stagnation flag)
- **Deploy**: Live and confirmed via skill-snapshot endpoint

### Features Shipped
1. **LastWornWithWatch** — shows previous outfit for selected watch in TodayPanel
2. **TailorQueue** — dedicated UI in AuditPanel with "Mark as Done" button
3. **StrapSuggestion** — weather-aware strap recommendation below watch picker
4. **ScoreBackfill** — batch-rate 30 unscored history entries in History tab
5. **WeekPlanLock** — save/lock weekly outfit plan, shows today's plan as daily card
6. **HistoryOutfitPhotos** — garment thumbnails inline in history entries
7. **NeverWornSpotlight** — gentle daily suggestion for never-logged garments
8. **SeasonalTransition** — spring transition alert (pack away / bring out)
9. **StrapHeatmap** — strap wear frequency visualization in StatsPanel
10. **OutfitReplay** — "Wear again" button on history entries
11. **WardrobeGapAnalysis** — context coverage gap detector in AuditPanel
12. **Score selector** — 1-tap rating (5-10) in TodayPanel log flow
13. **Strap warning** — alert when no strap selected before logging

### Scoring Changes
- Never-worn recencyScore: 0.75 → **0.50** (gentle nudge, not aggressive push)
- Never-worn rotationPressure: 0.70 → **0.50**
- Garment count health gate: 77 → **70**

### Data Fixes
- 39 history entries backfilled with watch names from watch_id mapping
- Gant QZ color: olive → green
- Ecco S-Lite Hybrid: tan/white sole → brown/dark sole (corrected)
- Tommy micro-check → micro-dot (correct pattern name)
- Kiral White Dress Shirt re-added (sleeves too long — tailor)
- Gant White Oxford flagged (cuffs too wide — tailor)
- Gant multistripe excluded (size 42 too tight, not worth tailoring)
- Venti White Poplin excluded (can't find physically)
- Pavarotti navy suit jacket flagged (tight on button — tailor)

### New Garments Added
- Venti Beige Twill Blazer (size 52)
- Venti JerseyFlex Cream/Taupe Diagonal Twill Shirt (size 44 Body Fit)
- Pavarotti Navy Pinstripe Suit Jacket + Trousers
- Silitop Green Button-Down Shirt
- Gant Blue/Tan Multistripe Shirt (excluded — tight)

### Tailor Queue (5 pieces)
1. Pavarotti navy jacket — let out waist seams
2. Nautica white/navy stripe shirt — suppress side seams
3. Tommy Hilfiger navy micro-dot — assess chest let-out
4. Kiral white dress shirt — shorten sleeves
5. Gant White Oxford — narrow cuffs

---

## Previous Session (April 4 — v1.6.3)
- **Supabase**: 71+ active garments, history entries intact, 0 dupes, 0 orphans
- **Tests**: 2228+ passing (122 test files)
- **Engine integrity**: 15/15 checks PASS (all scoring weights verified)
- **Static analysis**: no circular deps (lazy import OK), no dead code, no inlined constants
- **Build**: 571 kB clean (no warnings)
- **Fixes shipped**: sweater warm transition tests, test count sync
- **Version**: 1.6.3

## v1.6.3 — April 4 (audit + test expansion)

### Test Expansion
1. **sweaterWarmTransition.test.js** — 6 new tests: no sweater ≥22°C, warm transition zone 18–21°C requires score > 4.0, default temp fallback is 15 not 22, layer slot below 8°C.

### Maintenance
2. **Test counts synced** — CLAUDE.md, SKILL_watch_advisor2.md, IMPROVEMENTS.md all updated to 2228+ tests / 122 files.
3. **Audit date updated** — skill file last-audited → 2026-04-04.

---

## Audit Summary (April 3 — v1.6.2)
- **Supabase**: 71 active garments (23 with photos, 26 with angles), 39 history entries, 0 dupes, 0 orphans, 0 untagged
- **Tests**: 2087+ passing (27 test files)
- **Engine integrity**: 15/15 checks PASS
- **Snapshot**: garments ok, history ok, orphanedHistory ok, wardrobeHealth ok
- **Fixes shipped**: palette-aware strap recommender, angle photo persistence, SyncAnglesPanel, olive/green strap rules
- **Deploy**: ready
- **Version**: 1.6.2

## v1.6.2 — April 3 (strap intelligence)

### Features
1. **Palette-aware strap recommendation** — `strapRecommender.js` rewritten. Scores each strap against shoe color (mandatory), outfit color palette affinity (color family matching), context formality, and watch dial harmony. Replaces shoe-only matching in both outfitBuilder (Plan tab) and WatchDashboard (Today tab).
2. **Outfit-strap bidirectional logic** — strap selection gates shoe pre-filtering via `strapShoeScore` → shoes drive belt + palette. Strap recommendation reads outfit palette back. Full loop.

### Bug Fixes
3. **SyncAnglesPanel race condition** — panel was invisible because `pullThumbnails` (async Phase 2) hadn't hydrated `photoUrl` when panel rendered. Now queries Supabase directly on mount.
4. **Olive/green strap shoe rules** — `strapRules.js` already had `olive` and `green` entries allowing brown/tan/white/black shoes. Confirmed working with Hanhart dark green suede + tan Eccos.

---

## v1.6.1 — April 3 Session (angle fix)

### Features
1. **Claude's Pick (daily-pick.js + ClaudePick.jsx)** — AI outfit recommendation with same styling logic as human conversation. Fetches garments, watches, history, hourly weather. 4-hour cache. Purple accent card in Today tab.
2. **🤖 Ask Claude per day in Plan tab** — button per day card calls daily-pick with that day's weather, applies garment + watch overrides.
3. **Hourly weather awareness** — fetchWeatherForecast requests hourly temps, shows morning/midday/evening (🌅 8° · ☀️ 15° · 🌙 10°). "Shed the layer after noon" tip.
4. **Default temp 22°C → 15°C** — outfitBuilder, WatchDashboard, WeekPlanner all defaulted to summer/no-layer. Now defaults to neutral/light-layer.

### Bug Fixes
5. **Belt slot swappable** — removed "belt" from ACCESSORY_TYPES exclusion in WeekPlanner + WatchDashboard.
6. **"None — remove" option** in OutfitSlotChip dropdown — clear any slot.
7. **Logged outfit overrides** — weekOutfits memo was bypassing outfitOverrides for _isLogged entries. Now applies manual overrides on top of logged garments.
8. **WeekPlanner crash (muted undefined)** — main component defined `sub` but not `muted`. Line 1387 referenced it for history notes.
9. **Snapshot weights stale** — skill-snapshot.js had hardcoded contextFormality=1.5 → 0.5, contextMatch 0.25 → 0.10.
10. **CRITICAL: Angle photos not persisted to Supabase** — `upload-angle` handler in bootstrap.js uploaded angle photos to Storage but discarded the returned public URL. `pushGarment()` filters out `data:` URLs from `photo_angles`, so DB always got empty arrays. 66/71 garments had empty `photo_angles` in DB despite local IDB angles. Fixed handler to write URL back + push garment. Added SyncAnglesPanel in Audit tab for backfill.

### DB Updates
10. **18 garments renamed** — Kiral cardigan type fix, Wool Overcoat, Gant cable knits normalized, Geox shoes, etc.
11. **12 garment photos uploaded** to Supabase storage
12. **1 phantom history entry deleted** (auto-logged empty outfit from Plan tab)
13. **10 wear entries logged** across session (Mar 21, 23×3, 30, Apr 2×3, Apr 3×2) — latest: Tudor BB41 distressed brown + olive bomber + camel crewneck + stone PNT-5050 + tan Eccos (Ramallah casual, 8.5/10)

---

# Previous Sessions

## v1.5.7 — Flexible Context System (April 2 2026)
1. **contextFormality weight**: 1.5 → 0.5 — context is a soft nudge, not dominant
2. **Removed -Infinity hard gate**: contextFormalityScore returns 0.1 for below-minimum garments (was -Infinity)
3. **seasonContextFactor bonus**: 0.25 → 0.10 for context match
4. **"Any Vibe" default**: null context = no constraint. Engine uses weather + rotation + color.
5. **UI pills updated**: TodayPanel + WeekPlanner — "Any Vibe" first, kept On-Call for shift mode
6. **Removed rigid contexts**: "hospital-smart-casual" and standalone "formal" dropped from pills
7. **All smart-casual fallbacks → null** in WatchDashboard, TodayPanel, WeekPlanner, useTodayFormState

## Wardrobe DB Updates (April 2 2026)
- **New garments (5)**: Ecco Black Sneaker, Nautica Burgundy LS, Timberland Green Hoodie, TH Olive Hoodie, Nautica Burgundy Crewneck
- **Rebranded (7)**: Navy Sweater→Kiral TV-4052, Dark Wash→TH Bleecker, Light Wash Straight→Levi's 502, Light Wash Denim→Gant Extra-Slim, Slate Denim→Fox East Village, Black Knit Zip→Greg Norman Navy QZ, Light Blue Cable Knit→Gant
- **Excluded (2)**: Mixed Wash Denim Jeans, Olive Wash Denim Pants (ghosts)
- **Wear logs (7)**: Apr 2 ×2, Mar 30, Mar 23 ×3, Mar 21
- **Corrections**: Hanhart OEM = black leather white stitch (not teal)

---

# Previous Sessions
- **Token usage**: $1.92 for March 2026

## All Fixes Shipped This Session

### v1.5.5
1. **Retired watch UI leak** — SBGW267, Sinn 613, Rolex Date 15203 appeared in 6 UI paths (WatchSelector, WatchDashboard, TodayPanel, WeekPlanner, OnCallPlanner, neglectedGenuine). All filtered with `!w.retired`.

### v1.5.6
2. **CRITICAL: Confidence SCORE_CEILING** — Was 0.60 (multiplicative era), every outfit scored "strong". Fixed to 30 (additive engine). Now: strong >=24, good >=16.5, moderate >=10.5, weak <10.5.
3. **AddOutfitModal weather hardcoded** — Was {tempC: 22}, no jackets/sweaters in modal. Now threads forecast prop from WeekPlanner, resolves per-day.
4. **explainSeasonContext timezone** — Used raw `new Date().getMonth()` instead of Jerusalem timezone. Now uses `Asia/Jerusalem` matching seasonContextFactor.js.
5. **Shuffle fake history missing garmentIds** — `repetitionPenalty` (-0.28) never fired on shuffled-away picks. Added `.garmentIds` to all 3 shuffle paths.
6. **On-call UX duplicate** — WatchDashboard + OnCallPlanner both generated shift outfits. WatchDashboard now returns null when todayContext="shift".
7. **On-call auto-detect** — `useTodayFormState` now checks onCallDates for today, auto-defaults to "shift" context.
8. **Test fix** — calendarWatchRotationEdge "replica penalty in shift" predated shiftWatch gate. Added `shiftWatch:true` to fixtures + new shiftWatch gate test.

### Data fixes
9. **Grey Melange Kiral trousers** — missing `material` tag. Set to `cotton-blend`. 75/75 now fully tagged.

## Scoring Weights (Verified — No Changes Needed)
| Weight | Value | Status |
|--------|-------|--------|
| rotationFactor | 0.40 | Correct |
| repetitionPenalty | -0.28 | Correct |
| neverWornRecencyScore | 0.75 | Correct |
| neverWornRotationPressure | 0.70 | Correct |
| warm/cool coherence | +0.20 | Correct |
| diversityFactor | -0.12 | Correct |
| SCORE_CEILING | 30 | **FIXED** (was 0.60) |

## Remaining TODO
1. **Tailor follow-up** — Nautica White/Navy stripe + Tommy Hilfiger slate micro-check DB-flagged. Physical tailor visit needed.
2. **Pasha navy alligator strap** — pending DayDayWatchband delivery. Move from PENDING_STRAPS to pasha.straps[] when arrived.
3. **Tudor canvas straps** — navy + olive pending. Move to blackbay.straps[] when delivered.
4. **Scoring weight review** — if BB41 stagnation persists after 50+ entries, consider rotationFactor 0.40 -> 0.45.
