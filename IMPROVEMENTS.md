# Auto-Generated Improvement Proposals
Generated: 2026-04-03 (full session)

## Audit Summary (April 3 — second pass)
- **Supabase**: 77 active garments, 38 history entries, 0 dupes, 0 orphans, 0 untagged
- **Tests**: 2087/2087 passing (113 files)
- **Engine integrity**: 15/15 checks PASS
- **Snapshot**: garments ok, history ok, orphanedHistory ok, wardrobeHealth ok
- **Fixes shipped**: daily-pick maxAttempts 2→1, pushBrief fetch mock, 3 stale tests updated (default temp 15°C), weatherService label assertion
- **Deploy**: ready

## v1.5.7 — April 3 Session

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
13. **9 wear entries logged** across session (Mar 21, 23×3, 30, Apr 2×3, Apr 3)

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
