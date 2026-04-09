# Auto-Generated Improvement Proposals
Generated: 2026-04-09
Snapshot: skill-snapshot at 2026-04-09T19:56:34.127Z

## Snapshot Summary
- Garments: 81 active
- History: 47 entries
- Orphaned history: 0 (clean)
- Active model: claude-sonnet-4-6
- April token cost: $5.78 (1.29M input / 127K output)
- Outfit quality trend: March avg 7.75 → April avg 8.67 (+12%)
- Auto-heal last run: 2026-04-09 05:03 UTC (marked 29 stale unscored as legacy)

## Findings

### 1. Watch Rotation — GS Rikka at 40% (borderline)
- Rikka worn 4 of last 10 entries — right at the 40% threshold
- santos_large 2, laureato/blackbay/gmt/snowflake each 1
- recencyScore already lowered to 0.50, neverWornRotationPressure at 0.50
- **Action: Monitor.** If rikka hits 5/10 next audit, bump rotationFactor from 0.40 → 0.45
### 2. Garment Utilization — 39.5% idle (32/81)
- 32 garments untouched in last 30 days
- Breakdown by category:
  - Shirts: 10/22 idle (45%) — improved from 17/21 in March audit
  - Pants: 8/19 idle (42%)
  - Sweaters: 5/16 idle (31%)
  - Shoes: 3/10 idle (30%)
  - Jackets: 1/5 idle (20%)
  - "shirts" category (4 items, 100% idle) — likely miscategorized, should be "shirt"
  - Belts: 0/4 idle (best category)
- **Action: Re-run BulkTagger on the 4 "shirts" category items to fix to "shirt".**
- **Action: The never-worn rotation pressure (0.50) may need a bump to 0.55 to push idle garments into rotation.**

### 3. Context Distribution — Healthy
- smart-casual: 25 (53%), casual: 11 (23%), shift: 4, formal: 2, clinic: 2
- Only 1 null context entry — not systemic
- eid-celebration and date-night both used once — contexts are working
- **Action: None needed.**

### 4. Score Distribution — Sparse but Improving
- Only 5 entries have explicit scores: 6.5(1), 8.0(1), 9.0(3)
- 42 entries unscored (29 already marked legacy by auto-heal)
- April trend: avg 8.67 vs March avg 7.75 — engine improving
- **Action: None — auto-heal is handling legacy entries. Score enforcement already in app.**

### 5. Pants Stagnation — Kiral Beige at 3/14d (borderline)
- Kiral Beige Melange Dress Trousers worn 3 times in 14 days — at threshold
- 9 entries have null pants (legacy)
- **Action: Monitor. Not yet triggering auto-tune.**

### 6. Orphaned History — 13 Entries with Empty garmentIds
- Mix of legacy today-* and dash-* IDs
- One recent entry: wear-2026-04-05-santos_large also missing garmentIds
- Auto-heal reports orphanedHistoryCount: 0 — discrepancy because auto-heal checks
  differently (it checks for garment IDs referencing deleted garments, not empty arrays)
- **Action: The wear-2026-04-05 entry should be patched via AuditPanel in-app.**

### 7. Dead Code — Clean
- All 0-reference Netlify functions are crons (push-brief, monthly-report, run-migrations, supabase-keepalive)
- No dead browser-called functions found
- **Action: None.**

### 8. Auto-Heal Status
- Last run: 2026-04-09 05:03 UTC
- Healthy: false (due to 29 stale unscored entries, now marked legacy)
- All other checks passed: orphans, watch/garment stagnation, context distribution, untagged garments
- **Action: Auto-heal should report healthy on next run after the legacy marking.**

## Weight Changes Applied
No weight auto-tune applied this session. Current values are reasonable:
- rotationFactor: 0.40 (stable)
- repetitionPenalty: -0.28 (stable)
- neverWornRotationPressure: 0.50 (lowered from 0.70 in prior session)
- neverWornRecencyScore: 0.50 (lowered from 0.75 in prior session)
- contextFormality: 0.50 (lowered from 1.5 in prior session)

## Dead Code Removed
None — all functions are active or valid crons.

## Proposed Next Session (ranked by impact)

1. **Fix "shirts" → "shirt" category mismatch** — 4 garments in wrong category, 100% idle.
   Quick BulkTagger or manual SQL update. High impact on utilization.

2. **Bump neverWornRotationPressure 0.50 → 0.55** — 39.5% idle rate is high.
   Would push more idle garments into outfit recommendations. Test impact first.

3. **Patch wear-2026-04-05 orphaned garmentIds** — Recent entry missing outfit data.
   Use AuditPanel "Patch missing outfit data" tool in-app.

4. **Add "riviera" context to week_ctx options** — Summer approaching in Jerusalem.
   Lighter fabrics, linen-friendly scoring, riviera watch style preferences.

5. **Evaluate watch collection balance** — 23 watches but 6 worn in last 10 entries.
   Consider if rotation engine needs stronger diversity pressure or if collection
   is simply larger than daily rotation can cover.
