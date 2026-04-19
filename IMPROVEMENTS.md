# Auto-Generated Improvement Proposals
Generated: 2026-04-18 (cumulative)

## Current State
- **Version**: 1.12.33
- **Engine integrity**: All checks PASS
- **Supabase**: 104 active garments, 0 dupes, 0 orphans (Pavarotti trousers recovered + 2 orphans excluded Apr 18)
- **Watches**: 23 active + 1 pending (Atelier Wen Perception, Singapore shipment)
- **Tests**: 2477+ passing (144 files, +2 new autoHeal trap-guard tests) — critical paths verified green
- **Snapshot**: All health "ok", autoHeal healthy (9 checks now, was 8)
- **Build**: Auto-deploy on push to main
- **Model**: claude-sonnet-4-6
- **Acquisition target**: Fears Brunswick 38 Champagne (primary, Fears UK order in motion); anOrdain Model 2 Brown Fumé passive at $2,500 distressed-floor only

---

## Fixes Shipped — Cumulative Log

### v1.5.5 (March 2026)
1. **Retired watch UI leak** — SBGW267, Sinn 613, Rolex Date 15203 appeared in 6 UI paths. All filtered with `!w.retired`.

### v1.5.6 (March 2026)
2. **CRITICAL: SCORE_CEILING** — Was 0.60 (multiplicative era). Fixed to 30 (additive engine).
3. **AddOutfitModal weather hardcoded** — Was {tempC: 22}. Now threads forecast prop from WeekPlanner.
4. **explainSeasonContext timezone** — Used raw `new Date().getMonth()`. Now uses `Asia/Jerusalem`.
5. **Shuffle fake history missing garmentIds** — repetitionPenalty never fired on shuffled picks. Fixed.
6. **On-call UX duplicate** — WatchDashboard + OnCallPlanner both generated shift outfits. WatchDashboard returns null when shift.
7. **On-call auto-detect** — `useTodayFormState` auto-defaults to "shift" from onCallDates.
8. **Test fix** — calendarWatchRotationEdge shiftWatch gate test added.
9. **Grey Melange Kiral trousers** — missing `material` tag. Set to `cotton-blend`.

### v1.12.8 (April 2026)
10. **CRITICAL: IDB array crash** — `.filter()` crashes from IDB returning non-array truthy values. Replaced all `?? []` with `Array.isArray()` / `toArray()` utility. Six prior attempts failed for same root cause.
11. **bootstrap.js field name** — Destructured `{ history }` but field is named `entries`. Fixed.

### v1.12.9 (April 2026)
12. **AI chat history persistence** — Chat history persists to IDB across sessions. Base64 images stripped, metadata only.
13. **Multi-photo chat** — Up to 4 images, resized to 800px, preview strip, individual remove buttons.
14. **Multi-block Claude response fix** — All 15 serverless functions used `content[0].text`. Fixed via `extractText()` helper that finds `type:"text"` block explicitly.

### v1.12.12 (April 2026)
15. **Strap-shoe rule ELIMINATED** — `strapShoeScore()` always returns 1.0. `filterShoesByStrap` removed. Strap chip removed from UI.

### v1.12.15–v1.12.19 (April 2026)
16. **Never-worn scores lowered** — recencyScore 0.75→0.50, rotationPressure(Infinity) 0.70→0.50.
17. **Supabase env var fix** — `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` added to Netlify. App was connecting to example.supabase.co.
18. **New garments onboarded (Apr 10–11)** — 18 items added: Di Porto shirts, Fynch-Hatton flannel, multiple dress shirts, Gant dark navy cable knit, Greg Norman black zip knit, Nautica grey QZ, olive brown chinos, dark navy slim jeans, Blundstone Chelsea boots, Puma white multicolor, Pavarotti dress shirt, misc flannel/dress shirts. Total: 80→98.
19. **scoringOverrides system** — Runtime weight tuning via `app_config` without deploys.

### DB Maintenance (April 11 2026)
20. **+2 garments onboarded** — Kiral Old Money Green Cashmere Sweater (KRL-2605XX) + Kiral Grey Dress Trousers. Total: 98→100.
21. **Data fix** — Kiral TV70102 cardigan color corrected khaki→brown (tag confirmed KRL-2604XX, "BROWN").
22. **Full dedup audit** — 100 garments scanned, 0 duplicates found. Both Chelsea boots confirmed distinct items.

### v1.12.24 — Audit Fixes (April 13 2026)
23. **bulk-tag.js clinic context bug** — `clinic` was in CONTEXTS allowlist so AI suggestions passed through unfiltered. Removed from allowlist, prompt schema, and CONTEXT RULES. smart-casual now covers professional/medical contexts server-side — no manual strip needed.
24. **seasonContextFactor toArray** — `garment.seasons ?? []` and `garment.contexts ?? []` replaced with `toArray()`. Consistent with IDB array safety mandate — ?? [] passes truthy non-arrays.
25. **Dead filterShoesByStrap import removed** — `outfitBuilder.js` was still importing it. `strapShoeScore()` always returns 1.0 since v1.12.12 so it can never filter anything.
26. **SKILL_watch_advisor2.md** — Bumped to v1.12.24, updated garment count, audit date, 3 new gotchas.

