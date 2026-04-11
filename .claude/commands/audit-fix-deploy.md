---
description: "Full audit → fix → test → skill update → deploy cycle. Run after sessions, weekly, or when something feels off. Autonomous — execute everything without asking."
allowed-tools: Bash, Read, Edit, Write, mcp__supabase_watches__execute_sql, mcp__netlify__netlify-project-services-reader
---

# Full Audit-Fix-Deploy Cycle

You are the sole developer of watch-advisor2. Read SKILL_watch_advisor2.md FIRST.

**Repo:** github.com/Eiasash/watch-advisor2  
**Live:** https://watch-advisor2.netlify.app  
**Netlify site ID:** 4d21d73c-b37f-4d3a-8954-8347045536dd (NOT 85d12386 — that's Toranot)  
**Supabase project:** oaojkanozbfpofbewtfq  
**Stack:** React 18 + Vite 7 + Zustand 4 + IndexedDB + Supabase + Netlify Functions

**Git identity:**
```bash
git config user.email "eias@watch-advisor2" && git config user.name "Eias"
```

**Execute autonomously. Fix everything. Don't ask — do.**

---

## PHASE 1 — STATIC ANALYSIS

```bash
npx madge --circular src/
grep -r "generateOutfit" src/
grep -r "watch-rec" src/ netlify/functions/
grep -r "VersionChip\|detectDominantColorFromDataURL" src/
grep -rn "console.log" src/ netlify/functions/ | grep -v node_modules | grep -v "import.meta.env.DEV" | grep -v ".test."
grep -rn "maxAttempts" netlify/functions/
grep -rn "DIAL_COLOR_MAP" src/ | grep -v "data/dialColorMap.js" | grep -v ".test." | grep -v node_modules
grep -rn "SCORE_WEIGHTS" src/ | grep -v "config/scoringWeights.js" | grep -v ".test." | grep -v node_modules
```

---

## PHASE 2 — ENGINE INTEGRITY

Verify each — fail fast if wrong:

| Check | Expected | File |
|-------|----------|------|
| rotationPressure(Infinity) | 0.7 | rotationStats.js |
| Never-worn recencyScore | 0.75 | dayProfile.js |
| rotationFactor | 0.40 | scoringFactors/rotationFactor.js |
| repetitionPenalty | -0.28 | contextMemory.js |
| crossSlotCoherence warm/cool | +0.20 | outfitBuilder.js |
| SCORE_CEILING | 30 | confidence.js |
| contextFormality weight | 0.5 | scoringWeights.js |
| contextMatch bonus | 0.10 | seasonContextFactor.js |
| Default temp fallback | 15 (not 22) | outfitBuilder, WatchDashboard, WeekPlanner |
| applyFactors() called | Yes | scoring pipeline |
| buildOutfit receives filtered wearable | Yes | not all garments |
| Shift watch gate | shiftWatch:true only | dayProfile.js |
| WatchDashboard in shift | Returns null | WatchDashboard.jsx |
| Retired watches | Filtered from ALL UI + engine |
| Pasha bracelet | poorFit:true | watchSeed.js |
| Sweater warm transition | >=18C minScore=4.0 | outfitBuilder.js |
| Belt NOT in ACCESSORY_TYPES | Correct | WeekPlanner, WatchDashboard |
| muted defined in WeekPlanner | Yes | WeekPlanner.jsx |
| Snapshot weights | cF=0.5, cM=0.10 | skill-snapshot.js |
| Strap auto-recommendation | Exists | outfitBuilder.js |

---

## PHASE 3 — SUPABASE AUDIT

```sql
SELECT 'garments' as chk, COUNT(*)::text as val FROM garments WHERE exclude_from_wardrobe IS NOT TRUE AND category NOT IN ('outfit-photo','watch','outfit-shot')
UNION ALL SELECT 'history', COUNT(*)::text FROM history
UNION ALL SELECT 'orphans', COUNT(*)::text FROM history WHERE (payload->'garmentIds' IS NULL OR payload->'garmentIds' = '[]'::jsonb) AND (payload->>'legacy' IS NULL OR payload->>'legacy' != 'true') AND (payload->>'quickLog' IS NULL OR payload->>'quickLog' != 'true')
UNION ALL SELECT 'untagged', COUNT(*)::text FROM garments WHERE exclude_from_wardrobe IS NOT TRUE AND category NOT IN ('outfit-photo','watch','outfit-shot') AND (seasons IS NULL OR jsonb_array_length(seasons) = 0 OR contexts IS NULL OR jsonb_array_length(contexts) = 0 OR material IS NULL OR material = '' OR weight IS NULL OR weight = '')
UNION ALL SELECT 'dupes', (SELECT COUNT(*)::text FROM (SELECT name, category, COUNT(*) FROM garments WHERE exclude_from_wardrobe IS NOT TRUE AND category NOT IN ('outfit-photo','watch','outfit-shot') GROUP BY name, category HAVING COUNT(*) > 1) x)
UNION ALL SELECT 'photos', COUNT(*)::text FROM garments WHERE exclude_from_wardrobe IS NOT TRUE AND category NOT IN ('outfit-photo','watch','outfit-shot') AND photo_url IS NOT NULL
UNION ALL SELECT 'trailing_spaces', COUNT(*)::text FROM garments WHERE exclude_from_wardrobe IS NOT TRUE AND brand LIKE '% '
ORDER BY chk;
```

---

## PHASE 4 — TEST SUITE

```bash
timeout 120 node node_modules/.bin/vitest run
```

Document every failure. Fix before proceeding.

### EXPAND TESTS — find gaps:
```bash
for f in src/components/*.jsx; do
  base=$(basename "$f" .jsx)
  ls tests/*${base}* 2>/dev/null | grep -q . || echo "NO TESTS: $base"
done
for fn in netlify/functions/*.js; do
  name=$(basename "$fn" .js)
  [[ "$name" == _* ]] && continue
  ls tests/*${name}* 2>/dev/null | grep -q . || echo "NO TESTS: $name"
done
```

Write tests for uncovered critical paths:
- ClaudePick.jsx — loading/error/data render states
- daily-pick.js — valid JSON output structure
- OutfitSlotChip — "None — remove" option
- Strap auto-recommendation — brown shoes → brown strap, Pasha poorFit avoidance
- Sweater warm transition — no sweater above 18°C unless score > 4.0
- WeatherBadge — hourly temp display (tempMorning/tempMidday/tempEvening)
- getLayerTransition() — transition text generation
- handleSwapGarment — null clears slot
- Logged outfit overrides — _isLogged entries still accept overrides

---

## PHASE 5 — FIX ALL FINDINGS

Priority: crashes > scoring bugs > UX bugs > dupes > orphans > tags > console leaks.
Root cause in every commit message. Test after every fix.

---

## PHASE 6 — WEAR PATTERN ANALYSIS

```sql
SELECT watch_id, COUNT(*) FROM (SELECT watch_id FROM history ORDER BY created_at DESC LIMIT 10) sub GROUP BY watch_id ORDER BY 2 DESC;
SELECT payload->>'context' as ctx, COUNT(*) FROM history GROUP BY 1 ORDER BY 2 DESC;
```

Auto-tune if thresholds breached:
| Finding | Action |
|---------|--------|
| Same watch >4/10 | rotationFactor += 0.05 (max 0.60) |
| Same garment >3/14d | repetitionPenalty -= 0.03 (max -0.40) |
| Shirts <35% wear rate | Check sweater warm transition threshold |

---

## PHASE 7 — UPDATE ALL SKILL FILES

### SKILL_watch_advisor2.md
Update: version, file counts, test count, function count, component count, last audited date, scoring weights in §3, garment/history counts in §5, gotchas in §7, health expectations in §9.

### IMPROVEMENTS.md
Add session with date. List fixes shipped, weight changes, dead code, remaining TODO.

### CLAUDE.md
Update test count, architecture if files changed, commands table.

### Wardrobe/collection project knowledge
If DB garments changed → update SKILL_wardrobe_v10.md counts and garment lists.
If watches/straps changed → update Watch_Collection_v11-3.md.

---

## PHASE 8 — SNAPSHOT HEALTH GATE

```bash
curl -s https://watch-advisor2.netlify.app/.netlify/functions/skill-snapshot | python3 -m json.tool
```

ALL must pass:
- garmentCount >= 70
- orphanedHistoryCount === 0
- activeModel !== "unknown"
- All health.* === "ok"
- scoringWeights.contextFormality === 0.5
- scoringWeights.contextMatch === 0.10
- tokenUsage.month === current month

**Do NOT mark session complete until ALL checks pass.**

---

## PHASE 9 — DEPLOY

```bash
timeout 120 node node_modules/.bin/vitest run
git add -A && git commit -m "audit: full cycle [date]"
git push origin main
```

Verify via MCP: Netlify get-project → siteId 4d21d73c → state "ready".

---

## HARD CONSTRAINTS — NEVER VIOLATE

- Never re-add generateOutfit() fallback
- Never inline DIAL_COLOR_MAP or scoring weights
- Never set maxAttempts > 1 on Vision functions
- Never hard-delete garments — exclude_from_wardrobe only
- Never reactivate w_ seed garments
- Never mix site IDs: 4d21d73c = watch-advisor2, 85d12386 = Toranot
- Never apply migration without committing .sql immediately
- Never use npx vitest — use timeout 120 node node_modules/.bin/vitest run
- Never skip garmentIds + payload_version in history
- Never double JSON.parse app_config
- Never invoke auto-heal.js via HTTP
- Never remove quickLog/legacy flags
- Never set USE_WORKER = true
- Never lower SCORE_CEILING without recalibrating
- Never add belt to ACCESSORY_TYPES exclusion
- Never default temp to 22°C (use 15°C)
- Never remove .garmentIds from shuffle fake history
