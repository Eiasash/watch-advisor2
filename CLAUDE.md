# Watch Advisor 2 — Claude Code Context

## What this app is
Watch-first outfit planner PWA. The watch is chosen first; everything else (outfit, strap, garment pairing) derives from it. Personal daily-use tool for a physician with a 23-watch collection (13 genuine, 10 replica).

Live: https://watch-advisor2.netlify.app
Repo: https://github.com/Eiasash/watch-advisor2
Stack: React 18 (createElement, no JSX except .jsx files) + Vite 7 + Zustand 4 + IndexedDB (idb) + Supabase + Netlify Functions

---

## Architecture — strict, do not violate

```
src/                          68 files, ~10,200 LOC
  app/            bootstrap.js (boot sequence), AppShell.jsx (layout + tabs)
  components/     UI only — no business logic (23 JSX files)
    WatchDashboard.jsx     today's watch + outfit builder + AI stylist
    WardrobeGrid.jsx       garment grid, filter tabs, multiselect, lightbox
    WardrobeInsights.jsx   stats snapshot
    ImportPanel.jsx        gallery/camera import, dHash dedup, angle grouping
    GarmentEditor.jsx      edit garment: type, color, brand, notes, angles, patterns, seasons
    WeekPlanner.jsx        7-day rotation + on-call calendar
    AuditPanel.jsx         AI wardrobe audit + PhotoVerifierPanel (type filter pills)
    SelfiePanel.jsx        selfie/outfit extraction
    OccasionPanel.jsx      occasion-based outfit suggestions
    OccasionPlanner.jsx    occasion planning flow
    StrapPanel.jsx         strap management + wrist shots
    WatchCompare.jsx       side-by-side watch comparison
    WatchIDPanel.jsx       watch identification from photos (passes collection context)
    StatsPanel.jsx         wardrobe statistics
    SettingsPanel.jsx      app settings + AI Garment Tagger section
    OutfitHistory.jsx      past outfit log
    OutfitGallery.jsx      outfit/selfie photo gallery (All / Logged / Standalone filters)
    BulkTaggerPanel.jsx    bulk AI tagger (seasons/contexts/material/pattern, batches of 8)
    InstallPrompt.jsx      PWA install prompt (intercepts beforeinstallprompt)
    Header.jsx, SyncBar.jsx, ToastProvider.jsx, CommandPalette.jsx,
    LoadingSkeleton.jsx, ScrollToTop.jsx, TodayPanel.jsx
  engine/         scoring, rotation, day profiles — pure functions
    calendarWatchRotation.js  calendar-aware watch selection
    dayProfile.js             day profile inference + watch scoring
    outfitEngine.js           outfit generation from watch + wardrobe
    watchRotation.js          basic rotation: pickWatch, pickWatchPair
    weekRotation.js           7-day rotation: genWeekRotation
  outfitEngine/   outfitBuilder.js, scoring.js, watchStyles.js — pure
    outfitBuilder.js  watch-driven outfit assembly with reject/diversity logic
    scoring.js        colorMatch, formalityMatch, strapShoeScore, weatherLayer
    watchStyles.js    STYLE_TO_SLOTS, STYLE_FORMALITY_TARGET maps
  features/
    wardrobe/     classifier.js (pixel + dHash), garmentNamer.js, isOutfitPhoto.js,
                  normalizeType.js, photoImport.js
    watch/        WatchSelector.jsx
    outfits/      generateOutfit.js
    weather/      getWeather.js, weatherRules.js
  classifier/     pipeline.js (master import pipeline), normalizeType.js,
                  duplicateDetection.js, personFilter.js
  services/
    localCache.js      IndexedDB state/images/planner stores
    supabaseSync.js    pullCloudState, pushGarment, pushHistoryEntry
    supabaseClient.js  Supabase client singleton
    imagePipeline.js   thumbnail + dHash generation
    photoQueue.js      original full-res cache queue
    backgroundQueue.js IDB-persisted task queue (survives tab close)
    backupService.js   weekly automated backup to IDB
  stores/
    wardrobeStore.js    garments, selectMode, weekCtx, onCallDates
    watchStore.js       watches, activeWatch
    historyStore.js     outfit history entries
    themeStore.js       dark/light mode
    prefStore.js        preference learning (color + type weights, decay)
    strapStore.js       strap management per watch (photos, wrist shots, custom straps)
    rejectStore.js      rejected outfit tracking (30-day TTL, 200-entry cap)
    styleLearnStore.js  style learning (nudge +0.02, decay ×0.98)
  data/
    watchSeed.js  ← NEVER REPLACE. 23 watches (13 genuine, 10 replica). Sacred.
  aiStylist/      claudeStylist.js — builds prompt + calls Netlify function
  workers/        photoWorker.js — image processing worker (USE_WORKER=false currently)
netlify/functions/           15 serverless functions, ~1,350 LOC
  _claudeClient.js     Claude API client helper (shared)
  _blobCache.js        Netlify Blobs caching layer (shared)
  bulk-tag.js          bulk garment tagger — seasons/contexts/material/pattern (Haiku)
  claude-stylist.js    AI outfit critique via Claude API
  classify-image.js    Claude Vision fallback for low-confidence garments
  ai-audit.js          full wardrobe audit via Claude API
  detect-duplicate.js  AI duplicate detection
  extract-outfit.js    extract outfit items from selfie photos
  generate-embedding.js  vector embeddings (future use)
  occasion-planner.js  occasion-based outfit suggestions
  relabel-garment.js   AI garment re-labeling
  selfie-check.js      validate selfie photos
  verify-garment-photo.js  validate garment photos
  watch-id.js          identify watches from photos (collection context + fixed cache key)
  watch-rec.js         watch recommendations
supabase/
  schema.sql      garments, watches, history tables
```

