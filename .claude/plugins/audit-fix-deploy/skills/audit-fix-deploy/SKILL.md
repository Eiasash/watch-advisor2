---
description: Full audit → fix → improve → skill update cycle for watch-advisor2. Run after any major session or when things feel off.
---

# Audit-Fix-Deploy Skill

You are the sole developer of watch-advisor2, a React PWA for outfit + watch coordination.

## Context
- Repo: github.com/Eiasash/watch-advisor2
- Live: https://watch-advisor2.netlify.app
- Netlify site ID: 4d21d73c-b37f-4d3a-8954-8347045536dd
- Supabase project: oaojkanozbfpofbewtfq
- Stack: React 18 + Vite + Zustand + IndexedDB + Netlify Functions

Read CLAUDE.md and SKILL_watch_advisor2.md in full before touching any code.

---

## Workflow

### Pre-flight
- Read CLAUDE.md for architecture and rules
- Read references/hard-constraints.md for invariants
- Read references/backlog.md for known issues and priorities

### PHASE 1 — FULL AUDIT

Run all checks. Document every finding before fixing anything.

#### A. Static analysis
```bash
npx madge --circular src/
grep -r "generateOutfit" src/
grep -rn "console.log" src/ netlify/functions/
grep -rn "maxAttempts" netlify/functions/
grep -rn "DIAL_COLOR_MAP\|dialColorMap" src/
grep -rn "SCORE_WEIGHTS\|scoringWeights" src/
```

#### B. Engine integrity checks
Verify each of these — fail fast if wrong:
- `rotationPressure(Infinity)` returns `0.7`
- never-worn `recencyScore` = `0.75` (not 1.0)
- `rotationFactor` weight = `0.40`
- `repetitionPenalty` = `-0.28`
- `_crossSlotCoherence` warm/cool contrast = `+0.20` (not -0.15)
- `applyFactors()` is actually called in scoring pipeline
- `buildOutfit()` receives pre-filtered wearable garments
- rejection context uses actual context, not hardcoded
- outfit overrides keyed by ISO date string, not `day.offset`

#### C. Test suite
```bash
timeout 120 node node_modules/.bin/vitest run
```
Document every failure with root cause before fixing.

### PHASE 2 — FIX ALL FINDINGS

Fix every issue found in Phase 1. Priority order:
1. Crashes / silent failures (TDZ, undefined reads, wrong function calls)
2. Scoring engine bugs (wrong weights, uncalled functions, stale data)
3. Sync/IDB bugs
4. console.log leaks in prod
5. Minor issues

For each fix:
- State root cause in commit message
- Run full test suite after each fix

### PHASE 3 — IMPROVEMENTS

After all fixes pass tests, implement items from references/backlog.md.

### PHASE 4 — SKILL FILE UPDATE

After all changes committed and deployed:
- Update SKILL_watch_advisor2.md with current values
- Update garment counts, scoring weights, context lists
- Update "Last audited" date
- Run `/update-skill` to verify self-consistency

### PHASE 5 — DEPLOY

```bash
timeout 120 node node_modules/.bin/vitest run
npm run build
git add -A && git commit -m "<type>: <msg>"
git push origin main
```

Verify deploy state is "ready" before marking complete.

---

## HARD CONSTRAINTS — NEVER VIOLATE

- Never re-add `generateOutfit()` fallback
- Never inline `DIAL_COLOR_MAP`
- Never inline scoring weights outside `scoringWeights.js`
- Never set `maxAttempts > 1` on Vision functions (10s Netlify hard limit)
- Never hard-delete garments — `exclude_from_wardrobe = true` only
- Never reactivate `w_` seed garments (53 exist, all excluded)
- Never mix Netlify site IDs: `4d21d73c` = watch-advisor2, `85d12386` = Toranot
- Never use `npx vitest` — use `timeout 120 node node_modules/.bin/vitest run`
- Never skip garmentIds in history payload — rotation engine blind without them
- watchSeed.js is immutable — never touch it
