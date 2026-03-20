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

### 5. GarmentEditor — Add photo for existing garments
GarmentEditor.jsx currently has no way to attach or replace a photo on an existing garment.
Garments created manually via SQL or without a camera upload show a placeholder icon forever.

Fix:
- Add "Add Photo" / "Replace Photo" button in GarmentEditor when garment has no photo
- Reuse existing imagePipeline flow: resizeImage() → processImage() → save to IDB images store keyed by garment ID → push to Supabase storage via uploadPhoto()
- Show current photo thumbnail in editor if photo exists, with option to replace
- Affected garments currently missing photos include manual entries like g_tommy_hilfiger_black_hoodie, g_manual_pink_greg_norman_shirt

### 6. History entry quality enforcement
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

## PHASE 5 — AUTONOMOUS SELF-IMPROVEMENT

After Phase 4, run this analysis cycle. The app should detect its own inefficiencies
and implement fixes without being told what's wrong.

### A. Wear pattern analysis
Query history and detect these failure modes automatically:

```sql
-- 1. Watch repetition — same watch worn >40% of last 10 entries
SELECT watch_id, COUNT(*) as wear_count
FROM history
ORDER BY created_at DESC
LIMIT 10;
-- If any watch_id > 4 of last 10 → recencyScore or rotationFactor is broken

-- 2. Garment slot stagnation — same garment in same slot >3 times in last 14 days
SELECT payload->'outfit'->>'pants' as pants, COUNT(*) 
FROM history 
WHERE created_at > NOW() - INTERVAL '14 days'
GROUP BY 1 ORDER BY 2 DESC;
-- If any garment > 3 → repetitionPenalty or rotationFactor not firing

-- 3. Context distribution — check if context is always null or always same value
SELECT payload->>'context' as context, COUNT(*)
FROM history
GROUP BY 1 ORDER BY 2 DESC;
-- If >80% null → context selector UI is being skipped, needs default

-- 4. Score distribution — check if scores are always 7.0 (default) vs varied
SELECT 
  ROUND((payload->>'score')::numeric, 1) as score,
  COUNT(*)
FROM history 
WHERE payload->>'score' IS NOT NULL
GROUP BY 1 ORDER BY 1;
-- If all scores = 7.0 → score not being set during logging, needs enforcement

-- 5. Orphaned garmentIds — garment IDs in history that no longer exist
SELECT DISTINCT jsonb_array_elements_text(payload->'garmentIds') as gid
FROM history
WHERE payload->'garmentIds' IS NOT NULL
AND jsonb_array_elements_text(payload->'garmentIds') NOT IN (
  SELECT id FROM garments WHERE exclude_from_wardrobe IS NOT TRUE
);
-- Any results → stale IDs, rotation engine counting ghost wear
```

### B. Auto-tune scoring weights
Based on wear pattern analysis findings, adjust weights in `src/config/scoringWeights.js`:

| Finding | Auto-fix |
|---------|----------|
| Same watch >4/10 | Increase `rotationFactor` by 0.05 (max 0.60) |
| Same garment >3/14d | Increase `repetitionPenalty` by 0.03 (max -0.40) |
| Never-worn garments >30% of wardrobe | Increase `neverWornRotationPressure` by 0.05 (max 0.90) |
| Score always 7.0 | Add score enforcement to wear logging UI |
| Context always null | Set default context to "smart-casual" in WatchDashboard |

For each weight change:
- Document old value → new value in commit message
- Run full test suite — if any test fails, revert that specific change only
- Update §3 and §8 of SKILL_watch_advisor2.md with new values

### C. Dead code detection
```bash
# Find functions defined but never imported anywhere
grep -rn "export function\|export const\|export default" src/ | \
  awk -F: '{print $3}' | grep -oP '(?<=function |const )\w+' | \
  while read fn; do
    count=$(grep -r "$fn" src/ | grep -v "export" | wc -l)
    if [ "$count" -eq 0 ]; then echo "DEAD: $fn"; fi
  done

# Find Netlify functions never called from client
for fn in netlify/functions/*.js; do
  name=$(basename $fn .js)
  if ! grep -r "$name" src/ > /dev/null 2>&1; then
    echo "UNCALLED FUNCTION: $name"
  fi
done
```
Remove or flag dead code. Do NOT remove push-brief.js — it's a cron, not browser-called.

