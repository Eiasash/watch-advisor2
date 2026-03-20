# Auto-Generated Improvement Proposals
Generated: 2026-03-20

## Phase 5A — Wear Pattern Analysis Findings

### 1. Watch Repetition (last 10 of 19 total entries)
| Watch | Wear Count | % of Total |
|-------|-----------|------------|
| blackbay | 4 | 21% |
| laureato | 4 | 21% |
| rikka | 2 | 11% |
| pasha | 2 | 11% |
| All others | 1 each | 5% each |

**Status:** HEALTHY — no watch exceeds 40% threshold. No rotationFactor adjustment needed.

### 2. Garment Slot Stagnation (last 14 days)
No garment worn >3 times in 14 days. All pants entries are unique.
**Status:** HEALTHY — no repetitionPenalty adjustment needed.

### 3. Context Distribution
| Context | Count | % |
|---------|-------|---|
| smart-casual | 10 | 53% |
| shift | 4 | 21% |
| clinic | 1 | 5% |
| hospital-smart-casual | 1 | 5% |
| formal | 1 | 5% |
| casual | 1 | 5% |
| eid-celebration | 1 | 5% |

**Status:** HEALTHY — well-distributed, not >80% null. Default context working.

### 4. Score Distribution
| Score | Count |
|-------|-------|
| 6.5 | 1 |
| 7.5 | 2 |
| 8.0 | 1 |
| 8.5 | 2 |
| 9.0 | 1 |

**Status:** HEALTHY — varied scores (6.5–9.0), not stuck at 7.0.

### 5. Orphaned GarmentIds
**Before patch:** 28 orphaned IDs referencing excluded/deleted garments
**After patch:** 0 orphaned IDs — all cleaned via SQL UPDATE

## Phase 5B — Weight Changes Applied
No weight changes needed — all metrics within healthy thresholds.

Current scoring weights (unchanged):
- colorMatch: 2.5
- formalityMatch: 3.0
- watchCompatibility: 3.0
- weatherLayer: 1.0
- contextFormality: 1.5

## Phase 5C — Dead Code Found

### Truly dead (zero references):
- `VersionChip` in `src/components/UpdateBanner.jsx` — exported but never imported
- `detectDominantColorFromDataURL` in `src/classifier/colorDetection.js` — async function, never called

### Test-only exports (13):
- `evictOrphanImages`, `getImage` (localCache.js)
- `computeHash`, `generateThumbnail` (imagePipeline.js)
- `clearFinished` (backgroundQueue.js)
- `listBackups`, `restoreBackup` (backupService.js)
- `DAY_PROFILES` (dayProfile.js)
- `pickWatchPair` (watchRotation.js)
- `pickWatchForCalendar` (calendarWatchRotation.js)
- `getFactors` (scoringFactors/index.js)
- `OUTFIT_TYPES`, `isAccessoryType` (normalizeType.js)

### Uncalled Netlify function:
- `watch-rec.js` — no client-side caller in src/

**Action:** Test-only exports retained for test coverage. Dead exports flagged for future cleanup.

## Phase 6 — Future-Proofing Implemented

| Priority | Feature | Status |
|----------|---------|--------|
| 1 | Supabase keep-alive cron (every 5 days) | Implemented |
| 2 | Retired watch flag | Skipped — traded watches not in watchSeed.js |
| 3 | Claude model version from app_config | Implemented |
| 4 | Token usage logging (monthly cost tracking) | Implemented |
| 5 | Storage quota check on boot (>70% warning) | Implemented |
| 6 | Outfit quality trend endpoint | Implemented |
| 7 | No-wear push notification (7-day gap) | Implemented |
| 8 | Payload schema versioning (v1 stamp) | Implemented |
| 9 | Wardrobe health score (per-category) | Implemented |

## Proposed Next Session
1. **Remove dead exports** — `VersionChip` and `detectDominantColorFromDataURL` can be safely deleted
2. **Evaluate watch-rec.js** — either wire it to client UI or remove it
3. **Add DebugConsole panel** — display monthly token cost + wardrobe health from skill-snapshot
4. **Persist storage quota warnings** — show a toast in UI when >70% storage, not just console.warn
5. **Model migration path** — test `getConfiguredModel()` fallback when Anthropic deprecates current model
