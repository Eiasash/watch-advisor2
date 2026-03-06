# CLAUDE_SETUP_watch-advisor2.md

Create or continue a repository named `watch-advisor2`.

This project is a **watch-first outfit planning application**.  
Do not reinterpret the scope.  
Do not replace the watch-first concept with a generic wardrobe app.  
Do not generate fake watch seed data.  
Use the exact watch dataset already included in `src/data/watchSeed.js`.

## Stack
Use:
- React
- Vite
- Zustand
- IndexedDB via `idb`
- Supabase optional sync
- Web workers for heavy image tasks

## Required architecture
Keep this folder structure:

- `src/app`
- `src/components`
- `src/features/watches`
- `src/features/wardrobe`
- `src/features/outfits`
- `src/features/history`
- `src/engine`
- `src/services`
- `src/stores`
- `src/workers`
- `src/data`

## Non-negotiable product rules
1. The app must be **watch-first**, not clothes-first.
2. The dashboard must recommend **today’s watch first**, then build an outfit around it.
3. The watch seed data must come from `src/data/watchSeed.js` exactly.
4. The app must load cached state first, render immediately, and only then sync in the background.
5. The wardrobe grid must use thumbnails only, lazy image loading, and virtualization.
6. Heavy image processing must never block the UI thread.
7. Business logic must stay out of the main app shell.

## Required behavior

### Bootstrap
Implement this startup flow exactly:
1. Load cached state from IndexedDB.
2. Render the UI immediately using cached state.
3. Start cloud sync in the background with `setTimeout(..., 10)` or equivalent.
4. Update Zustand stores when cloud data arrives.

Do not block first render on network calls.

### Watch rotation
Implement a watch rotation engine that:
- avoids watches worn in the last 7 outfit history entries if alternatives exist
- picks from the remaining watches deterministically or predictably
- uses `history.watchId`

### Outfit engine
Implement a slot-based outfit engine for:
- shirt
- pants
- shoes
- jacket

Score garments using:
- formality
- color harmony with dial color
- strap harmony
- weather
- diversity penalty from recent history

Also generate a short explanation string describing why the outfit works.

### Wardrobe import
Garment imports must:
1. generate a thumbnail
2. compute a perceptual hash
3. queue original file caching in the background
4. return a garment object without freezing the UI

### Grid performance
Use:
- `react-window`
- `loading="lazy"`
- `decoding="async"`
- stable keys
- `React.memo` for grid cells where appropriate

### Sync
Keep Supabase optional.
Schema should support:
- watches
- garments
- history

Store schema in `supabase/schema.sql`.

## Hard constraints
- Do not create a giant `app.js` god-file.
- Do not put API calls directly into presentational components unless routed through a dedicated service or hook.
- Do not process all images during login.
- Do not fetch full-size images for the wardrobe grid.
- Do not replace the real seeded watches with placeholders.

## Deliverables
1. A working development server.
2. The seeded watch collection visible in the app.
3. A watch dashboard showing today’s recommended watch.
4. A slot-based outfit recommendation.
5. A virtualized wardrobe grid.
6. Tests for the outfit engine.
7. Updated README.

Implement exactly this.
