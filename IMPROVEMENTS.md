# Auto-Generated Improvement Proposals
Generated: 2026-04-11 (cumulative)

## Current State
- **Version**: 1.12.19
- **Engine integrity**: All checks PASS
- **Supabase**: 100 active garments, 0 dupes, 0 orphans
- **Tests**: 2475+ passing (144 files)
- **Snapshot**: All health "ok", autoHeal healthy
- **Build**: Auto-deploy on push to main
- **Token usage**: $5.85 for April 2026 (1.3M/128K tokens)
- **Model**: claude-sonnet-4-6
- **Wardrobe skill**: SKILL_wardrobe_v10.md

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
1. **Shirt idle rate** — 14/25 shirts idle (44% wear rate). BulkTagger re-run on shirt category needed. Weight-aware scoring for ~200 garments.
2. **Tailor follow-up** — Tommy Hilfiger blue micro-dot (chest), Gant White Oxford (cuffs), Kiral white dress shirt (cuffs), Nautica white navy stripe (torso).

### Medium Priority
3. **Pasha navy alligator strap** — pending DayDayWatchband delivery. Move to pasha straps when arrived.
4. **Tudor canvas straps** — navy + olive pending. Move to blackbay straps when delivered.
5. **GS Rikka bracelet repair** — sent to watchmaker Apr 6. Awaiting collar fabrication outcome + Seiya Japan response.
6. **SKILL_wardrobe update in repo** — replace v9 with v10 (100 garments, +2 new, TV70102 color fix).

### Low Priority
7. **Scoring weight review** — if shirt stagnation persists after BulkTagger, consider rotationFactor 0.40→0.45 via scoringOverrides.
8. **GP Laureato Infinite Grey** — primary acquisition target (~₪65,000). Preserve resources.