---

## Rules — always enforce

### Data model
- **Garment canonical types:** `shirt | pants | shoes | jacket | sweater | belt | sunglasses | hat | scarf | bag | accessory | outfit-photo`
- **Outfit slot types (only these appear in outfit):** `shirt, pants, shoes, jacket` — accessories never slot in
- **Sweater layer:** separate from shirt slot, added when `tempC < 22`. Second `layer` slot added when `tempC < 12` (picks second-best sweater-type garment)
- **Leather coordination rule (non-negotiable):** brown strap → brown shoes; black strap → black shoes; metal bracelet → any footwear
- **watchSeed.js is immutable.** Never touch it.

### Scoring system
- `scoreGarment = colorMatch×2 + formalityMatch×3 + watchCompat×3 + weatherLayer`
- Shoes multiply by `strapShoeScore` (0.0 on strap-shoe mismatch = hard veto)
- Style-learn multiplier (0.85–1.15) applied from `styleLearnStore`
- Diversity penalty: -0.12 per recent appearance (last 5 outfits)
- Reject penalty: -0.3 for recently rejected watch+garment combos

### Persistence
- All garments saved to IDB via `setCachedState({ garments })` AND pushed to Supabase via `pushGarment()`
- `pullCloudState()` must NEVER overwrite non-empty local state with empty cloud state (data wipe bug guard)
- `_localOnly: true` flag on pullCloudState means skip all cloud → local sync
- Stores self-persist: strapStore subscribes to changes, prefStore/rejectStore/styleLearnStore persist in their mutation methods

### Classifier
- `classifyFromFilename`, `findPossibleDuplicate`, `_applyDecision` — pure, sync, exported for tests
- `analyzeImageContent`, `extractDominantColor` — async canvas operations
- `normalizeType()` in `src/classifier/normalizeType.js` maps aliases to canonical types
- Flat-lay detection: `total > 140 && zoneSpread < 0.18` → if `botF > topF + 0.08` → pants, else shirt
- Pants rule: `topF < 0.15 && topNB < 12 && midF+botF > 0.85 && total 90–500`
- Accessories detected via Claude Vision fallback or filename; never by pixel zones

### Tests — auto-expansion mandatory
- **2051+ tests across 111 files** — run `npm test` to see current count
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

