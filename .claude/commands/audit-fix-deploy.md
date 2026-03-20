---
description: Full audit → fix → improve → skill update cycle for watch-advisor2. Run after any major session or when things feel off.
---

You are the sole developer of watch-advisor2, a React PWA for outfit + watch coordination.
Read SKILL_watch_advisor2.md in full before touching any code.

Repo: github.com/Eiasash/watch-advisor2
Live: https://watch-advisor2.netlify.app
Netlify site ID: 4d21d73c-b37f-4d3a-8954-8347045536dd (NOT 85d12386 — that's Toranot)
Supabase project: oaojkanozbfpofbewtfq
Stack: React 18 + Vite + Zustand + IndexedDB + Netlify Functions

---

## MANDATORY WORKFLOW
After every change:
1. timeout 120 node node_modules/.bin/vitest run — zero failures
2. git add -A && git commit -m "<type>: <msg with root cause>"
3. git push origin main
4. Verify Netlify deploy state = "ready" via MCP:
   Netlify:netlify-project-services-reader → operation: "get-project" → siteId: "4d21d73c-b37f-4d3a-8954-8347045536dd"

Git identity:
git config user.email "eias@watch-advisor2"
git config user.name "Eias"
If diverged: git pull --rebase origin main

---

## PHASE 1 — FULL AUDIT

Run all checks. Document every finding before fixing anything.

### A. Static analysis
```bash
npx madge --circular src/
# Filter out dynamic import() false positives — only static top-level imports cause TDZ

grep -r "generateOutfit" src/
# Must return zero results — legacy removed

grep -rn "console.log" src/ netlify/functions/
# All must be gated behind: if (import.meta.env.DEV)

grep -rn "maxAttempts" netlify/functions/
# Vision functions must ALL have maxAttempts: 1:
# classify-image.js, selfie-check.js, watch-id.js, verify-garment-photo.js

grep -rn "DIAL_COLOR_MAP\|dialColorMap" src/
# Must only import from src/data/dialColorMap.js — never inlined

grep -rn "SCORE_WEIGHTS\|scoringWeights" src/
# Weights must only live in src/config/scoringWeights.js
```

### B. Engine integrity checks
Verify each of these — fail fast if wrong:
- `rotationPressure(Infinity)` returns `0.7` → `src/domain/rotationStats.js`
- never-worn `recencyScore` = `0.75` (not 1.0) → `src/engine/dayProfile.js`
- `rotationFactor` weight = `0.40` → `src/outfitEngine/scoringFactors/rotationFactor.js`
- `repetitionPenalty` = `-0.28` → `src/domain/contextMemory.js`
- `_crossSlotCoherence` warm/cool contrast = `+0.20` (not -0.15) → `outfitBuilder.js`
- `applyFactors()` is actually called in scoring pipeline
- `buildOutfit()` receives pre-filtered wearable garments (not all 322)
- rejection context uses actual context, not hardcoded `"smart-casual"`
- outfit overrides keyed by ISO date string, not `day.offset`

### C. Supabase schema audit
```sql
-- Active garment count (expect ~77)
SELECT COUNT(*) FROM garments 
WHERE exclude_from_wardrobe IS NOT TRUE 
AND type NOT IN ('outfit-photo','watch');

-- Any remaining dupes
SELECT name, type, COUNT(*) FROM garments 
WHERE exclude_from_wardrobe IS NOT TRUE 
AND type NOT IN ('outfit-photo','watch')
GROUP BY name, type HAVING COUNT(*) > 1;

-- History entries missing garmentIds
SELECT id, date FROM history 
WHERE payload->'garmentIds' IS NULL 
OR jsonb_array_length(payload->'garmentIds') = 0;

-- app_settings table exists
SELECT * FROM app_settings LIMIT 5;

-- weight/fit columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'garments' 
AND column_name IN ('weight','fit');
```

### D. Test suite
```bash
timeout 120 node node_modules/.bin/vitest run
```
Document every failure with root cause before fixing.

### E. Skill snapshot endpoint
Call GET https://watch-advisor2.netlify.app/.netlify/functions/skill-snapshot
Verify it returns current garment count, history count, scoring weights, last deploy.
If endpoint missing — add it (see PHASE 3 item 6).

---

## PHASE 2 — FIX ALL FINDINGS

Fix every issue found in Phase 1. Priority order:
1. Crashes / silent failures (TDZ, undefined reads, wrong function calls)
2. Scoring engine bugs (wrong weights, uncalled functions, stale data)
3. Sync/IDB bugs
4. console.log leaks in prod
5. Minor issues

For each fix:
- State root cause in commit message
- Run full test suite after each fix
- Schema changes: apply_migration via MCP + commit .sql to supabase/migrations/ immediately

---

## PHASE 3 — IMPROVEMENTS

After all fixes pass tests, implement these:

### 1. Eid/Family context support
Add `"eid-celebration"` and `"family-event"` as valid context values in:
- `src/config/scoringWeights.js` context list
- WatchDashboard context selector UI
- OnCallPlanner context options
- History logging payload

Scoring rule for these contexts:
- Brown shoes with navy trousers → acceptable (score 0.6, not 0.0)
- Metal/integrated bracelet always exempt (1.0) — unchanged
- Genuine watches preferred but not mandatory
- Formality target: 6–8 range

### 2. Tailor flag badge UI
In `GarmentEditor.jsx` and `WardrobeGrid.jsx`:
- Add visible warning badge (⚠️ NEEDS TAILOR) for garments where notes contain
  "tailor", "pulls at chest", "billows", or "wide in torso"
- These garments excluded from clinic/formal context outfit recommendations
  until flag is manually cleared in GarmentEditor
- Two currently flagged:
  - Nautica White/Navy stripe tailored fit (torso too wide, billows when tucked)
  - Tommy Hilfiger slate micro-check (pulls at chest)

### 3. Orphaned history garmentIds patch tool
In `DebugConsole.jsx` or `AuditPanel.jsx`:
- Add "Patch missing outfit data" button
- Shows list of history entries with empty/null garmentIds
- Allows user to select garments retroactively for each orphaned entry
- Saves via `jsonb_set(payload, '{garmentIds}', '[...]'::jsonb)` UPDATE

### 4. Context-aware shoe rule relaxation
In `scoring.js` → `strapShoeScore()`:
- Current: brown leather strap + navy/black trousers = 0.0 for clinic
- Add: if `context === "eid-celebration" || context === "family-event"` → return 0.6
- Metal/integrated bracelet exempt (1.0) unchanged

### 5. History entry quality enforcement
When logging wear in-app:
- Block save if `garmentIds` array is empty
- Block save if `context` is null/undefined
- Enforce `score` is always numeric (default 7.0 if not set)
- Show validation error in UI before allowing save

### 6. Skill snapshot Netlify function (if missing)
Create `netlify/functions/skill-snapshot.js`:
```js
import { createClient } from '@supabase/supabase-js';
import { SCORE_WEIGHTS } from '../../src/config/scoringWeights.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };

  const { count: garmentCount } = await supabase
    .from('garments')
    .select('*', { count: 'exact', head: true })
    .eq('exclude_from_wardrobe', false)
    .not('type', 'in', '(outfit-photo,watch)');

  const { count: historyCount } = await supabase
    .from('history')
    .select('*', { count: 'exact', head: true });

  const { data: latestMigration } = await supabase
    .from('schema_migrations')
    .select('version')
    .order('version', { ascending: false })
    .limit(1);

  return {
    statusCode: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify({
      garmentCount,
      historyCount,
      scoringWeights: SCORE_WEIGHTS,
      latestMigration: latestMigration?.[0]?.version ?? null,
      snapshotAt: new Date().toISOString(),
      appUrl: "https://watch-advisor2.netlify.app",
      supabaseProject: "oaojkanozbfpofbewtfq",
    })
  };
}
```

---

## PHASE 4 — SKILL FILE UPDATE

After all changes committed and deployed, update `SKILL_watch_advisor2.md`:
- Update garment count (§5) if changed
- Update scoring weight values (§3, §8) if changed
- Add `eid-celebration` / `family-event` to context rotation table in §7
- Add tailor flag system to §6 Key Components table
- Add skill-snapshot endpoint to §9 Quick Reference
- Update Key Gotchas §8 with any new gotchas discovered
- Update history logging example in §5 to include eid-celebration context
- Update "Last audited" date to: 2026-03-20

Then run `/update-skill` command to verify self-consistency.

---

## HARD CONSTRAINTS — NEVER VIOLATE
- Never re-add `generateOutfit()` fallback
- Never inline `DIAL_COLOR_MAP`
- Never inline scoring weights outside `scoringWeights.js`
- Never set `maxAttempts > 1` on Vision functions (10s Netlify hard limit)
- Never hard-delete garments — `exclude_from_wardrobe = true` only
- Never reactivate `w_` seed garments (53 exist, all excluded)
- Never mix Netlify site IDs: `4d21d73c` = watch-advisor2, `85d12386` = Toranot
- Never apply migration without committing `.sql` to `supabase/migrations/` immediately
- Never use `npx vitest` — use `timeout 120 node node_modules/.bin/vitest run`
- Never skip garmentIds in history payload — rotation engine blind without them
