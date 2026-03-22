# Hard Constraints — watch-advisor2

These constraints are absolute and must never be violated during any audit, fix, or deploy cycle.

## Data Model Invariants
- **Garment canonical types:** `shirt | pants | shoes | jacket | sweater | belt | sunglasses | hat | scarf | bag | accessory | outfit-photo`
- **Outfit slot types (only these appear in outfit):** `shirt, pants, shoes, jacket` — accessories never slot in
- **Sweater layer:** separate from shirt slot, added when `tempC < 22`. Second layer when `tempC < 12`
- **Leather coordination (non-negotiable):** brown strap → brown shoes; black strap → black shoes; metal bracelet → any

## Scoring Invariants
- `scoreGarment = colorMatch×2 + formalityMatch×3 + watchCompat×3 + weatherLayer`
- Shoes multiply by `strapShoeScore` (0.0 on mismatch = hard veto)
- Style-learn multiplier (0.85–1.15) from `styleLearnStore`
- Diversity penalty: -0.12 per recent appearance (last 5 outfits)
- Reject penalty: -0.3 for recently rejected combos

## Code Invariants
- Never re-add `generateOutfit()` fallback
- Never inline `DIAL_COLOR_MAP` — import from `src/data/dialColorMap.js` only
- Never inline scoring weights outside `scoringWeights.js`
- Never set `maxAttempts > 1` on Vision functions (10s Netlify hard limit)
- Never hard-delete garments — `exclude_from_wardrobe = true` only
- Never reactivate `w_` seed garments (53 exist, all excluded)
- Never mix Netlify site IDs: `4d21d73c` = watch-advisor2, `85d12386` = Toranot
- Never apply migration without committing `.sql` to `supabase/migrations/`
- Never use `npx vitest` — use `timeout 120 node node_modules/.bin/vitest run`
- Never skip garmentIds in history payload
- `watchSeed.js` is immutable — never touch it

## Supabase Schema
- Garments table uses column `category` (not `type`) — `pushGarment` maps `garment.type → category`
- `pullCloudState` maps `row.category → type` on return
- `thumbnail_url` not `thumbnail` in DB; `photo_url` not `photoUrl`

## Persistence Invariants
- All garments saved to IDB via `setCachedState({ garments })` AND pushed to Supabase
- `pullCloudState()` must NEVER overwrite non-empty local state with empty cloud state
- `_localOnly: true` flag on pullCloudState means skip all cloud → local sync
