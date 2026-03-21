# SKILL — Watch Advisor 2

> Auto-generated skill file. Updated by `/update-skill` command.
> Do NOT edit manually — run `/update-skill` to refresh from codebase + Supabase.

---

## §1 Overview

| Metric | Value |
|--------|-------|
| Version | 1.4.0 |
| Stack | React 18 + Vite 7 + Zustand 4 + IndexedDB + Supabase + Netlify Functions |
| Source files | 71 |
| Source LOC | ~8,600 |
| Test files | 113 |
| Tests | 2084+ |
| Netlify functions | 14 (+2 helpers) |
| Components | 26 JSX |
| Zustand stores | 8 |
| Build output | 571 kB (167 kB gzip) |
| Live URL | https://watch-advisor2.netlify.app |

---

## §2 Architecture

```
src/
  app/            bootstrap.js, AppShell.jsx
  components/     26 JSX UI components (no business logic)
  engine/         scoring, rotation, day profiles — pure functions
  outfitEngine/   outfit builder, scoring, watch styles — pure
  features/       wardrobe (classifier, namer), watch, outfits, weather
  classifier/     pipeline.js, normalizeType.js, duplicateDetection.js, personFilter.js
  services/       localCache (IDB), supabaseSync, imagePipeline, photoQueue, backgroundQueue, backupService
  stores/         8 Zustand stores (wardrobe, watch, history, theme, pref, strap, reject, styleLearn)
  data/           watchSeed.js (IMMUTABLE — 23 watches)
  aiStylist/      claudeStylist.js
  workers/        photoWorker.js (USE_WORKER=false)
netlify/functions/  14 serverless functions
supabase/           migrations/ (SQL audit trail)
```

---

## §3 Scoring System (last audited: 2026-03-21)

### Base formula
```
scoreGarment = (colorMatch × 2.5) + (formalityMatch × 3) + (watchCompatibility × 3) + (weatherLayer × 1) + (contextFormality × 1.5)
```

### Modifiers
| Modifier | Value | Source |
|----------|-------|--------|
| rotationFactor weight | ×0.40 | `src/outfitEngine/scoringFactors/rotationFactor.js` |
| repetitionPenalty | -0.28 (if worn in recent window) | `src/domain/contextMemory.js` |
| diversityPenalty | -0.12 per recent appearance (last 5) | outfit builder |
| rejectPenalty | -0.3 for rejected watch+garment combos | rejectStore |
| seasonMatch | +0.3 | scoringWeights snapshot |
| contextMatch | +0.25 | scoringWeights snapshot |

### Style-learn multiplier
Range: 0.85–1.15 (nudge +0.02, decay ×0.98). Never overrides hard constraints.

### Watch recency scoring (dayProfile.js)
| Condition | recencyScore |
|-----------|-------------|
| Worn in last 7 days (recentIds) | 0.0 |
| Never worn (idle = Infinity) | 0.75 |
| Otherwise | `min(idle / 14, 1.0)` — linear 0→1 over 14 days |

### Rotation pressure (rotationStats.js)
| Input | Output |
|-------|--------|
| daysIdle = 0 | ~0.02 |
| daysIdle = 14 | 0.50 |
| daysIdle = 28 | ~0.88 |
| daysIdle = Infinity (never worn) | 0.70 |
| Formula (finite) | `1 / (1 + exp(-0.25 × (daysIdle - 14)))` |

### Hard constraints
- **Leather coordination (non-negotiable):** brown strap → brown shoes; black strap → black shoes; metal bracelet → any
- **strapShoeScore:** 0.0 on mismatch = hard veto (shoes multiplied by this score)
- **Sweater layer:** added when tempC < 22; second layer when tempC < 12

---

## §4 Data Model

### Garment canonical types
`shirt | pants | shoes | jacket | sweater | belt | sunglasses | hat | scarf | bag | accessory | outfit-photo`

