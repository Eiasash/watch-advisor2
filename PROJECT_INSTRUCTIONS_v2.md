# Watch-Advisor2 Project Instructions

> Last updated: April 18, 2026 | App version: 1.12.33 | 104 garments | Acquisition: Fears Brunswick Champagne in motion

---

## What This Project Is

A personal React PWA that coordinates daily outfits with a 23-piece (+1 pending, +1 incoming) watch collection.
Single user, single developer (Eias — physician, geriatric ward, Jerusalem, Israel).
Israel work week: Sun–Thu = work days, Fri–Sat = weekend. Sunday is the first working day.

**Live:** https://watch-advisor2.netlify.app
**Repo:** github.com/Eiasash/watch-advisor2
**Stack:** React 18 + Vite + Zustand + IndexedDB + Supabase + Netlify Functions + Claude Sonnet 4

---

## Project Files

| File | Purpose | When to update |
|------|---------|----------------|
| `SKILL_watch_advisor2.md` | Dev skill — architecture, gotchas, workflows | After every code change session |
| `SKILL_wardrobe_v10.md` | Wardrobe reference — all garments, pairings | After garment adds/removes/tailor updates |
| `Watch_Collection_v11-5.md` | Watch + strap inventory + acquisition plan | After acquisitions, trades, strap deliveries, or acquisition pivots |
| `IMPROVEMENTS.md` | Audit findings + shipped fixes log | After audit/fix sessions |
| `Api_` | API keys reference | When keys rotate |

---

## How to Work on This Project

### Before ANY code change
1. Read `SKILL_watch_advisor2.md` (full skill file, not the summary)
2. Read any relevant section of `SKILL_wardrobe_v10.md` if touching outfit logic
3. Check the health endpoint: `GET https://watch-advisor2.netlify.app/.netlify/functions/skill-snapshot`

### After EVERY code change session
```
1. timeout 120 node node_modules/.bin/vitest run     # ALL tests pass
2. git add -A && git commit -m "<type>: <msg>"
3. git push origin main                               # NOT a feature branch
4. Verify Netlify deploy state = "ready" via MCP
5. Bump version in package.json (patch/minor/major)
6. Update SKILL_watch_advisor2.md if architecture changed
7. Update IMPROVEMENTS.md if bugs fixed or features added
8. Update Claude memory if relevant patterns discovered
```

### Supabase rules
- **ALWAYS use `supabase watches:execute_sql` and `supabase watches:apply_migration`** — wired to `oaojkanozbfpofbewtfq`
- Plain `Supabase` MCP tool points at **Toranot** (wrong project) — never use for watch-advisor2
- Reads/DML → `execute_sql`
- DDL → `apply_migration` + commit `.sql` to `supabase/migrations/` IMMEDIATELY
- JSONB values: never double `JSON.parse()` — Supabase auto-parses
- Model string: `'"model-name"'::jsonb` not bare text

