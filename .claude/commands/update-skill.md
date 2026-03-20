---
description: Auto-update SKILL_watch_advisor2.md with current ground truth from codebase + Supabase. Run after every deploy or manually when skill feels stale.
---

You are updating the SKILL_watch_advisor2.md file to reflect current ground truth.
Do NOT make any code changes. Only update the skill file.

## STEP 1 — Pull current state from snapshot endpoint
Call: GET https://watch-advisor2.netlify.app/.netlify/functions/skill-snapshot

Extract:
- garmentCount
- historyCount  
- scoringWeights (all values)
- latestMigration
- snapshotAt

If endpoint is down, proceed with manual checks below.

## STEP 2 — Manual verification (always run regardless)
```bash
# Current scoring weights
cat src/config/scoringWeights.js | grep -A 20 "SCORE_WEIGHTS"

# rotationFactor weight
cat src/outfitEngine/scoringFactors/rotationFactor.js

# repetitionPenalty value
grep "repetitionPenalty\|0\." src/domain/contextMemory.js

# recencyScore for never-worn
grep -A 5 "never" src/engine/dayProfile.js

# rotationPressure(Infinity)
grep -A 10 "Infinity\|never" src/domain/rotationStats.js

# Current package version
cat package.json | grep '"version"'

# Test count
ls tests/*.test.js | wc -l
```

## STEP 3 — Update SKILL_watch_advisor2.md

Patch exactly these fields (leave everything else untouched):

| Field | Location in skill | Source |
|-------|------------------|--------|
| Active garment count | §5 Supabase Schema → "Active count as of..." | snapshot garmentCount |
| History entry count | §5 → "X entries as of..." | snapshot historyCount |
| colorMatch weight | §3 scoring formula + §8 gotchas | scoringWeights.js |
| formalityMatch weight | §3 + §8 | scoringWeights.js |
| watchCompatibility weight | §3 + §8 | scoringWeights.js |
| weatherLayer weight | §3 + §8 | scoringWeights.js |
| contextFormality weight | §3 + §8 | scoringWeights.js |
| rotationFactor weight | §3 + §8 | rotationFactor.js |
| repetitionPenalty | §3 + §8 | contextMemory.js |
| recencyScore never-worn | §3 + §8 | dayProfile.js |
| rotationPressure(Infinity) | §3 + §8 | rotationStats.js |
| Test file count | §1 Overview table | ls tests/ count |
| Last audited date | Top of §3 headers | today's date |

## STEP 4 — Commit
```bash
git add SKILL_watch_advisor2.md
git diff --cached --quiet || git commit -m "docs: auto-update skill file $(date +%Y-%m-%d) [skip ci]"
git push origin main
```

If nothing changed, say "Skill file already up to date — no commit needed."