### v1.12.25 — Token Cost + Garment Sync (April 13 2026)
27. **push-brief.js buildWeeklyBrief: sonnet→haiku** — Weekly 7-day rotation is structured list gen from explicit inputs; haiku handles it fine. Projected saving: ~$3-4/month (~15% of April spend).
28. **push-brief.js isMonday→isSunday** — Weekly brief was triggering on Western Monday (Tuesday in Jerusalem time). Fixed to use Sunday = Israeli work week start.
29. **+7 garments onboarded** — 4 shirts (Gant Blue/Brown/White Stripe, Kiral Stone Pinstripe, Olive Navy Block Plaid Flannel, White V-Neck Basic Tee), 2 sweaters (Kiral Brown Zippered Cardigan TV70102, Gant Dark Navy Cable Knit), 1 shoe (Blundstone Rustic Brown Chelsea). Total: 100→103.  
30. **Data fix** — Di Porto Navy Orange Plaid Flannel had wrong name/brand (was stored as "Tommy Hilfiger Red Striped Shirt" with brand Di Porto).

### v1.12.31 — Pending Watches + Atelier Wen Perception (April 18 2026)
31. **New `pending:true` watch flag** — parallel to `retired`, excludes from rotation everywhere (engine + UI) without treating as traded. First pending watch: Atelier Wen Perception x Revolution Paris-Beijing N°25/50.
32. **Centralized watch filter** — new `src/utils/watchFilters.js` with `isActiveWatch()` / `activeWatches()` helpers. Single source of truth replacing 19 inline `!w.retired` filter sites.
33. **19 filter points extended** — `!w.retired` → `!w.retired && !w.pending` across `src/engine/dayProfile.js`, `src/engine/weekRotation.js`, `src/domain/{rotationStats,tradeSimulator}.js`, and 13 components (OnCallPlanner, TodayPanel, WatchDashboard, WeekPlanner, Header, StatsPanel, StrapHealth, StrapHeatmap, TradeSimulator, NeglectedWatchNudge, WatchSelector).
34. **Atelier Wen Perception added** — 41mm-ish (39mm dial window), silver-white guilloché dial, integrated bracelet + grey FKM rubber w/ signed deployant, limited N°25/50. Bought by friend in Singapore for SGD 5,000 (~₪11,750). Status: `pending:true` until received. `dial:"silver-white"` chosen over `dial:"silver"` — latter broke colorMaterialDetection test (no DIAL_COLOR_MAP entry for "silver").

### v1.12.32 — Data Integrity + Kiral DB Suit (April 18 2026)
35. **CRITICAL: outfit-photo category trap** — Real garments silently miscategorized as `outfit-photo` are invisible to engine (`category NOT IN ('outfit-photo','watch','outfit-shot')` filter). Found 3 instances:
    - **Pavarotti Navy Pinstripe Suit Trousers** — stored under id `g_20260404_pavarotti_trousers` with name "Navy Suit Mirror Selfie" and category `outfit-photo` since Apr 4 2026. Half of the Pavarotti suit was broken in engine pairings for **14 days**. Recovered: category → `pants`, name → `Navy Pinstripe Suit Trousers`, proper notes.
    - **White V-Neck Basic Tee duplicate** (`g_1775897419_whtee1`) — orphan under outfit-photo. Real entry exists as `g_1776054760_white_vneck` in shirt category. Excluded the orphan.
    - **Tan Textured Knit Pullover orphan** (`g_1773490572693_2ybo2`) — no match to any real garment, no history references, likely leftover from camera-roll import. Excluded.
36. **watch_id canonical form normalized** — `gp-laureato` (1 history entry, Apr 16) vs `laureato` (7 entries) → merged to `laureato`. Single-source history for the GP.
37. **Kiral Navy Double-Breasted Suit acquired** — jacket + trousers added as formality 9 garments. Navy Prince of Wales check (glen plaid), dark tonal engraved buttons, DB peak lapel 6x2. First wear: wedding 17 Apr 2026 with GP Laureato blue (intentional texture match: Clous de Paris hobnail ↔ PoW check grid). Contexts: formal, date-night, eid-celebration, family-event (NOT smart-casual, NOT clinic).
38. **Pattern rhyme pairing principle documented** — Clous de Paris / hobnail dials (GP Laureato, VC Overseas rep) pair by structural grid with PoW check / glen plaid / nailhead / bird's-eye fabrics. Captured in Kiral DB jacket notes field so AI stylist surfaces it. New gotcha added to SKILL_watch_advisor2.md §7.
39. **3 new gotchas documented** — outfit-photo category trap, watch_id canonical form, pattern rhyme pairing. All in SKILL §7.
40. **Wardrobe doc reconciled** — removed duplicate "Kiral Cream Cable Knit Sweater" row, fixed stale footer counts (was 101, now 104), removed orphan "DB active count = 100" line, added Formal/Events + Pairing Principles sections.
41. **Active garment count**: 101 → 104 (+2 new Kiral DB pieces, +1 Pavarotti recovery).

