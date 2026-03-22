# Auto-Generated Improvement Proposals
Generated: 2026-03-22 (full session)

## Audit Summary
- **Engine integrity**: All checks PASS (11 static + 6 Supabase + snapshot)
- **Supabase**: 75 active garments, 0 dupes, 0 orphans, 75/75 fully tagged
- **Tests**: All 2084+ passing (113 files)
- **Snapshot**: All health "ok", autoHeal healthy
- **Crons**: 3/3 scheduled, weekly GitHub Action present
- **Build**: 571 kB (167 kB gzip)
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
