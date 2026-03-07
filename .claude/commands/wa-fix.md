---
description: Apply a targeted fix to watch-advisor2. Arg: area to fix (e.g. persistence, classifier, mobile, types)
argument-hint: [area: persistence|classifier|mobile|types|all]
allowed-tools: Read, Bash, Edit, Write, Grep
---

Fix area: **$ARGUMENTS**

Read CLAUDE.md for full constraints before touching anything.

## Pre-fix

1. Run tests: `npm test 2>&1 | tail -5`
2. Note current pass count.

## Fix protocol

For the area **$ARGUMENTS**, apply ALL needed fixes from the audit. Rules:

- **Never modify** `src/data/watchSeed.js`
- **Never change** the test mock architecture in `tests/classifier.test.js` lines 1-40
- Use Python `str.replace()` via `python3 -c` for complex multi-line JS edits
- Use `str_replace` for simple targeted changes
- After every file edit, verify the change is correct by reading it back
- Preserve all existing exports — do not remove any exported functions

### For `persistence`:
- `src/app/bootstrap.js`: cloud pull guard (empty cloud → push local up, don't wipe)
- `src/services/supabaseSync.js`: `_localOnly` flag, correct `pushGarment` column mapping, `pullCloudState` maps `category→type`
- `src/components/ImportPanel.jsx`: `pushGarment()` called after each import

### For `classifier`:
- `src/features/wardrobe/classifier.js`: flatLay threshold, zone bias, pants rule, remove zones log
- `src/classifier/normalizeType.js`: full alias coverage, `OUTFIT_TYPES` export
- `src/classifier/pipeline.js`: Vision fallback fires on `default|ambiguous|blind`

### For `mobile`:
- `src/app/AppShell.jsx`: bottom tab bar ≤600px with safe-area-inset
- `src/components/WatchDashboard.jsx`: hide Compare on mobile, full-width button
- `src/components/ImportPanel.jsx`: side-by-side Gallery+Camera
- `src/features/watch/WatchSelector.jsx`: compact label + max-width

### For `types`:
- `src/classifier/normalizeType.js`: all type aliases
- `src/outfitEngine/outfitBuilder.js`: ACCESSORY_TYPES filter before slot scoring
- `src/features/outfits/generateOutfit.js`: same filter
- `src/components/WatchDashboard.jsx`: AI stylist garment list filters accessories
- `netlify/functions/claude-stylist.js`: same

### For `all`:
Apply all of the above in sequence.

## Post-fix

Run in this exact order:
```bash
npm test 2>&1 | tail -8
npm run build 2>&1 | tail -5
```

If tests fail: diagnose and fix before proceeding. All 140 must pass.
If build fails: fix the syntax error (run `node --check` or check esbuild error).

Report what was changed and the final test count.
Do NOT push — use `/wa-deploy` for that.
