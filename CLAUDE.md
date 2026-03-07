# Watch Advisor 2 — Claude Code Context

## What this app is
Watch-first outfit planner PWA. The watch is chosen first; everything else (outfit, strap, garment pairing) derives from it. Personal daily-use tool for a physician with a 23-watch collection (13 genuine, 10 replica).

Live: https://watch-advisor2.netlify.app  
Repo: https://github.com/Eiasash/watch-advisor2  
Stack: React 18 (createElement, no JSX except .jsx files) + Vite 5 + Zustand + IndexedDB + Supabase + Netlify Functions

---

## Architecture — strict, do not violate

```
src/
  app/            bootstrap.js (boot sequence), AppShell.jsx (layout + tabs)
  components/     UI only — no business logic
    WatchDashboard.jsx     today's watch + outfit builder + AI stylist
    WardrobeGrid.jsx       garment grid, filter tabs, multiselect, lightbox
    WardrobeInsights.jsx   stats snapshot
    ImportPanel.jsx        gallery/camera import, dHash dedup, angle grouping
    GarmentEditor.jsx      edit garment: type, color, brand, notes, angles
    WeekPlanner.jsx        7-day rotation + on-call calendar
    AuditPanel.jsx         AI wardrobe audit
    Header.jsx, SyncBar.jsx, ToastProvider.jsx, CommandPalette.jsx, ...
  engine/         scoring, rotation, day profiles — pure functions
  outfitEngine/   outfitBuilder.js, scoring.js, watchStyles.js — pure
  features/
    wardrobe/     classifier.js (pixel + dHash), garmentNamer.js
    watch/        WatchSelector.jsx
    outfits/      generateOutfit.js
    weather/      weatherApi.js
  classifier/     pipeline.js (master import pipeline), normalizeType.js,
                  duplicateDetection.js, personFilter.js
  services/
    localCache.js    IndexedDB state/images/planner stores
    supabaseSync.js  pullCloudState, pushGarment, pushHistoryEntry
    imagePipeline.js thumbnail + dHash generation
    photoQueue.js    original full-res cache queue
    backgroundQueue.js  IDB-persisted task queue (survives tab close)
    backupService.js    weekly automated backup to IDB
  stores/
    wardrobeStore.js  garments, selectMode, weekCtx, onCallDates
    watchStore.js     watches, activeWatch
    historyStore.js   outfit history entries
    themeStore.js     dark/light mode
  data/
    watchSeed.js  ← NEVER REPLACE. 23 watches (13 genuine, 10 replica). Sacred.
  aiStylist/      claudeStylist.js — builds prompt + calls Netlify function
  workers/        photoWorker.js — image processing worker (USE_WORKER=false currently)
netlify/functions/
  claude-stylist.js   AI outfit critique via Claude API
  classify-image.js   Claude Vision fallback for low-confidence garments
  ai-audit.js         full wardrobe audit via Claude API
supabase/
  schema.sql      garments, watches, history tables
```

---

## Rules — always enforce

### Data model
- **Garment canonical types:** `shirt | pants | shoes | jacket | sweater | belt | sunglasses | hat | scarf | bag | accessory | outfit-photo`
- **Outfit slot types (only these appear in outfit):** `shirt, pants, shoes, jacket` — accessories never slot in
- **Leather coordination rule (non-negotiable):** brown strap → brown shoes; black strap → black shoes; metal bracelet → any footwear
- **watchSeed.js is immutable.** Never touch it.

### Persistence
- All garments saved to IDB via `setCachedState({ garments })` AND pushed to Supabase via `pushGarment()`
- `pullCloudState()` must NEVER overwrite non-empty local state with empty cloud state (data wipe bug guard)
- `_localOnly: true` flag on pullCloudState means skip all cloud → local sync

### Classifier
- `classifyFromFilename`, `findPossibleDuplicate`, `_applyDecision` — pure, sync, exported for tests
- `analyzeImageContent`, `extractDominantColor` — async canvas operations
- `normalizeType()` in `src/classifier/normalizeType.js` maps aliases to canonical types
- Flat-lay detection: `total > 140 && zoneSpread < 0.18` → if `botF > topF + 0.08` → pants, else shirt
- Pants rule: `topF < 0.15 && topNB < 12 && midF+botF > 0.85 && total 90–500`
- Accessories detected via Claude Vision fallback or filename; never by pixel zones

### Tests — auto-expansion mandatory
- **527+ tests across 24+ files** — run `npm test` to see current count
- Test mock architecture is frozen — do not change how mocks are structured
- Always run `npm test` before every push. ALL tests must pass.
- **Auto-expand rule:** Every feature, improvement, or bug fix MUST include new or updated tests:
  - New function → unit tests for happy path + edge cases + error handling
  - Bug fix → regression test that reproduces the bug before the fix
  - New component logic → test the core behavior (not just rendering)
  - Modified scoring/engine logic → boundary tests + property tests
- After adding tests, update the test count in this section
- Test files live in `tests/` — name pattern: `tests/<module>.test.js`
- Run `/wa-audit` after significant changes to verify full coverage

### Mobile-first UX rules
- Bottom tab bar on ≤600px (fixed, safe-area-inset-bottom)
- No horizontal scroll in any view
- Import = two side-by-side tap targets (Gallery + Camera), minimum 80px height
- No desktop-only elements visible on mobile (Compare dropdown hidden ≤600px)
- All buttons minimum 44px touch target

### Commit discipline
- `npm test && npm run build` must both pass before every `git push`
- Commit messages: `fix: description\n\nbullet list of changes\n\n{N}/140 tests`
- Never push broken builds

---

## Known issues / context

### Classifier weak spots
- Belts from camera roll: pixel classifier can't detect them. Falls through to Claude Vision fallback.
- Selfie/outfit photos: detected by filename keyword only (`selfie|mirror|ootd|outfit|IMG_`). Pixel zones cannot distinguish person from garment.
- Flat-lay pants: fixed via `botF > topF + 0.08` zone bias in `_applyDecision`.

### Supabase
- Garments table uses column `category` (not `type`) — `pushGarment` maps `garment.type → category`
- `pullCloudState` maps `row.category → type` on return
- `thumbnail_url` not `thumbnail` in DB; `photo_url` not `photoUrl`
- No Supabase migrations dir — schema managed manually via `supabase/schema.sql`

### Performance
- `USE_WORKER=false` in `imagePipeline.js` — OffscreenCanvas not enabled yet
- Cloud pull fires 10ms after boot — must be non-destructive (guard in bootstrap.js)
- Thumbnails (base64 data URLs) are the persistent display source; `photoUrl` (blob:) ephemeral

---

## Commands available

| Command | Purpose |
|---------|---------|
| `/wa-audit` | Full codebase audit: types, persistence, classifier, tests, mobile, build |
| `/wa-fix` | Apply targeted fix for a specific issue |
| `/wa-deploy` | Run tests, build, commit, push |
| `/wa-test` | Run tests and summarise failures with root cause |

---

## Environment

- Node 20, npm
- `npm test` → vitest (527+ tests)
- `npm run build` → vite build → `dist/`
- Netlify auto-deploys from `main` branch pushes
- No `.env` in repo — Netlify env vars: `CLAUDE_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
