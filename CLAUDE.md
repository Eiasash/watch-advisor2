# Watch Advisor 2 — Claude Code Context

## What this app is
Watch-first outfit planner PWA. The watch is chosen first; everything else (outfit, strap, garment pairing) derives from it. Personal daily-use tool for a physician with a 23-watch collection (13 genuine, 10 replica).

Live: https://watch-advisor2.netlify.app
Repo: https://github.com/Eiasash/watch-advisor2
Stack: React 18 (createElement, no JSX except .jsx files) + Vite 7 + Zustand 4 + IndexedDB (idb) + Supabase + Netlify Functions

---

## Architecture — strict, do not violate

```
src/                          146 files, ~23,000 LOC
  app/            bootstrap.js (boot sequence), AppShell.jsx (layout + tabs)
  components/     UI only — no business logic (23 JSX files)
  engine/         scoring, rotation, day profiles — pure functions
  outfitEngine/   outfitBuilder.js, scoring.js, watchStyles.js — pure
  features/       wardrobe/ watch/ outfits/ weather/
  classifier/     pipeline.js, normalizeType.js, duplicateDetection.js, personFilter.js
  services/       localCache.js, supabaseSync.js, imagePipeline.js, backgroundQueue.js
  stores/         9 Zustand stores (wardrobe, watch, history, strap, pref, reject, styleLearn, theme, debug)
  data/           watchSeed.js — NEVER REPLACE. Sacred.
  aiStylist/      claudeStylist.js
  workers/        photoWorker.js (USE_WORKER=false currently)
netlify/functions/           24 serverless functions + 3 helpers, ~3,900 LOC
supabase/                    schema.sql
```

---

## Rules — always enforce

### Data model
- **Garment canonical types:** `shirt | pants | shoes | jacket | sweater | belt | sunglasses | hat | scarf | bag | accessory | outfit-photo`
- **Outfit slot types (only these appear in outfit):** `shirt, pants, shoes, jacket`
- **Sweater layer:** added when `tempC < 22`. Second `layer` when `tempC < 12`
- **Leather coordination rule:** documented in SKILL_watch_advisor2.md as a styling guideline. The runtime veto was removed in v1.12.12 (`strapShoeScore` now returns 1.0 unconditionally). Re-enabling would mean reinstating the hard multiplier in `outfitEngine/scoring.js`.
- **watchSeed.js is immutable.** Never touch it.

### Scoring system
- `scoreGarment = colorMatch*2 + formalityMatch*3 + watchCompat*3 + weatherLayer`
- Shoes multiply by `strapShoeScore` (0.0 on mismatch = hard veto)
- Style-learn multiplier (0.85-1.15); Diversity penalty: -0.12; Reject penalty: -0.3

### Persistence
- All garments saved to IDB AND pushed to Supabase
- `pullCloudState()` must NEVER overwrite non-empty local with empty cloud
- Stores self-persist via subscription/mutation methods

### Classifier
- Flat-lay: `total > 140 && zoneSpread < 0.18` then botF > topF + 0.08 = pants, else shirt
- Pants rule: `topF < 0.15 && topNB < 12 && midF+botF > 0.85 && total 90-500`
- Accessories via Claude Vision fallback or filename only

### Tests — auto-expansion mandatory
- **3013 tests across 175 files** — run `npm test` to see current count
- Test mock architecture is frozen — do not change how mocks are structured
- Always run `npm test` before every push. ALL tests must pass.
- Test files in `tests/` — pattern: `tests/<module>.test.js`

### Mobile-first UX rules
- Bottom tab bar on <=600px; No horizontal scroll
- Import = two side-by-side tap targets (Gallery + Camera), min 80px height
- All buttons minimum 44px touch target

### Commit discipline
- `npm test && npm run build` must both pass before every `git push`

---

## Known issues / context

### Classifier weak spots
- Belts: pixel classifier can't detect. Claude Vision fallback.
- Selfie/outfit photos: filename keyword only (`selfie|mirror|ootd|outfit|IMG_`)

### Supabase
- Garments table uses `category` not `type` — pushGarment maps accordingly
- `thumbnail_url` not `thumbnail`; `photo_url` not `photoUrl`
- Schema managed manually via `supabase/schema.sql`

### Service Worker
- Reload-loop guard (3 reloads in 10s = bail)
- No self.skipWaiting() on install — main thread sends SKIP_WAITING; 30s auto-activate safety net
- Three caches: shell (wa2-shell-v10), images (wa2-images-v4), API (wa2-api-v4)
- `NO_CACHE_FUNCTIONS` list in sw.js: Claude + admin + push-subscribe endpoints pass through uncached (per-user / non-deterministic responses)

