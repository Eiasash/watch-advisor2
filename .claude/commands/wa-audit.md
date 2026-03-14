---
description: Full watch-advisor2 audit — types, persistence, classifier, engine, security, tests, mobile, build
allowed-tools: Read, Bash, Grep, Edit, Write
---

You are auditing the watch-advisor2 codebase. Be brutal and precise. No sugar-coating.

## Step 1 — Run tests and build

!`npm test 2>&1 | tail -8`
!`npm run build 2>&1 | tail -5`

## Step 2 — Audit checklist

Work through each section. For every failure, note the file, line, root cause, and fix.

### 2a. Data persistence
- `src/app/bootstrap.js` — cloud pull guard: does it protect local data when cloud returns 0 garments? Does it handle garments without `createdAt` as fresh?
- `src/components/ImportPanel.jsx` — is `pushGarment()` called after every import?
- `src/services/supabaseSync.js` — does `pushGarment` use correct column names (`category` not `type`, `thumbnail_url`, `photo_url`, `needs_review`, `duplicate_of`)?
- Does `pullCloudState` return `_localOnly: true` when IS_PLACEHOLDER?
- Does `pullCloudState` map `row.category → type` on return?
- `src/services/localCache.js` — does `getCachedState` validate shape (array checks)?

### 2b. Garment type system
- `src/classifier/normalizeType.js` — does it cover all aliases? Is `OUTFIT_TYPES` exported?
- `src/outfitEngine/outfitBuilder.js` — are accessories (belt/sunglasses/hat/scarf/bag/accessory/outfit-photo) filtered BEFORE outfit slot scoring?
- `src/features/outfits/generateOutfit.js` — same filter?
- `src/components/WatchDashboard.jsx` — AI stylist garment list: are accessories excluded?
- `netlify/functions/claude-stylist.js` — same?

### 2c. Classifier correctness
- `src/features/wardrobe/classifier.js`:
  - `flatLay`: is threshold `total > 140 && zoneSpread < 0.18`?
  - flat-lay disambiguation: `botF > topF + 0.08` → pants, else shirt?
  - Pants rule: `topF < 0.15 && topNB < 12`?
  - No `[zones]` console.log present?
- `src/classifier/pipeline.js` — does Claude Vision fallback fire on `_typeSource === "default" || "ambiguous" || "blind"`?

### 2d. Engine & scoring
- `src/outfitEngine/scoring.js` — strap-shoe hard veto (returns 0.0), colorMatch, formalityMatch
- `src/outfitEngine/outfitBuilder.js` — reject penalty applied, diversity penalty, sweater layer thresholds (< 22, < 12)
- `src/engine/dayProfile.js` — timezone-safe date handling, cooldown scoring, replica penalty
- `src/engine/weekRotation.js` — empty array guards, active watch filtering

### 2e. Security & Netlify functions
- `netlify/functions/claude-stylist.js` — JSON parsing has size limits, repair is bounded, validates parsed shape
- `netlify/functions/bulk-tag.js` — array size limit on garments input
- `netlify/functions/_claudeClient.js` — API key not exposed, error handling
- All functions: CORS headers consistent, no API key in responses

### 2f. Mobile UX
- `src/app/AppShell.jsx` — bottom tab bar at ≤600px? `safe-area-inset-bottom` in padding? Content has bottom padding on mobile?
- `src/components/WatchDashboard.jsx` — Compare dropdown hidden on mobile? Header wraps? AI Stylist button full-width? Outfit grid 1-col at ≤400px?
- `src/components/ImportPanel.jsx` — side-by-side Gallery+Camera grid? Both ≥80px height? No large desktop-only dropzone?
- `src/features/watch/WatchSelector.jsx` — max-width ≤180px? Compact label?
- `src/components/WardrobeGrid.jsx` — filter tabs have `overflowX:auto` + `whiteSpace:nowrap`? 2-col grid on narrow mobile?

### 2g. watchSeed.js integrity
!`grep -c "brand\|model\|dial" src/data/watchSeed.js`
Confirm 23 watches present. If count wrong, alert immediately.

### 2h. Test mock architecture
- `tests/classifier.test.js` lines 1-40 — mock still uses `actual._applyDecision` with real logic? Has not been changed?

## Step 3 — Summary

Produce a table:

| Area | Status | Issues found |
|------|--------|-------------|
| Tests | pass/fail (N/1717) | |
| Build | pass/fail | |
| Data persistence | pass/fail | |
| Type system | pass/fail | |
| Classifier | pass/fail | |
| Engine & scoring | pass/fail | |
| Security | pass/fail | |
| Mobile UX | pass/fail | |
| watchSeed | pass/fail | |

Then list every fix needed with: **file → exact problem → fix required**.

Do NOT apply fixes in this command. Use `/wa-fix` for that.