### v1.12.33 — Auto-heal outfit-photo trap guard (April 18 2026)
42. **NEW auto-heal check #9: `outfit_photo_trap`** — closes the class of bug that hid Pavarotti trousers for 14 days. Runs daily at 05:00 UTC via existing cron. Queries garments for `category IN ('outfit-photo','outfit-shot')`, filters out `exclude_from_wardrobe=true` rows, then flags any remaining entry where EITHER:
    - `name` contains a garment-word regex match (`shirt|jacket|trouser|pant|sweater|cardigan|coat|blazer|suit|polo|oxford|pullover|flannel|chino|denim|jean|boot|sneaker|derby|hoodie|tee|dress`), OR
    - `id` does not match the phantom-id pattern `^g_\d{13,}_[a-z0-9]{5,6}$` (i.e. handcrafted IDs like `g_20260404_pavarotti_trousers` fail and get flagged).
    
    When suspicious entries found: reports first 5 in `findings[].found`, action `WARN — N real garment(s) miscategorized as outfit-photo, invisible to engine`, flips `healthy: false`. Does NOT auto-fix (category changes need human review).
43. **Test coverage**: 2 new tests in `tests/autoHeal.test.js` (16 total, was 14) — positive case verifies dual-signal detection (flags Pavarotti handcrafted-id case AND White V-Neck garment-word case, skips phantom IMG/numeric names, skips already-excluded rows); negative case verifies `healthy: true` when outfit-photos are clean. All 16 autoHeal tests pass.
44. **Check count bumped**: auto-heal header comment `7 → 9`. Tests updated: `body.checks` from 8 → 9 (3 locations), findings length from 8 → 9, new `outfit_photo_trap` key added to `toContain` assertions.

---

## Scoring Weights (Verified April 11 2026)
| Weight | Value | Status |
|--------|-------|--------|
| colorMatch | 2.5 | Correct |
| formalityMatch | 3.0 | Correct |
| watchCompatibility | 3.0 | Correct |
| weatherLayer | 1.0 | Correct |
| contextFormality | 0.5 | Correct |
| rotationFactor | 0.40 | Correct |
| repetitionPenalty | -0.28 | Correct |
| diversityFactor | -0.12 | Correct |
| seasonMatch | 0.30 | Correct |
| contextMatch | 0.10 | Correct |
| neverWornRecencyScore | 0.50 | Updated (was 0.75) |
| neverWornRotationPressure | 0.50 | Updated (was 0.70) |
| SCORE_CEILING | 30 | Correct |
| strapShoeScore | 1.0 always | DEAD — never re-add |

---

## Remaining TODO

### High Priority
1. **BulkTagger re-run** — 36 shirts now in DB; many missing season/context tags. Run BulkTagger on shirt + sweater categories to improve rotation scoring.
2. **Token cost monitoring** — $11.47 at Apr 13 (projected ~$26/month). buildWeeklyBrief downgraded to haiku (v1.12.25). Monitor post-fix; if still spiking, audit wardrobe-chat usage.
3. ~~**Auto-heal: outfit-photo trap guard**~~ — DONE v1.12.33. Check #9 `outfit_photo_trap` runs daily, flips `healthy: false` on any miscategorized real garment.
4. **Shirt list reconciliation** — DB has 36 shirts, SKILL_wardrobe_v10.md table lists 34. Names drift (`Olive Striped Shirt (Gant)` vs `Gant Olive Striped Shirt`) making audit hard. One-off alignment pass needed.

### Medium Priority
3. **Pasha navy alligator strap** — pending DayDayWatchband delivery. Move to pasha straps when arrived.
4. **Tudor canvas straps** — navy + olive pending. Move to blackbay straps when delivered.
5. ~~**GS Rikka bracelet repair**~~ — DONE. Collar/bushing repaired Apr 13 2026. Titanium bracelet now usable.
6. ~~**SKILL_wardrobe update in repo**~~ — DONE (v10 published in commit 3b28889).

### Low Priority
7. **Scoring weight review** — if shirt stagnation persists after BulkTagger, consider rotationFactor 0.40→0.45 via scoringOverrides.
8. **GP Laureato Infinite Grey** — primary acquisition target (~₪65,000). Preserve resources.