### Outfit slot types (only these in outfit)
`shirt, pants, shoes, jacket` — accessories never slot in.

### Watch collection
23 watches (13 genuine, 10 replica) defined in `src/data/watchSeed.js` — **IMMUTABLE, never touch**.

---

## §5 Supabase Schema

- Garments table column: `category` (not `type`) — `pushGarment` maps `garment.type → category`
- `pullCloudState` maps `row.category → type` on return
- `thumbnail_url` (not `thumbnail`) in DB; `photo_url` (not `photoUrl`)
- No migrations dir — schema managed via `supabase/migrations/` (committed after every apply_migration)

### Current counts (as of 2026-03-21)
- **Active garments:** 76
- **History entries:** 19 (6 legacy with empty garmentIds, stamped legacy:true)
- **Orphaned history:** 0 (legacy entries excluded from health check)

---

## §6 Persistence Rules

1. All garments saved to IDB via `setCachedState({ garments })` AND pushed to Supabase via `pushGarment()`
2. `pullCloudState()` must NEVER overwrite non-empty local state with empty cloud state (data wipe guard)
3. `_localOnly: true` flag on pullCloudState means skip all cloud → local sync
4. Stores self-persist: strapStore subscribes to changes; prefStore/rejectStore/styleLearnStore persist in their mutation methods

---

## §7 Classifier

- `classifyFromFilename`, `findPossibleDuplicate`, `_applyDecision` — pure, sync, exported for tests
- `analyzeImageContent`, `extractDominantColor` — async canvas operations
- `normalizeType()` in `src/classifier/normalizeType.js` maps aliases to canonical types
- Flat-lay detection: `total > 140 && zoneSpread < 0.18` → if `botF > topF + 0.08` → pants, else shirt
- Pants rule: `topF < 0.15 && topNB < 12 && midF+botF > 0.85 && total 90–500`
- Accessories detected via Claude Vision fallback or filename; never by pixel zones

---

## §8 Gotchas & Quick-Reference Values

### Scoring weights (source of truth: `src/config/scoringWeights.js`)
```js
colorMatch:         2.5
formalityMatch:     3
watchCompatibility: 3
weatherLayer:       1
contextFormality:   1.5
```

### Key constants
| Constant | Value | File |
|----------|-------|------|
| rotationFactor weight | 0.40 | `src/outfitEngine/scoringFactors/rotationFactor.js` |
| repetitionPenalty | -0.28 | `src/domain/contextMemory.js` |
| diversityPenalty | -0.12/appearance | outfit builder |
| rejectPenalty | -0.3 | rejectStore |
| neverWornRecencyScore | 0.75 | `src/engine/dayProfile.js` |
| neverWornRotationPressure | 0.70 | `src/domain/rotationStats.js` |
| styleLearning range | 0.85–1.15 | `src/config/scoringWeights.js` |
| sweater threshold | tempC < 22 | outfit engine |
| double-layer threshold | tempC < 12 | outfit engine |

### Supabase column mapping pitfalls
- `type` → `category` (garments table)
- `photoUrl` → `photo_url`
- `thumbnail` → `thumbnail_url`

### Test rules
- 2084+ tests across 113 files — ALL must pass before push
- Every feature/fix MUST include new or updated tests
- Mock architecture is frozen — do not change mock structure
- Run `npm test` before every push

### watchSeed.js
**IMMUTABLE.** 23 watches. Never modify.

### app_config JSONB gotcha
Supabase JS auto-parses JSONB columns — `data.value` is already a JS value, not a JSON string.
Never double-parse with `JSON.parse(data.value)`. The pattern in `_claudeClient.js` tries
JSON.parse first (handles quoted-string test mocks), falls back to raw value.

### DebugConsole health dashboard
`DebugConsole.jsx` fetches `/.netlify/functions/skill-snapshot` on mount.
Shows: monthly API cost, garment/history counts, health checks, wardrobe wear rate bars.
Active Claude model shown with yellow warning if "unknown".