### D. Self-generated improvement proposals
After completing A-C, generate a `IMPROVEMENTS.md` file in repo root:

```markdown
# Auto-Generated Improvement Proposals
Generated: {today's date}
Snapshot: {skill-snapshot endpoint result}

## Findings
{list each finding from A with data}

## Weight Changes Applied
{list each weight that was auto-tuned with old → new}

## Dead Code Removed
{list any removed functions}

## Proposed Next Session
{3-5 specific improvements Claude Code recommends based on patterns,
 ranked by impact. These are NOT auto-implemented — require human approval.}
```

Commit this file with every audit run:
```bash
git add IMPROVEMENTS.md src/config/scoringWeights.js
git commit -m "perf: auto-tune weights + improvements report $(date +%Y-%m-%d)"
git push origin main
```

### E. Skill snapshot health gate
After all changes, call the snapshot endpoint again:
```
GET https://watch-advisor2.netlify.app/.netlify/functions/skill-snapshot
```

Assert:
- `orphanedHistoryCount === 0` — if not, patch before finishing
- `garmentCount >= 75` — if less, investigate exclusions
- `health.garments === "ok"` — if not, Supabase connection issue
- `health.orphanedHistory === "ok"` — if not, more patches needed

Only mark the session complete when all health checks pass.
If any check fails — fix it, re-deploy, re-check. Do not exit the loop until clean.

### F. Cron: weekly autonomous audit (GitHub Action)
Create `.github/workflows/weekly-audit.yml`:

```yaml
name: Weekly Autonomous Audit
on:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday 6am UTC
  workflow_dispatch:       # Manual trigger too

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@beta
        with:
          prompt: |
            Run /audit-fix-deploy — full autonomous cycle.
            Focus on Phase 5 self-improvement.
            Commit all findings to IMPROVEMENTS.md.
            Push all changes.
          allowed_tools: "Bash,Read,Write,Edit"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

This makes the app audit and tune itself every Monday morning.
You wake up to a PR or commit with findings and any auto-applied fixes.

---

## PHASE 6 — FUTURE-PROOFING

Run after Phase 5. Each item below is independent — implement in priority order.
Skip any item already implemented (check before starting).

### Priority 1 — Supabase keep-alive cron (30 min)
Supabase free tier pauses after 7 days inactivity. One missed week = dead app on return.

Create `netlify/functions/supabase-keepalive.js`:
```js
// Scheduled: every 5 days via netlify.toml
// [functions.supabase-keepalive]
//   schedule = "0 6 */5 * *"
import { createClient } from '@supabase/supabase-js';
export async function handler() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  await supabase.from('app_config')
    .update({ value: `"${new Date().toISOString()}"`, updated_at: new Date() })
    .eq('key', 'supabase_keepalive_last');
  console.log('[keepalive] Supabase pinged', new Date().toISOString());
  return { statusCode: 200 };
}
```
Add to `netlify.toml`:
```toml
[functions.supabase-keepalive]
  schedule = "0 6 */5 * *"
```

### Priority 2 — Retired watch flag (1 hr)
When a watch is traded, history entries referencing it break the rotation engine.

In `src/data/watchSeed.js`:
- Add `retired: true` field to any traded watch
- Add `retiredDate: "YYYY-MM-DD"` for audit trail

In `src/engine/dayProfile.js` → `scoreWatchForDay()`:
- Filter out `retired: true` watches before scoring
- Keep retired watches visible in history display (WearHistoryPanel) but not in rotation

Watches to mark retired immediately:
- SBGW267 (traded March 2026 → Pasha deal)
- Sinn 613 UTC (traded Feb 2025 → Speedmaster deal)  
- Rolex Date 15203 (traded Feb 2025 → Speedmaster deal)

### Priority 3 — Claude model version from app_config (1 hr)
When Anthropic deprecates a model, all Vision functions fail silently.

In `netlify/functions/_claudeClient.js`:
- On cold start, read `claude_model` from `app_config` table
- Fall back to hardcoded default if DB read fails
- Cache the model string in module scope (one read per cold start)

In `netlify/functions/skill-snapshot.js`:
- Include `activeModel` from `app_config` in snapshot response

Update model by changing one DB row — no deploy needed:
```sql
UPDATE app_config SET value = '"claude-sonnet-4-5"' WHERE key = 'claude_model';
```

### Priority 4 — Token usage logging (2 hrs)
You have no visibility into API costs. BulkTagger can silently cost ₪50 in one run.

In `netlify/functions/_claudeClient.js` → after every `callClaude()` response:
```js
const usage = response.usage; // { input_tokens, output_tokens }
// Fire-and-forget update to app_config (don't await — don't block response)
supabase.rpc('increment_token_usage', { 
  input: usage.input_tokens, 
  output: usage.output_tokens 
});
```

Create Supabase function:
```sql
CREATE OR REPLACE FUNCTION increment_token_usage(input int, output int)
RETURNS void AS $$
DECLARE
  current_month text := to_char(NOW(), 'YYYY-MM');
  current_val jsonb;
