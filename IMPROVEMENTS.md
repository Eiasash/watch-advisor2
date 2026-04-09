# Auto-Generated Improvement Proposals
Generated: 2026-04-09 (full session)

## Audit Summary
- **Engine integrity**: All checks PASS (144 test files, 2475+ tests, zero failures)
- **Supabase**: 81 active garments (+7 added this session), 0 orphans, 47 history entries
- **Snapshot**: garments ok, history ok, orphanedHistory ok, wardrobeHealth ok
- **autoHeal**: ran 5am UTC, fixed 29 stale legacy entries — healthy behaviour
- **Build**: deployed at v1.12.15
- **Token usage**: $5.79 April 2026 (1.3M/127K tokens)

## All Changes This Session

### Wardrobe — 7 new garments added to Supabase (Apr 9 2026)
1. Timberland Navy Chino — W36L32 slim, TB0A2BYY, contexts: smart-casual/shift
2. Timberland Khaki Chino — W36L32 slim, TB0A2BYY, contexts: smart-casual/casual
3. Timberland Olive Jogger — W36L32 elasticated, TB0A2BYY, contexts: casual
4. Kiral Stone Pinstripe Shirt — VG-3010, XL, 55% rayon/35% nyl/10% sp, contexts: smart-casual
5. Kiral Ecru/Blue Pinstripe Shirt — VG-3010, XL, same blend, contexts: smart-casual
6. Gant Cream Geometric Print Shirt — 3260041, L, cotton-linen, contexts: smart-casual/riviera
7. Gant Indigo Check Shirt — 3260079, XL, cotton-linen, indigo-dyed, contexts: smart-casual/casual

### v1.12.14 — clinic context removal
- Removed `clinic` from TodayPanel context pills
- Removed `clinic` from WeekPlanner context list + CONTEXT_LABELS
- Removed clinic formality target from scoring.js
- Removed `clinic` from FORMAL_CONTEXTS in outfitBuilder (formal/hospital-smart-casual/shift only)
- Replaced `context === "clinic"` formal checks (2x) in outfitBuilder
- Replica penalty now only fires for formal/hospital-smart-casual/shift
- DB: all garment contexts migrated (clinic → smart-casual) via SQL UPDATE
- Rationale: Israeli inpatient geriatrics ward has no dress code — smart-casual is already overdressed

### v1.12.15 — SKILL.md + IMPROVEMENTS.md updated
- SKILL_watch_advisor2.md updated to reflect v1.12.15 state
- Garment count: 81, clinic context: removed, strap-shoe: dead

## Tailor Status (Apr 9 2026)
| Piece | Status |
|-------|--------|
| Pavarotti jacket waist | Returned ✅ |
| Nautica shirt torso | Returned ✅ |
| Tommy shirt chest | Returned ✅ |
| Kiral white sleeves | Returned ✅ |
| Gant Oxford cuffs | NOT DONE — needs to go back |

## Pending
1. BulkTagger re-run on 7 new garments for better tag refinement
2. Rikka bracelet repair (watchmaker + Seiya Japan — status pending)
3. Pasha navy alligator + BB41 navy/olive canvas (DayDayWatchband — pending delivery)
4. GP Laureato Infinite Grey Grand Feu — primary acquisition target (₪65K)
5. Gant Oxford back to tailor for cuffs