### Test file inventory (111 files)
```
tests/
  setup.js                     vitest global setup — IndexedDB stub for jsdom
  addOutfitModal.test.js       AddOutfitModal garment selection, slot swap, confirm payload, entry creation
  additionalStores.test.js     rejectStore, styleLearnStore, prefStore, themeStore
  aiDupeDetection.test.js      AI duplicate detection function
  appShell.test.js             AppShell component
  auditPanel.test.js           AuditPanel component
  backgroundQueue.test.js      IDB task queue
  backgroundQueueEdge.test.js  FIFO ordering, failure isolation, retry, no-handler
  backupService.test.js        backup service
  blobCache.test.js            Netlify Blobs cache
  bootstrap.test.js            boot sequence data wipe guard + blob cleanup + state restore
  bulkPhotoMatcher.test.js     bulk photo matcher
  bulkTag.test.js              bulk tag function
  calendarWatchRotation.test.js      calendar-aware watch selection
  calendarWatchRotationEdge.test.js  calendar rotation edge cases
  classifier.test.js           pixel classifier
  classifierBoundary.test.js   pants total/topF boundaries, flat-lay zoneSpread/botF, shoes terminal
  classifierPipeline.test.js   master import pipeline
  claudeClient.test.js         shared Claude API client (retry, backoff, error handling)
  claudeStylist.test.js        AI stylist function
  claudeStylistError.test.js   AI stylist error handling
  colorDetection.test.js       color extraction
  colorMaterialDetection.test.js  color/material detection
  colorsMultilayerHiRes.test.js  multi-layer color scoring
  commandPalette.test.js       search/filter logic, deduplication, result merging
  confidence.test.js           outfit confidence scoring
  contextMemory.test.js        context memory + repetition penalty
  dayProfile.test.js           day profile inference + scoring
  dayProfileEdge.test.js       day profile keyword + scoring boundaries
  duplicateDetection.test.js   dHash duplicate detection
  eidFamilyContext.test.js    eid-celebration/family-event context scoring + shoe rule relaxation
  explain.test.js              outfit explanation engine
  extractOutfit.test.js        outfit extraction from selfies (scoring, dedup, confidence)
  garmentDaysIdle.test.js      garment idle days calculation
  garmentEditor.test.js        canonicalType mapping, buildAutoName generation
  garmentNamer.test.js         garment naming
  generateEmbedding.test.js    vector embedding generation
  generateOutfit.test.js       outfit generation
  getWeather.test.js           weather API
  historyStore.test.js         history store upsert/remove
  historyWindow.test.js        calendar-day history window + recentWatchIds
  emptyHistoryJitter.test.js   empty-history jitter boost + bootstrap sync error
  imagePipeline.test.js        thumbnail + dHash pipeline
  importPanel.test.js          import panel logic
  integrationImportFlow.test.js      classify → normalize → store → sync chain
  integrationOutfitGeneration.test.js  dayProfile → pickWatch → scoreGarment end-to-end
  integrationRejectRelearn.test.js     reject → isRejected → styleLearn → preferenceMultiplier
  integrationStrapShoeVeto.test.js     strap → shoe scoring → outfit veto integration
  integrationWeatherOutfit.test.js     weather → outfit engine → sweater layer integration
  isOutfitPhoto.test.js        outfit photo detection
  localCache.test.js           IndexedDB cache
  localCacheEdge.test.js       IDB error resilience, corrupt data, concurrent writes
  netlifyfunctions.test.js     Netlify function handlers (1)
  netlifyfunctions2.test.js    Netlify function handlers (2) + hardened error paths
  normalizeType.test.js        type normalization
  outfitBuilder.edge.test.js   outfit builder edge — all-fail fallback, metadata
  outfitBuilder.test.js        outfit builder
  outfitBuilderCoverage.test.js  outfit builder coverage
  outfitBuilderEdge.test.js    outfit builder edge cases + sweater threshold
  outfitEngine.test.js         outfit engine
  outfitGallery.test.js        outfit gallery component
  outfitHistory.test.js        outfit history
  paletteCoherence.test.js     cross-slot palette coherence
  persistence.test.js          history persistence (IDB-first writes)
  personFilter.test.js         person/selfie filter
  photoQueue.test.js           photo queue
  preferenceLearning.test.js   preference weight learning
  pushBrief.test.js            push-brief scheduled function
  pushService.test.js          client push service
  pushSubscribe.test.js        push-subscribe function
  recommendationConfidence.test.js  recommendation confidence levels
  regressionMarch2026.test.js  March 2026 regression tests
  regressionOutfitEngine.test.js  outfit engine regressions
  rotationImprovements.test.js rotation improvement logic
  rotationPressure.test.js     rotation pressure scoring
  rotationStats.test.js        rotation statistics
  scenarioForecast.test.js     scenario-based forecast
  scoring.test.js              garment scoring
  scoringEdge.test.js          strap-shoe edge cases + all dial colors
  scoringFactors.test.js       modular scoring factors
  selfiePanel.test.js          selfie panel component
  settingsPanel.test.js        backup/export serialization (JSON, CSV, backup format)
  shuffleNotesPhoto.test.js    shuffle exclusion, layer logic, history notes
  statsPanel.test.js           stats computation (frequency, streak, cold bench, CPW)
  stores.test.js               wardrobeStore, watchStore, historyStore
  strapPanel.test.js           strap panel component
  strapStore.test.js           strap store
  supabaseSync.test.js         Supabase sync (pull, push)
  supabaseSyncCrud.test.js     uploadPhoto, deleteGarment, fuzzy/semantic search
  tailorFlag.test.js           tailor flag detection + exclusion from formal contexts
  syncBar.test.js              sync bar component
  todayPanel.test.js           daysSinceWorn, garment type ordering
  utilizationScore.test.js     utilization scoring
  wardrobeGrid.test.js         TYPE_FILTER predicates, search filtering

  wardrobeStoreActions.test.js setGarments, setWeekCtx, setOnCallDates, navigation, select mode
  watchCompare.test.js         watch comparison component
  watchDashboardAiApply.test.js  AI suggestion apply logic
  watchRotationEdge.test.js    pickWatch/pickWatchPair edge cases
  watchRotationEngine.test.js  pickWatch, pickWatchPair
  watchSeed.test.js            watch seed validation
  watchStore.test.js           setWatches, setActiveWatch
  watchStoreEdge.test.js       watch store edge cases
  watchStyles.test.js          watch styles
  weatherRules.test.js         weather rules
  weatherService.test.js       weather service
  weekOutfitRotation.test.js   week outfit rotation
  weekPlannerLogic.test.js     outfit slots, accessory types, wearable garment filtering
  weekRotation.test.js         genWeekRotation
  weekRotationEdge.test.js     week rotation structure + inactive + on-call
```

