# Watch-Advisor2 Project Instructions

> Last updated: June 3, 2026 | App version: **1.13.68** | 124 garments | Active model: **claude-sonnet-4-6**
> Collection: **25 active (14 genuine + 11 replica) + 1 pending (Fears Brunswick) + 5 retired**

---

## What This Project Is

A personal React PWA that coordinates daily outfits with a 25-piece (+1 pending) watch collection.
Single user, single developer (Eias — physician, geriatric ward, Jerusalem, Israel).
Israel work week: Sun–Thu = work days, Fri–Sat = weekend. Sunday is the first working day.

**Live:** https://watch-advisor2.netlify.app
**Repo:** github.com/Eiasash/watch-advisor2
**Stack:** React 18 + Vite + Zustand + IndexedDB + Supabase + Netlify Functions + Claude (claude-sonnet-4-6)

---

## Project Files

| File | Purpose | When to update |
|------|---------|----------------|
| `SKILL_watch_advisor2.md` | Dev skill — architecture, gotchas, workflows | After every code change session |
| `Wardrobe_Collection_v10-4.md` | Wardrobe reference — all garments, pairings | After garment adds/removes/tailor updates |
| `Watch_Collection_v11-10.md` | Watch + strap inventory + acquisition plan | After acquisitions, trades, strap deliveries |
| `IMPROVEMENTS.md` | Audit findings + shipped fixes log | After audit/fix sessions |
| `API_secret` | Supabase service-role key (PostgREST) | When keys rotate |

---

## How to Work on This Project

### Before ANY code change
1. Read `SKILL_watch_advisor2.md` (full skill file, not the summary).
2. `git pull origin main` + `git branch -a` BEFORE creating a branch — prior sessions may have left unmerged `claude/*` branches, and **main moves fast** (it advanced 1.13.66 → 1.13.68 across recent sessions). Always reconcile against live state, not memory.
3. Read the relevant section of `Wardrobe_Collection_v10-4.md` if touching outfit logic.

### After EVERY code change session
```
1. timeout 300 node node_modules/.bin/vitest run     # ALL tests pass (3785 as of v1.13.67)
2. git checkout -b claude/term-<topic>                # main is PROTECTED — never push to main directly
3. git add -A && git commit -m "<type>: <root-cause msg>"
4. git push -u origin claude/term-<topic>
5. Open PR via GitHub API; wait for vitest + netlify deploy-preview = success; squash-merge
6. Verify prod: grep the LIVE bundle for the change (not just deploy state)
7. Bump version in package.json BEFORE the push (patch=bug/quality, minor=feature)
8. Update SKILL_watch_advisor2.md + IMPROVEMENTS.md
9. Update Claude memory if relevant patterns discovered
```
> **`main` is branch-protected — PR + squash merge required.** Direct `git push origin main` is rejected. `Pages changed = neutral` on a backend/data-only PR is normal, not a failure. If `npm install` is needed first: `PUPPETEER_SKIP_DOWNLOAD=true npm install`.

### GitHub auth
- PAT proxy: `GET https://watch-advisor2.netlify.app/.netlify/functions/github-pat` with `x-api-secret`.
- **The watch-advisor2 endpoint secret is STALE (returns 401) — confirmed still broken June 3 2026.** Working fallback: the cross-repo Toranot endpoint `GET https://toranot.netlify.app/api/github-pat` with `x-api-secret: shlav-a-mega-1f97f311d307-2026` returns a PAT valid for all of Eias's repos. Scrub the PAT from the remote URL after pushing (`git remote set-url origin https://github.com/...`); revoke at github.com/settings/tokens when done. **Refresh the watch-advisor2 secret so its own endpoint works again** (recurring drag — open since at least June 2).

### Supabase — **MCP routing is BROKEN, use PostgREST directly**
- The plain `Supabase` MCP tool ignores `project_id` and hits **Toranot**. Do **not** rely on it.
- Use direct PostgREST with the **service-role key** at `/mnt/project/API_secret` (`sb_secret_*`, bypasses RLS):
  ```
  SK=$(cat /mnt/project/API_secret); P=oaojkanozbfpofbewtfq
  curl -X POST "https://$P.supabase.co/rest/v1/<table>?on_conflict=<col>" \
    -H "apikey: $SK" -H "Authorization: Bearer $SK" \
    -H "Prefer: return=representation,resolution=merge-duplicates"
  ```