BEGIN
  SELECT value INTO current_val FROM app_config WHERE key = 'monthly_token_usage';
  IF current_val->>'month' != current_month THEN
    -- New month, reset
    UPDATE app_config SET value = jsonb_build_object(
      'month', current_month, 'input', input, 'output', output,
      'cost_usd', ROUND(((input * 0.000003) + (output * 0.000015))::numeric, 4)
    ) WHERE key = 'monthly_token_usage';
  ELSE
    UPDATE app_config SET value = jsonb_build_object(
      'month', current_month,
      'input', (current_val->>'input')::int + input,
      'output', (current_val->>'output')::int + output,
      'cost_usd', ROUND((((current_val->>'input')::int + input) * 0.000003 + 
                         ((current_val->>'output')::int + output) * 0.000015)::numeric, 4)
    ) WHERE key = 'monthly_token_usage';
  END IF;
END;
$$ LANGUAGE plpgsql;
```

Show monthly cost in `DebugConsole.jsx` — single line from `app_config`.

### Priority 5 — Storage quota check on boot (1 hr)
Browsers silently evict IDB data when storage is low. On mobile this kills garment images.

In `src/app/bootstrap.js` → after IDB load:
```js
if (navigator.storage?.estimate) {
  const { usage, quota } = await navigator.storage.estimate();
  const pct = (usage / quota) * 100;
  if (pct > 70) {
    debugStore.getState().addError({
      level: 'warn',
      source: 'bootstrap',
      message: `Storage at ${pct.toFixed(0)}% — garment images at risk of eviction`,
      payload: { usage, quota }
    });
  }
}
```

### Priority 6 — Outfit quality trend endpoint (2 hrs)
You can't see if the engine is improving or degrading over time.

Add to `netlify/functions/skill-snapshot.js`:
```js
// Weekly average scores for last 12 weeks
const { data: scoreTrend } = await supabase
  .from('history')
  .select('date, payload')
  .gte('date', new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
  .order('date', { ascending: true });

const weeklyScores = scoreTrend?.reduce((acc, entry) => {
  const week = entry.date.slice(0, 7); // YYYY-MM
  if (!acc[week]) acc[week] = { total: 0, count: 0 };
  const score = entry.payload?.score;
  if (score && !isNaN(score)) { acc[week].total += score; acc[week].count++; }
  return acc;
}, {});
```
Include `outfitQualityTrend` in snapshot response.
Plot in DebugConsole as a simple text table — no charting library needed.

### Priority 7 — No-wear push notification (1 hr)
If you don't open the app for 7 days, send a push reminder. Keeps the loop alive.

In `netlify/functions/push-brief.js` (already exists as cron):
- Check latest history entry date
- If `date < NOW() - 7 days` → send push: "No outfit logged in 7 days — rotation engine going blind"

### Priority 8 — Payload schema versioning (2 hrs)
History JSONB payload has no version field. Future schema changes break old entries silently.

Add `payload_version: "v1"` to every new history INSERT.
Add migration query to backfill all existing entries:
```sql
UPDATE history 
SET payload = jsonb_set(payload, '{payload_version}', '"v1"')
WHERE payload->>'payload_version' IS NULL;
```
In rotation engine — check `payload_version` before reading fields.
When schema changes → bump to v2, write adapter function for v1→v2 reads.

### Priority 9 — Wardrobe health score (2 hrs)
At 120+ garments, diversity pressure spreads thin and recommendations degrade.

In `skill-snapshot.js`:
```js
// Per-category wear rate
const categoryHealth = await supabase.rpc('wardrobe_health_by_category');
```

Create DB function that returns per-type: count, wear_rate_30d, idle_count.
Warn in snapshot if any category: count > 25 AND wear_rate < 30%.
Show in DebugConsole as health dashboard.

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