### Mobile-first UX rules
- Bottom tab bar on ≤600px (fixed, safe-area-inset-bottom)
- No horizontal scroll in any view
- Import = two side-by-side tap targets (Gallery + Camera), minimum 80px height
- No desktop-only elements visible on mobile (Compare dropdown hidden ≤600px)
- All buttons minimum 44px touch target

### Commit discipline
- `npm test && npm run build` must both pass before every `git push`
- Commit messages: `fix: description\n\nbullet list of changes\n\n{N} tests`
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

### Service Worker
- SW registration in main.js has reload-loop guard (sessionStorage counter, 3 reloads in 10s = bail)
- SW install event does NOT call self.skipWaiting() — main thread sends SKIP_WAITING message when ready
- App shell uses network-first caching (broken build recovery)
- Three caches: shell (wa2-shell-v5), images (wa2-images-v3), API (wa2-api-v3)

### Performance
- `USE_WORKER=false` in `imagePipeline.js` — OffscreenCanvas not enabled yet
- Cloud pull fires 10ms after boot — must be non-destructive (guard in bootstrap.js)
- Thumbnails (base64 data URLs) are the persistent display source; `photoUrl` (blob:) ephemeral
- Main bundle ~571 kB (167 kB gzipped) — WeekPlanner lazy-loaded

### UI bugs (unfixed)
- None currently.

### No TODOs or FIXMEs in source
- The codebase has no inline TODO/FIXME/HACK/XXX comments
- All known issues are tracked in this file
- The only feature flag is `USE_WORKER=false` in `imagePipeline.js`

---

## Codebase metrics

| Metric | Value |
|--------|-------|
| Source files | 71 |
| Source LOC | ~8,600 |
| Test files | 111 |
| Test LOC | ~17,600 |
| Tests | 2051+ |
| Test pass rate | 100% |
| Netlify functions | 15 (+2 helpers) |
| Components | 26 JSX |
| Zustand stores | 8 |
| Build output | 571 kB (167 kB gzip) |

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

- Node 22, npm
- `npm test` → vitest (939+ tests)
- `npm run build` → vite build → `dist/`
- Netlify auto-deploys from `main` branch pushes
- No `.env` in repo — Netlify env vars: `CLAUDE_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Dependencies: react 18, react-dom 18, zustand 4, @supabase/supabase-js 2, idb 8, react-window 1
- DevDeps: vite 7, vitest 4, @vitejs/plugin-react 5, jsdom 28, @netlify/blobs 10
