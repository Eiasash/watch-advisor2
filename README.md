# watch-advisor2

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

Seeded in `src/data/watchSeed.js` with 13 genuine pieces. Never modified by sync or imports.

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

23 tests covering outfit engine, watch rotation, day profile mapping, and edge cases.

---

## Architecture

```
src/
  app/           bootstrap + orchestration only
  components/    UI only — no logic
  engine/        scoring, rotation, day profiles, outfit generation
  features/
    wardrobe/    photo import pipeline
  services/      cache (IndexedDB), Supabase sync, image pipeline
  stores/        Zustand state (watches, wardrobe, history)
  workers/       photoWorker.js — thumbnail + hash off the main thread
  data/          watchSeed.js — never replaced
```

### Startup performance

1. Load cached state from IndexedDB → render immediately.
2. Start cloud sync in the background (`setTimeout(..., 10)`).
3. Merge cloud data into stores when it arrives.

No network call blocks first render. No images are processed at startup.

### Wardrobe import pipeline

1. File selected → `runPhotoImport(file)`
2. `processImage(file)` dispatches to a Web Worker (canvas fallback if worker unavailable)
3. Worker generates 240×240 WebP thumbnail + dHash perceptual hash
4. Original file queued for background IndexedDB caching
5. Garment object returned immediately — UI never freezes

### Wardrobe grid

- `react-window` `FixedSizeGrid` — only visible cells rendered
- `loading="lazy"` + `decoding="async"` on all images
- Thumbnails only — never full-size originals
- `React.memo` on grid cells

---

## Supabase schema

See `supabase/schema.sql`.

Tables: `watches`, `garments`, `history`.