### Netlify rules
- Site ID: `4d21d73c-b37f-4d3a-8954-8347045536dd` (**NOT** `85d12386` = Toranot)
- Cron functions: never invoke via HTTP, dashboard only
- Vision functions: `maxAttempts: 1` (10s hard timeout)
- Env vars: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` must be set

---

## Key Architecture Decisions — Do NOT Reverse

| Decision | Why |
|----------|-----|
| **Strap-shoe rule DEAD** (v1.12.12) | `strapShoeScore()` returns 1.0 always. Never re-add filtering. |
| **Single scoring path** | `buildOutfit()` only. `generateOutfit()` removed. Never re-add fallback. |
| **`extractText()` for Claude** | All 15+ serverless functions use it. Never use `content[0].text`. |
| **`Array.isArray()` for IDB** | Never `?? []` — IDB returns truthy non-arrays (strings). Six failed attempts proved this. |
| **SCORE_CEILING = 30** | Additive engine. Was 0.60 (multiplicative era, broken). Never lower. |
| **Coherence v2: warm/cool = +0.20** | Rewards contrast. Never revert to -0.15. |
| **Never-worn: 0.50/0.50** | Lowered April 2026 from 0.75/0.70. Prevents over-rotation to unworn pieces. |
| **`FORMAL_CONTEXTS` includes "clinic"** | Fixed Apr 11 — replicas/tailor items were slipping through clinic outfits. |
| **Version display is build-time** | `__BUILD_NUMBER__` injected from `package.json` via `vite.config.js`. Bump version before every push. |
| **Pending watch filter** (v1.12.31) | `isActiveWatch()` in `src/utils/watchFilters.js` filters `!w.retired && !w.pending`. 19 filter points across 13 files. Never revert. |
| **Dial color canonical names** | Use `"silver-white"` not `"silver"` — DIAL_COLOR_MAP has no `silver` entry. Tests will fail. |

---

## Outfit Philosophy — For AI Prompts & Engine Tuning

### Context rules
- **Work (geriatric ward):** No dress code in Israeli hospitals. Smart-casual is the ceiling. Comfort is king. Never flag anything as "too casual" for work.
- **Shift/on-call:** Tool watches only (Speedmaster, BB41, Hanhart). Comfort clothes.
- **Formal/events:** Genuine watches required. Reverso, Pasha, Santos, Laureato for DB suits.
- **Casual/weekend:** Replicas shine. Bold dials. Low stakes.

### Watch strategy
- **Genuine** for understated prestige (GS, Cartier, JLC, Tudor, Omega, TAG, Hanhart, GP, anOrdain target, Fears target)
- **Replica** for bold dial colors too expensive authentic (turquoise, purple, burgundy, teal, green)
- **Zero redundancy** — each piece fills a unique role

### Pattern-rhyme pairing (v1.12.32)
- Clous de Paris / hobnail dials (GP Laureato, VC Overseas rep, IWC Ingenieur rep) ↔ PoW check, glen plaid, nailhead, bird's-eye fabrics
- Smooth / sunburst dials ↔ smooth worsted, solid-texture suits
- Sector / striped dials (Hanhart Pioneer) ↔ herringbone, subtle flannel
- Guilloché dials (Snowflake, Perception pending) ↔ micro-jacquard, tonal textures

### Strap-shoe coordination
**NOT A RULE.** Eliminated from the engine in v1.12.12. Do not mention unless Eias explicitly asks.

### Footwear
No loafers. Primary rotation: brown Ecco S-Lite Hybrid (daily driver), Ecco Pebble Grain (dressier), white sneakers (casual), black shoes (formal), Geox boots (cold/wet).
**Note:** Two distinct brown Ecco pairs — not interchangeable. Default to S-Lite when "brown Ecco daily" is referenced.

---

## Acquisition Plan (Current — April 18, 2026)

### PRIMARY: Fears Brunswick 38 Champagne (in motion)

- British micro, Bristol-made, cushion 38mm × 11.8mm, 20mm lug
- 18ct yellow gold galvanic champagne dial, glass bead frosted
- ETA 7001 top-grade manual wind, Côtes de Genève
- Small seconds at 6 (clean dial — passes dial discipline rule)
- Standard Pewter Grey Barenia leather, open caseback
- **Target landed:** ~₪16,500 watch + ₪800 bracelets + ₪300 forward = ~₪17,600
- **Ceiling:** ₪18,000 total
- Order routing: Fears UK direct → Singapore friend → forward to Israel as gift
- Bracelets (pending Fears shipment): Forstner Klip bonklip 18mm + Forstner 9-row Beads of Rice 18mm, both from forstnerbands.com

### PASSIVE: anOrdain Model 2 Brown Fumé — distressed-price only

- 30-piece 2021 run-out, discontinued, grand feu vitreous enamel mahogany
- Market reality: $3,500–4,500 USD typical
- **Distressed-floor ceiling: $2,500 USD / ₪9,500 only**
- If steal appears, stretch to ₪25K total to grab both. Otherwise Fears fills the slot
- Daily 20:00 alert active until 16 Jun 2026
- Outreach live: WatchVault AU, James Porter Glasgow, Roldorf Vancouver, Armoury Tribeca + HK, r/watchexchange, WUS

### Acquisition Rules (codified April 18 2026)

1. **Clean dial discipline** — 3-hand + optional sub-seconds at 6. No retrograde, no multi-subdial dress complications, no busy PR arcs
2. **Wardrobe fit** — earth-tone rotation favors warm dials (brown, champagne, copper, cream). Salmon/pink/coral dials rejected (fight brown-dominated wardrobe)
3. **Zero redundancy** — no second Tudor, no second integrated bracelet, no GS overlap, no format hoarding
4. **Brand tier floor** — GS / Cartier / JLC / Tudor / Omega / TAG / Hanhart / GP / premium micro (anOrdain, Fears). Baltic / Paulin / entry-tier = below standard
5. **Dial-craft required** — grand feu enamel, Urushi, guilloché, hand-worked finishes. Printed sunburst metallics don't extend collection DNA

### Rejected alternatives (for memory)

- Tudor Monarch 2026 ($5,875, 2nd Tudor + 2nd integrated + over budget)
- Tudor Royal 40mm Brown (same redundancy issues, weakest Tudor line)
- Seiko Presage SPB395 Urushi (dial too busy — retrograde day/date + PR despite great craft)
- Kurono Toki Salmon (wardrobe fight, saturated secondary)
- anOrdain Grey Haar (Pasha/Snowflake partial overlap)
- anOrdain Plum Fumé (purple fights earth-tones)
- Baltic MR Roulette Salmon (tier + salmon)
- Paulin Neo (entry tier)

---

## Watch Collection Summary (23 active + 1 pending + 1 incoming)

### Genuine — Active (13)
GP Laureato 42mm blue hobnail, GS Snowflake SBGA211, GS Rikka SBGH351 (bracelet repaired Apr 13, teal alligator default),
Cartier Pasha 41 WSPA0026 (navy alligator pending delivery), Cartier Santos Large W2SA0009, Cartier Santos Octagon vintage YG,
Tudor BB41 M7941A1A0RU-0003 (navy + olive canvas pending), Omega Speedmaster 3861, TAG Heuer Monaco CW2111,
Rolex GMT-Master II 116710LN, JLC Reverso Duoface Moon, Hanhart Pioneer Flyback 417 ES, Laco Flieger Type B

### Genuine — Pending (1)
Atelier Wen Perception × Revolution N°25/50 — silver-white guilloché 39mm integrated, shipped from Singapore. `pending:true` in watchSeed.js — excluded from rotation until received.

### Genuine — Incoming (1)
Fears Brunswick 38 Champagne — order in motion via Fears UK direct, ship to Singapore friend, forward to IL. Activate with `incoming:true` when ordered.

### Replica (10)
IWC Perpetual Calendar (blue), IWC Ingenieur (teal), VC Overseas Perpetual (burgundy),
Cartier Santos 35mm (white), Chopard Alpine Eagle (red), AP Royal Oak Chrono (green),
Rolex GMT Meteorite, Rolex Day-Date (turquoise), Rolex OP (purple/grape), Breguet Tradition (black)

### Strap inventory: 40 total active, 42 with pending

---

## Wardrobe Summary (104 active garments — April 18 2026)

- Tailor queue empty (cleared Apr 11). Kiral Navy DB PoW suit highest formality (f9), first worn Apr 17 wedding
- Brown Ecco inventory: **two distinct pairs** — S-Lite Hybrid (g_1773168921553_0guwf, daily) + Pebble Grain (g_1773168976494_pycdu, dressier)
- White OCBD gap: no solid white OCBD in wardrobe; Gant White Striped Oxford is closest

---

## Diagnostics & Troubleshooting

### Health check
```
GET https://watch-advisor2.netlify.app/.netlify/functions/skill-snapshot
```
Healthy state: garmentCount ≥104, orphanedHistoryCount 0, all health "ok", autoHeal.healthy true.

### Common failures
| Symptom | Cause | Fix |
|---------|-------|-----|
| App connects to example.supabase.co | VITE_ env vars missing from Netlify | Add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` |
| `.filter() is not a function` | IDB returns truthy non-array | Use `Array.isArray()` guard, not `?? []` |
| Claude function returns undefined | Multi-block response, `content[0].text` fails | Use `extractText()` helper |
| Vision 504 timeout | Carrier proxy ~7s + large image | Smaller image + `max_tokens: 1100` + `maxAttempts: 1` |
| Deploy stale | Netlify asset deduplication | Verify bundle hash in browser, not just deploy state |
| Tests hang | Wrong vitest invocation | `timeout 120 node node_modules/.bin/vitest run` |
| npm install fails | Puppeteer download | `PUPPETEER_SKIP_DOWNLOAD=true npm install` |
| Wrong Supabase project | Used plain `Supabase` MCP tool | Always use `supabase watches:execute_sql` |
| Pending watch appears in rotation | Someone skipped `isActiveWatch()` filter | Check `src/utils/watchFilters.js`, ensure all filter points use helper |

### Key SQL queries
```sql
-- Active garment count
SELECT COUNT(*) FROM garments WHERE exclude_from_wardrobe IS NOT TRUE AND category NOT IN ('outfit-photo','watch','outfit-shot');

-- History entries
SELECT COUNT(*) FROM history;

-- Current model
SELECT value FROM app_config WHERE key = 'claude_model';

-- Live scoring override (no deploy needed)
UPDATE app_config SET value = '{"rotationFactor": 0.45}'::jsonb WHERE key = 'scoring_overrides';

-- Update active strap (write full object every time)
UPDATE app_settings SET active_straps = '{...full object...}'::jsonb, updated_at = NOW() WHERE id = 'default';
```

---

## Communication Style

Eias is terse and directive. Short confirmations ("Go," "done," "Fixed"). Expects immediate action, not explanation. Pushes back directly when wrong — acknowledge the override, log it, move on.

**Be opinionated.** Give final calls with brief rationale, not options menus.
**Automate.** If you can do it, do it. Don't ask permission.
**Don't be a yes-man.** Analyze critically. Flag real problems. Skip fake ones.
