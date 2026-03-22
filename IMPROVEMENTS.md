# Auto-Generated Improvement Proposals
Generated: 2026-03-22

## Audit Summary
- **Engine integrity**: All 11 checks PASS
- **Supabase**: 75 active garments, 0 exact dupes, 0 orphans, app_config healthy
- **Tests**: All 2084+ passing (113 files)
- **Snapshot**: All health "ok", autoHeal healthy (ran 05:01 UTC today)
- **Crons**: 3/3 scheduled, weekly GitHub Action present
- **Build**: 571 kB (167 kB gzip)
- **Token usage**: $1.92 for March 2026

## Fixes Applied This Session
1. **Retired watch UI leak** — SBGW267, Sinn 613, Rolex Date 15203 appeared in WatchSelector dropdown, TodayPanel recommendations, WatchDashboard default, WeekPlanner modal, OnCallPlanner candidates, and neglectedGenuine(). Fixed in 6 files.

## Findings (Not Auto-Fixed)

### Watch Rotation
- Tudor BB41 worn 4/10 recent entries (40%) — exactly at stagnation threshold
- Laureato worn 2/10, Speedmaster/Snowflake/Pasha/Laco 1 each
- **Action**: Monitor. If BB41 hits 5/10 next audit, auto-heal will flag and rotationFactor may need bump to 0.45

### Garment Utilization
- **61% of wearable garments never worn** (44/72) — high but expected with only 25 history entries
- **16/20 shirts idle** — most missing season/context/material tags, invisible to scoring engine
- 3 garments worn 4x in 14 days (borderline stagnation, threshold is >5)
- **Action**: Run BulkTagger on shirt category in browser to unblock scoring. This is the single highest-impact action available.

### Fuzzy Duplicates (Same Color + Category — Not Bugs)
- 4x light blue shirts — legitimate (button, dress, micro-dot, stripe)
- 3x cream sweaters — legitimate (cable knit Kiral, plain, ribbed zip)
- 3x brown belts — legitimate (Blundstone, Italian, Sarar)
- 3x black sweaters — legitimate (cable knit Gant, hoodie, zip)
- No action needed — all are distinct garments

### Auto-Heal Health
- 1 untagged garment flagged (minor)
- Never-worn at 63% — auto-heal correctly notes sparse data, no action triggered
- All other checks: healthy

## Scoring Weights (Verified — No Changes)
| Weight | Value | Status |
|--------|-------|--------|
| rotationFactor | 0.40 | Correct |
| repetitionPenalty | -0.28 | Correct |
| neverWornRecencyScore | 0.75 | Correct |
| neverWornRotationPressure | 0.70 | Correct |
| warm/cool coherence | +0.20 | Correct |
| diversityFactor | -0.12 | Correct |

## Proposed Next Session (Ranked by Impact)
1. **BulkTagger re-run on shirts** — 16/20 shirts idle. #1 bottleneck for outfit diversity. Open app -> BulkTagger -> shirt category.
2. **Tailor follow-up** — Nautica White/Navy stripe + Tommy Hilfiger slate micro-check DB-flagged. Physical tailor visit needed.
3. **Pasha navy alligator strap** — pending DayDayWatchband delivery. Move from PENDING_STRAPS to pasha.straps[] when arrived.
4. **Tudor canvas straps** — navy + olive pending. Move to blackbay.straps[] when delivered.
5. **Scoring weight review** — if BB41 stagnation persists after 50+ entries, consider rotationFactor 0.40 -> 0.45.