### Performance
- `USE_WORKER=false` in imagePipeline.js
- Main bundle ~571 kB (167 kB gzipped)

### No TODOs or FIXMEs in source
- All known issues tracked in this file
- Only feature flag: `USE_WORKER=false`

---

## Codebase metrics

| Metric | Value |
|--------|-------|
| Source files | 146 |
| Source LOC | ~23,000 |
| Test files | 175 |
| Test LOC | ~29,500 |
| Tests | 3013 |
| Test pass rate | 100% |
| Netlify functions | 24 (+3 helpers) |
| Components | 63 JSX |
| Zustand stores | 9 |
| Build output | ~570 kB (167 kB gzip) |

---

## Commands available

| Command | Purpose |
|---------|---------|
| `/wa-audit` | Full codebase audit |
| `/wa-fix` | Targeted fix |
| `/wa-deploy` | Test, build, commit, push |
| `/wa-test` | Test and summarise failures |
| `/wardrobe-update` | Add garments, log wears, DB audit |

---

## Test Coverage Recommendations

### Current Coverage Summary

| Area | Tests | Status |
|------|-------|--------|
| Outfit engine (builder, scoring, confidence) | ~200+ | Strong |
| Watch rotation (calendar, pressure, week) | ~150+ | Strong |
| Classifier (pixel, dHash, color, pipeline) | ~100+ | Strong |
| Stores (all 9) | ~150+ | Strong |
| Netlify functions (all 24) | ~300+ | Strong |
| Components | ~200+ | Good |
| Integration tests | ~50+ | Good |
| Domain logic (stats, styleDNA, trade) | ~80+ | Good |
| Services (IDB, Supabase, image pipeline) | ~100+ | Good |
| Scoring factors | ~40+ | Good |

### Recommended Additions (Priority Order)

1. **OffscreenCanvas / Web Worker tests** — when USE_WORKER enabled
2. **Service worker integration tests** — 3 cache layers, skip-waiting, reload guard
3. **Supabase concurrent sync tests** — race conditions, network interruptions
4. **Photo queue resilience** — task persistence across tab close/reopen
5. **Belt classifier improvement tests** — Claude Vision fallback cases
6. **Selfie extraction accuracy** — more diverse selfie scenarios
7. **Accessibility compliance tests** — 44px targets, tab bar, no horizontal scroll
8. **Monthly report edge cases** — empty month, single-watch month
9. **Trade simulator boundary tests** — extreme scenarios
10. **Push notification scheduling** — trigger timing, content, subscriptions

### Long-Term Goal
Reach **3,500+ tests** with 60% lines, 50% branches coverage.

---

## TODO / Improvement Roadmap

### High Priority
- [ ] **Fix 1 failing test** — 3012/3013 passing
- [ ] **Enable OffscreenCanvas worker** — USE_WORKER=false in imagePipeline.js
- [ ] **Raise coverage thresholds** — target 60% lines, 50% branches
- [ ] **Service worker test suite** — all 3 cache layers + update flow

### Medium Priority
- [ ] **Belt classifier improvement** — alternative detection beyond Vision fallback
- [ ] **Supabase migrations directory** — proper migration files
- [ ] **Component lazy loading expansion** — AuditPanel, StatsPanel, OutfitGallery
- [ ] **Bundle size optimization** — tree-shaking Supabase SDK
- [ ] **Watch seed versioning** — add schema version

### Low Priority
- [ ] **JSX migration** — createElement to JSX for readability
- [ ] **ESLint + Prettier config** — consistent code style
- [ ] **Storybook** — component docs + visual testing
- [ ] **Vector embeddings** — implement semantic garment search
- [ ] **Performance monitoring** — track Lighthouse scores

### Feature Roadmap
- [ ] **Occasion planning expansion** — seasonal event awareness
- [ ] **Watch maintenance tracking** — service dates, battery, strap replacement
- [ ] **Style DNA evolution** — visualize taste changes over time
- [ ] **Weather forecast integration** — multi-day forecast for week planner

---

## Environment

- Node 22, npm
- `npm test` -> vitest (3013 tests)
- `npm run build` -> vite build -> `dist/`
- Netlify auto-deploys from `main`
- Env vars: `CLAUDE_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `GITHUB_PAT`, `OPEN_API_KEY`