- Reads/DML → PostgREST GET/POST/PATCH. Counts → `Prefer: count=exact` + `Range: 0-0`, read `content-range`.
- DDL/migrations → commit the `.sql` to `supabase/migrations/` IMMEDIATELY **and** re-run `npm run prebuild` (bundle drift guard `tests/migrationsBundleDrift.test.js` fails CI otherwise).
- JSONB values: Supabase auto-parses — never double `JSON.parse()`. Model string: `'"model-name"'::jsonb`, not bare text.
- `app_config` is the live key-value store (JSONB). `app_settings` is legacy.

### Netlify rules
- Site ID: `4d21d73c-b37f-4d3a-8954-8347045536dd` (**NOT** `85d12386` = Toranot)
- Deploy state via Netlify MCP `netlify-project-services-reader` (get-project → `currentDeploy.state`).
- Cron functions: never invoke via HTTP, dashboard only.
- Vision functions: `maxAttempts: 1` (10s hard timeout); `selfie-check` also `max_tokens: 1100`.
- Env vars: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` must be set.

---

## Key Architecture Decisions — Do NOT Reverse

| Decision | Why |
|----------|-----|
| **Strap-shoe rule DEAD** (v1.12.12) | `strapShoeScore()` returns 1.0 always. Never re-add filtering. |
| **Single scoring path** | `buildOutfit()` only. `generateOutfit()` removed. Never re-add fallback. |
| **`extractText()` for Claude** | All 15+ serverless functions use it. Never use `content[0].text`. |
| **`Array.isArray()` for IDB** | Never `?? []` — IDB returns truthy non-arrays (strings). Six failed attempts proved this. |
| **SCORE_CEILING = 30** | Additive engine. Was 0.60 (multiplicative era, broken). Never lower. |
| **Coherence v2: warm/cool = +0.20** | Rewards contrast. Never revert to −0.15. |
| **Never-worn: 0.50/0.50** | Lowered April 2026 from 0.75/0.70. Prevents over-rotation to unworn pieces. |
| **Empty-history jitter floor = 1e-4** (v1.13.55) | Boost was 0 when hash hit a multiple of 1000 → flaky on certain dates. Floor keeps first-wear strictly above non-empty. |
| **`FORMAL_CONTEXTS` includes "clinic"** | Fixed Apr 11 — replicas/tailor items were slipping through clinic outfits. |
| **Version display is build-time** | `__BUILD_NUMBER__` injected from `package.json` via `vite.config.js`. Bump version before every push. |
| **Pending watch filter** (v1.12.31) | `isActiveWatch()` in `src/utils/watchFilters.js` = `!w.retired && !w.pending`. ~19 filter points across 13 files. Never hand-roll (`tests/noHandRolledActiveFilter.test.js` guards it). |
| **CATEGORY_ROTATION_MULTIPLIER** (v1.13.48) | shoes×0 (rotation-neutral — never flag shoe over-rotation), pants×0.4. |
| **Dial color canonical names** | Use `"silver-white"` not `"silver"` — DIAL_COLOR_MAP has no `silver` entry. `"ivory"` added v1.13.51 (GP Vintage 1945); `"champagne"` for Fears. |
| **contextFormality weight = 0.5** | Was 1.5 — reduced because rigid context buckets were forcing outfit choices. Do not raise. |
| **Color tone sets** | `_WARM` includes mustard, salmon. `_COOL` includes cobalt-blue, light-blue, slate-blue. Never remove. |
| **`STRAP_ID_ALIASES`** (`src/data/strapAliases.js`) | Never delete entries — legacy ID coverage. Rikka SS bracelet `rikka-titanium-bracelet`→`rikka-bracelet` (v1.13.40). |
| **Hooks-before-returns** | All React hooks before any conditional `return`. Guard: `tests/hooksBeforeEarlyReturn.test.js`. Opt-out: `// hooks-order-ok`. |
| **Push unsubscribe = Bearer JWT** (#246, v1.13.63) | DELETE `/push-subscribe` was gated on `x-api-secret` (server-only env the browser can't supply) → every unsubscribe silently orphaned a row. Now uses `authedFetch()`/`requireUser()`. Never revert to `x-api-secret`. |
| **Layer prompt = engine gates** (#247, v1.13.64) | `daily-pick.js` AI prompt must match the engine layer rule: **coat <10°C / sweater 10–12°C / no layer ≥13°C**; jacket 13–21°C gated to formal/business context only. Prompt must never promise layers the engine won't build. |

---

## Outfit Philosophy — For AI Prompts & Engine Tuning

### Context rules
- **Work (geriatric ward):** No dress code in Israeli hospitals. Smart-casual is the ceiling. Comfort is king. **Never** flag anything as "too casual"/"too formal"/"formality gap"/"under-deploying the watch." Critique on **color, texture, coherence, pattern rhyme, comfort** only.
- **Shift/on-call:** Tool watches only (Speedmaster, BB41 primary; Hanhart secondary). Comfort clothes. Excludes dress watches.
- **Formal/events:** Genuine watches. Reverso, Pasha, Santos, Laureato, GP Vintage 1945 for DB suits.
- **Casual/weekend:** Replicas shine. Bold dials. Low stakes.

### Watch strategy
- **Genuine** for understated prestige (GS, Cartier, JLC, Tudor, Omega, GP, GO, Atelier Wen, anOrdain target, Fears target).
- **Replica** for bold dial colors too expensive authentic (turquoise, purple, burgundy, teal, green).
- **Zero redundancy** — each piece fills a unique role. ~24-piece (genuine) ceiling.

### Pattern-rhyme pairing (v1.12.32)
- Clous de Paris / hobnail dials (GP Laureato, GP Vintage 1945, VC Overseas rep, IWC Ingenieur rep) ↔ PoW check, glen plaid, nailhead, bird's-eye fabrics.
- Smooth / sunburst dials (GO Seventies) ↔ smooth worsted, solid-texture.
- Sector / striped dials (Hanhart Pioneer) ↔ herringbone, subtle flannel.
- Guilloché dials (GS Snowflake, **Atelier Wen Perception**) ↔ micro-jacquard, tonal textures.
- Champagne dial (Fears Brunswick pending) ↔ earth tones, mustard, ecru, camel, navy.
- Ivory dial (GP Vintage 1945) ↔ cream, beige, chestnut, cognac warm palette.

### Strap-shoe coordination
**NOT A RULE.** Eliminated v1.12.12. Do not mention unless Eias explicitly asks.

### Footwear — **rotation-neutral (shoes×0), no over-rotation flags, never suggest shoe swaps for rotation. No loafers.**
Chestnut Ecco S-Lite (daily), tan Ecco (white sole), black Ecco derby, Pebble Grain Metropole (dressier), Ecco cognac derby (smooth), Blundstone Rustic Brown Chelsea, Geox cognac mid-boot, Ecco taupe canvas, Ecco black suede sneaker, Geox Spherica white sneaker (the only white sneaker besides the Puma multicolor — NOT an Adidas shell-toe), black formal derby.

---

## Acquisition Status (June 3, 2026)

### Recently acquired (May–June 2026)
- **GP Vintage 1945 Big Date** ref 25805-11-822-BAEA (LE 999) — IN HAND May 23. Trade #3 (Timor): Monaco + ₪4K → GP. SS bracelet + brown leather (signed GP deployant).
- **Glashütte Original Seventies Chronograph Panorama Date** ref 1-37-02-08-02-62, serial Nr. 0157 — IN HAND May 27. Trade #4 (Timor): Rolex GMT 116710LN OUT + **₪3K cash to Eias** → GO. Current-gen blue, on OEM navy Louisiana alligator. marketILS 40000. Fair/even trade. (Matching OEM steel bracelet is a WISHLIST add, not owned.)
- **Atelier Wen × Revolution Perception N°25/50** — **IN HAND June 3** (received in Israel from Singapore; the former pending P1). Silver-white guilloché, 39mm octagonal integrated. On the **steel hexagonal bracelet** (default) + **grey FKM rubber** on a signed Atelier Wen **pin (tang) buckle** (not a deployant — confirmed from in-hand photos). Warranty serial 025, caseback N°25/50. Activated v1.13.67; strap-label fix v1.13.68. First wear `wear-2026-06-03-perception`.

### ORDERED: Fears Brunswick 38 Champagne
INV-3936, Apr 22 2026, £2,500, Serial 1919, ref BS23800B, LJP D100. Ships Fears UK → Fish Jaafar (SG) → IL. `pending:true`, `dial:"champagne"`.

### PASSIVE: anOrdain Model 2 Brown Fumé
Distressed-floor ceiling: $2,500 / ₪9,500 only.

### Pending in collection
- **Fears Brunswick 38 Champagne** — ordered, shipping. The only pending watch. `pending:true` in `watchSeed.js` (excluded from rotation until received).

### WISHLIST: GO Seventies OEM steel bracelet
Came on alligator only. Proprietary fitted, no aftermarket equivalent. New OEM spare ~₪7–11K; used standalone ~₪4.5–7K. Only chase a used one near ₪5K.

### Future watchlist
- Grey dial Alpine Eagle 41 — Timor to flag when available.

---

## Watch Collection Summary (25 active + 1 pending + 5 retired)

### Genuine — Active (14)
GP Laureato 42mm blue hobnail, GS Snowflake SBGA211 (titanium bracelet default), GS Rikka SBGH351 (**stainless steel** bracelet default, repaired Apr 13),
Cartier Pasha 41 WSPA0026 (navy alligator default — AliExpress strap), Cartier Santos Large W2SA0009, Cartier Santos Octagon vintage YG,
Tudor BB41 M7941A1A0RU-0003 (**blue FKM rubber default**; 7 active straps incl. black FKM; navy + olive canvas pending),
**GP Vintage 1945 Big Date 25805-11-822-BAEA** (SS bracelet default), **GO Seventies Chronograph Panorama Date 1-37-02-08-02-62** (navy alligator; steel bracelet NOT owned),
**Atelier Wen Perception N°25/50** (silver-white guilloché, 39mm integrated; steel bracelet default + grey FKM rubber),
Omega Speedmaster 3861, JLC Reverso Duoface Moon, Hanhart Pioneer Flyback 417 ES, Laco Flieger Type B.

**Critical corrections (do not regress):**
- GS Rikka bracelet = **STAINLESS STEEL**. Titanium = Snowflake SBGA211 only.
- Hanhart OEM strap = **BLACK leather bund-style** with white contrast stitch. Teal/yellow = aftermarket.
- Pasha navy alligator source = **AliExpress** (not DayDayWatchband). Received Apr 30.
- Santos Large cobalt alligator color = **blue** (not navy).
- GO Seventies = **navy alligator** (not bracelet). Nr. 0157 is GO's individual numbering, **not** an LE.
- Atelier Wen Perception N°25/50 IS a numbered LE (25 of 50); grey FKM strap buckle = **pin/tang**, not deployant.

### Genuine — Pending (1)
- Fears Brunswick 38 Champagne — LJP D100, champagne dial.

### Replica (11)
IWC Perpetual Calendar (blue), IWC Ingenieur (teal), VC Overseas Perpetual (burgundy),
Cartier Santos 35mm (white), Chopard Alpine Eagle (red), AP Royal Oak Chrono (green),
Rolex GMT Meteorite, Rolex Day-Date (turquoise), Rolex OP Grape (purple), **Rolex OP Pistachio (green)**, Breguet Tradition (black).

### Retired (5)
GS SBGW267 (→Pasha), Sinn 613 (→Speedmaster), Rolex Date 15203 (→Speedmaster), TAG Heuer Monaco CW2111 (→GP Vintage 1945, May 23), Rolex GMT-Master II 116710LN (→GO Seventies + ₪3K, May 27).

### Strap inventory
**57 strap entries across all active watches** (per `watchSeed.js`, incl. replica integrated bracelets); **59 with pending** (Tudor BB41 navy + olive canvas). Speedmaster 10 and Hanhart 6 carry the deepest strap rotations.

### Recent versions (context)
v1.13.56 BB41 black FKM strap · v1.13.57–59 strap rotation/health model + 3-tier layer rule · v1.13.60–62 chat honesty boundary + seed-derived chat roster · v1.13.63 push-unsub Bearer JWT · v1.13.64 layer prompt synced to engine · v1.13.66 runtime bug fixes (empty-content 400, fn timeouts, stale-SW React #300, WeekPlanner guard) · **v1.13.67 Atelier Wen Perception activated** · **v1.13.68 Perception grey FKM = pin buckle (label fix)**.

---

## Wardrobe Summary (124 active garments)

- Tailor queue empty (cleared Apr 11). Full rotation restored. Kiral Navy DB PoW suit = highest formality (f9).
- May 2026 additions: 13-piece summer batch (cobalt/mustard/salmon/light-blue/ecru/olive/white/navy/black SS pieces) + ecru waffle camp-collar shirt + Nautica sage camp shirt.
- Color engine: mustard/salmon → `_WARM`; cobalt-blue/light-blue/slate-blue → `_COOL`.
- Photo-upload debt (needs_review queue; embedding/hash/needs_review only populate via the app, not SQL): camp shirt, chambray, herringbone, sage Nautica camp, Breton tee. Plus legacy rows lacking photos (tan cord jacket, red/navy flannel, camel crewneck, light-blue cotton dress shirt, Kiral brown cardigan).
- Documented gap: solid white OCBD size L (Uniqlo or Kamakura Maker's). Two distinct brown Ecco pairs — S-Lite (daily) vs Pebble Grain (dressier), not interchangeable.
- DB/doc reconciliation: live canonical filter currently reports **124**; `Wardrobe_Collection_v10-4.md` carries 123. Reconcile the 1-row drift there.
- Garment descriptions in conversation: **plain familiar terms only** — never product codes/SKUs/garment IDs. "Stone trousers" not `PNT-5050`; "chestnut Eccos" not `gk2f4`.

---

## Diagnostics & Troubleshooting

### Health check
```
GET https://watch-advisor2.netlify.app/.netlify/functions/skill-snapshot
```
> **Now requires a Bearer token (401 without one).** Returns garmentCount, orphanedHistoryCount, health, autoHeal, activeModel. Healthy: garmentCount ≥124, orphanedHistoryCount 0, all health "ok", autoHeal.healthy true. If you can't auth, verify prod by grepping the live JS bundle instead.

### Common failures
| Symptom | Cause | Fix |
|---------|-------|-----|
| App connects to example.supabase.co | VITE_ env vars missing from Netlify | Add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` |
| `.filter() is not a function` | IDB returns truthy non-array | Use `Array.isArray()` guard, not `?? []` |
| Claude function returns undefined | Multi-block response, `content[0].text` fails | Use `extractText()` helper |
| Vision 504 timeout | Carrier proxy ~7s + large image | Smaller image + `max_tokens: 1100` + `maxAttempts: 1` |
| Deploy stale | Netlify asset dedup | Verify bundle hash/content in browser, not just deploy state |
| Tests hang | Wrong vitest invocation | `timeout 300 node node_modules/.bin/vitest run` |
| npm install fails | Puppeteer download | `PUPPETEER_SKIP_DOWNLOAD=true npm install` |
| Wrong Supabase project | Used the MCP tool | Use direct PostgREST + service-role key |
| `git push` to main rejected | main is branch-protected | Branch → PR → squash merge |
| github-pat 401 | watch-advisor2 endpoint secret stale | Use Toranot endpoint PAT fallback; refresh the secret |
| Pending watch in rotation | Skipped/hand-rolled `isActiveWatch()` | Check `src/utils/watchFilters.js` |
| New garment color scores 0.3 | Color not in DIAL_COLOR_MAP families | Add to `GARMENT_COLOR_FAMILIES` in `dialColorMap.js` |

### Key PostgREST snippets
```bash
SK=$(cat /mnt/project/API_secret); P=oaojkanozbfpofbewtfq
# active garment count
curl -sI "https://$P.supabase.co/rest/v1/garments?exclude_from_wardrobe=is.false&category=not.in.(outfit-photo,watch,outfit-shot)&select=id" \
  -H "apikey: $SK" -H "Authorization: Bearer $SK" -H "Prefer: count=exact" -H "Range: 0-0" | grep -i content-range
# log a wear (id pattern wear-YYYY-MM-DD-<watch_slug>; include garmentIds + payload_version:"v1"; quickLog:true if watch-only)
curl -X POST "https://$P.supabase.co/rest/v1/history?on_conflict=id" \
  -H "apikey: $SK" -H "Authorization: Bearer $SK" -H "Content-Type: application/json" \
  -H "Prefer: return=representation,resolution=merge-duplicates" -d '{...}'
# current model
curl -s "https://$P.supabase.co/rest/v1/app_config?key=eq.claude_model&select=value" -H "apikey: $SK" -H "Authorization: Bearer $SK"
```
> Never hard-delete garments — soft-delete only (`exclude_from_wardrobe=true` + `duplicate_of` + audit note).

---

## Communication Style

Eias is terse and directive. Short confirmations ("Go," "done," "Fixed," "Continue") are full directives. Expects immediate autonomous action, not explanation or permission-asking. Pushes back directly when wrong — acknowledge the override, fix it, move on. **Never** use product codes/SKUs/garment IDs in conversation; plain names only.

**Be opinionated.** Give final calls with brief rationale, not options menus.
**Automate.** If you can do it, do it. Don't ask permission.
**Don't be a yes-man.** Analyze critically. Flag real problems. Skip fake ones.
