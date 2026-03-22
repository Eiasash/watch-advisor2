---
description: Run the full audit phase of audit-fix-deploy
---

# Audit Command

Run all audit checks and document findings before fixing anything.

## Steps

1. **Static analysis**
   - Check for circular dependencies: `npx madge --circular src/`
   - Verify no `generateOutfit` references in src/
   - Check console.log usage is DEV-gated
   - Verify Vision functions have `maxAttempts: 1`
   - Verify DIAL_COLOR_MAP not inlined
   - Verify scoring weights not inlined

2. **Engine integrity**
   - `rotationPressure(Infinity)` → `0.7`
   - never-worn `recencyScore` = `0.75`
   - `rotationFactor` weight = `0.40`
   - `repetitionPenalty` = `-0.28`
   - `_crossSlotCoherence` warm/cool contrast = `+0.20`
   - `applyFactors()` called in scoring pipeline
   - `buildOutfit()` receives pre-filtered garments
   - rejection context uses actual context
   - outfit overrides keyed by ISO date string

3. **Test suite**
   ```bash
   timeout 120 node node_modules/.bin/vitest run
   ```
   Document every failure with root cause.

4. **Report findings** — list all issues found, categorized by severity:
   - P0: Crashes / silent failures
   - P1: Scoring engine bugs
   - P2: Sync/IDB bugs
   - P3: console.log leaks
   - P4: Minor issues
