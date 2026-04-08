# watch-advisor2
https://watch-advisor2.netlify.app/

A **watch-first** outfit planning app seeded with a real watch collection.

The watch is the center of everything. The app picks today's watch first, then builds an outfit around it — not the other way around.

---

## Concept

Most wardrobe apps are clothes-first. This one isn't.

1. The engine picks **today's watch** based on your calendar events, day profile, and rotation history.
2. It then builds a **slot-based outfit** (shirt / pants / shoes / jacket) that harmonises with that watch's dial color, formality, and strap.
3. It explains why the combination works.

---

## Day profiles

The engine infers a day profile from calendar event keywords:

| Profile | Events | Target formality |
|---|---|---|
| `hospital-smart-casual` | hospital, ward, rounds, consult, clinic, medical, ICU | 7 |
| `formal` | wedding, gala, black tie, ceremony | 9 |
| `casual` | gym, run, hike, beach | 5 |
| `travel` | flight, airport, travel | 5 |
| `smart-casual` | (default / unrecognised) | 6 |

**Hospital-smart-casual** is the primary everyday context. It favours sport-elegant and dress-sport watches — Snowflake, Rikka, Laureato, Pasha, Santos Large, GMT, Speedmaster — polished but practical.

---

## Watch collection

Seeded in `src/data/watchSeed.js` with 23 watches (13 genuine, 10 replica). Never modified by sync or imports.

---

## Run

```bash
cp .env.example .env   # or create .env with your Supabase creds
npm install
npm run dev
```

## Env setup

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Supabase is **optional**. The app runs fully offline using IndexedDB.

## Tests

```bash
npm test
```

2,359 tests across 131 files — outfit engine, watch rotation, day profiles, scoring, AI functions, stores, components, and integration flows.

---

## Architecture

```
src/                    136 files, ~22,500 LOC
  app/                  bootstrap.js, AppShell.jsx
  components/           58 JSX components — UI only, no logic
  config/               scoringWeights.js, strapRules.js, weatherRules.js
  engine/               watch scoring, rotation, day profiles (legacy, active)
  outfitEngine/         PRIMARY: outfitBuilder.js, scoring.js, confidence.js,
                        explain.js, watchStyles.js, strapRecommender.js,
                        scoringFactors/ (diversity, repetition, rotation, season, weight)
  features/
    wardrobe/           photo import pipeline, classifier, garment naming
    watch/              WatchSelector.jsx
    outfits/            generateOutfit.js
    weather/            getWeather.js, weatherRules.js
  classifier/           pipeline.js, colorDetection.js, duplicateDetection.js, personFilter.js
  services/             localCache.js (IDB), supabaseSync.js, imagePipeline.js,
                        backgroundQueue.js, backupService.js, photoQueue.js, safeFetch.js
  stores/               9 Zustand stores: wardrobe, watch, history, theme, pref,
                        strap, reject, styleLearn, + historyPersistence
  domain/               contextMemory.js, rotationStats.js, preferenceLearning.js, historyWindow.js
  data/                 watchSeed.js — IMMUTABLE, never replace
  aiStylist/            claudeStylist.js — Claude API outfit critique
  workers/              photoWorker.js — image processing (currently disabled)
netlify/functions/      25 serverless functions + 3 helpers (~3,700 LOC)
  auto-heal.js          daily self-healing cron (5am UTC)
  push-brief.js         daily + weekly push notification brief (6:30am UTC)
  daily-pick.js         Claude's Pick — AI outfit recommendation
  ai-audit.js           full wardrobe audit
  wardrobe-chat.js      conversational wardrobe actions (fix tags, add straps, exclude garments)
  monthly-report.js     monthly outfit diversity report
  watch-value.js        CPW calculation + rising value identification
  skill-snapshot.js     live health endpoint
  ... (25 total)
supabase/
  schema.sql            garments, watches, history tables
```

### Startup performance

1. Load cached state from IndexedDB → render immediately.
2. Start cloud sync in the background (`setTimeout(..., 10)`).
3. Merge cloud data into stores when it arrives.

No network call blocks first render. No images are processed at startup.

### Wardrobe import pipeline

1. File selected → `runPhotoImport(file)`
2. `processImage(file)` runs on main thread (canvas; worker disabled)
3. Generates 240×240 WebP thumbnail + dHash perceptual hash
4. Original file queued for background IndexedDB caching
5. Garment object returned immediately — UI never freezes

### Wardrobe grid

- `react-window` `FixedSizeGrid` — only visible cells rendered
- `loading="lazy"` + `decoding="async"` on all images
- Thumbnails only — never full-size originals
- `React.memo` on grid cells

---

## Recent changes (April 2026)

### v1.12.12
- **Wardrobe chat actions** — chat can now fix garment tags, add straps, exclude garments, fix history entries
- **Strap-shoe rule disabled** — removed hard veto; shoe scoring now independent
- **Garment picker collapsed** by default in outfit builder
- **Rating backlog cleared** — stale nudge ratings removed
- **JLC Reverso** — brown alligator strap added
- **TodayPanel / WatchDashboard** — ReferenceError crashes resolved
- **Tests:** 2,311 → 2,359 (+48), files 130 → 131
  - `weatherService.test.js` — 14 new tests: `getLayerTransition()`, WeatherBadge hourly display
  - `weekPlannerLogic.test.js` — 9 new tests: OutfitSlotChip "None — remove", `_isLogged` per-slot overrides

### v1.12.10–v1.12.11
- Score persistence, slot removal, strap add, nudge dismiss, rating UX fixes
- Retired watches in picker, header count, vibe labels, dial flip, strap nag

### v1.12.9 (March–April 2026)
- Monthly report function: watch diversity ratio, caching
- Wardrobe chat function: CORS, auth, conversation history
- Watch value function: CPW calculation, rising value identification
- ClaudePick component: slot filtering, score colors, weather display
- Auto-heal: tuning cap isolation, orphan reset, stagnation detection
- Scoring weights: `neverWornRecencyScore` 0.75→0.50, `neverWornRotationPressure` 0.70→0.50

---

## Supabase schema

See `supabase/schema.sql`.

Tables: `watches`, `garments`, `history`.

---

## Codebase metrics

| Metric | Value |
|--------|-------|
| Version | 1.12.12 |
| Source files | 136 |
| Source LOC | ~22,500 |
| Test files | 131 |
| Tests | 2,359 |
| Test pass rate | 100% |
| Netlify functions | 25 (+3 helpers) |
| Components | 58 JSX |
| Zustand stores | 9 |
| Build output | ~570 kB (167 kB gzip) |
| Live | https://watch-advisor2.netlify.app |
| Last audited | 2026-04-08 |
