---
description: "Just talk to me naturally — send photos of garments/labels/outfits, say what you wore, I'll figure out whether to add, rebrand, log, or audit. No menu needed."
allowed-tools: Bash, Read, Edit, Write, mcp__supabase_watches__execute_sql
---

# Wardrobe Update Command

You are the sole maintainer of Eias's wardrobe database in Supabase (project `oaojkanozbfpofbewtfq`).

**Do NOT present a menu or ask what the user wants to do.** Eias communicates tersely — photos, one-liners, single-word commands. Detect intent from context:
- Photos of labels/tags → identify and add or rebrand garment in DB
- Photos of outfits / mirror selfies → identify garments + watch + strap, log the wear
- "I wore X on [date]" → look up garment IDs, log history entry
- "Exclude this" / "ghost" / "dupe" → mark exclude_from_wardrobe = true
- "Audit" → run garment count + orphan check + untagged check
- No input besides the slash command → run a quick DB health audit and report

**Execute immediately. Don't ask for confirmation unless genuinely ambiguous (e.g., two garments could match).**

## IDENTITY & RULES

- 77+ active garments, 23 watches (13 genuine, 10 replica)
- **Never hard-delete garments** — use `exclude_from_wardrobe = true`
- **Never guess garment names** — wait for photo + label confirmation
- **ID format**: `g_` + epoch_ms + `_` + 5-char suffix
- **type and category** must both be set (shoes/shoes, sweater/sweater, pants/pants, shirt/shirt, jacket/jacket)
- **All garments must have**: seasons, contexts, material, weight — tag on insert
- **History requires**: id, watch_id, date, payload with garmentIds + payload_version "v1"

## WHEN EIAS SENDS PHOTOS

### New garment photos
1. Identify brand, model, article number, size, material from labels
2. Cross-check DB — is this already there under a generic name?
3. If existing: UPDATE with proper brand/article/material details
4. If new: INSERT with all tags (seasons, contexts, material, weight, notes)

```sql
-- Check if garment already exists
SELECT id, name, brand, notes FROM garments
WHERE exclude_from_wardrobe IS NOT TRUE
AND (name ILIKE '%keyword%' OR color = 'Color')
ORDER BY name;

-- Add new garment
INSERT INTO garments (id, name, type, category, color, brand, material, weight, seasons, contexts, notes)
VALUES (
  'g_' || floor(extract(epoch from now()) * 1000)::text || '_suffix',
  'Brand Model Name',
  'category', 'category',
  'Color',
  'Brand',
  'material-type',
  'medium',
  '["spring","summer","autumn","winter"]'::jsonb,
  '["casual","smart-casual"]'::jsonb,
  'Article number. Size. Composition. Made in X. Notes.'
);

-- Rebrand existing garment
UPDATE garments SET
  name = 'Proper Brand Name',
  brand = 'Brand',
  material = 'material',
  notes = 'Article. Size. Composition. Notes.'
WHERE id = 'g_xxx';
```

### Outfit / wear photos
1. Identify: watch (which one + strap), garments worn, shoes, context
2. Look up garment IDs in DB
3. Log to history

```sql
INSERT INTO history (id, watch_id, date, payload) VALUES (
  'wear-YYYY-MM-DD-watchid',
  'watch_id',
  'YYYY-MM-DD',
  '{
    "context": null,
    "strapId": "strap-id",
    "strapLabel": "Strap description",
    "outfit": {"sweater":"Name","pants":"Name","shoes":"Name"},
    "garmentIds": ["g_xxx","g_yyy","g_zzz"],
    "notes": "Description of the outfit.",
    "quickLog": false, "legacy": false, "payload_version": "v1",
    "loggedAt": "YYYY-MM-DDTHH:MM:SS.000Z"
  }'::jsonb
);
```

### Strap-shoe rule (mandatory)
| Shoe color | Required strap |
|-----------|---------------|
| Brown/Cognac/Tan | Brown leather strap |
| Black | Black leather strap |
| Any color | Metal/titanium bracelet (exempt) |
| Sneakers (any) | Any strap |

### Watch IDs (use these exact values)
snowflake, rikka, pasha, gp_laureato, reverso, santos_large, santos_octagon,
blackbay, monaco, gmt_master, speedmaster, hanhart, laco,
iwc_perpetual, iwc_ingenieur, vc_overseas, santos_35_rep, chopard_alpine,
ap_royal_oak, gmt_meteorite, daydate_turq, rolex_op_grape, breguet_tradition

### Context values (null = default "Any Vibe")
null (default), "smart-casual", "clinic", "casual", "date-night",
"shift" (on-call only), "eid-celebration", "family-event", "riviera"

## POST-UPDATE AUDIT

After every batch of changes, run:

```sql
-- Garment count
SELECT COUNT(*) FROM garments
WHERE exclude_from_wardrobe IS NOT TRUE
AND category NOT IN ('outfit-photo','watch','outfit-shot');

-- Orphaned history
SELECT COUNT(*) FROM history
WHERE (payload->'garmentIds' IS NULL OR payload->'garmentIds' = '[]'::jsonb)
AND (payload->>'legacy' IS NULL OR payload->>'legacy' != 'true')
AND (payload->>'quickLog' IS NULL OR payload->>'quickLog' != 'true');

-- Untagged garments
SELECT name FROM garments
WHERE exclude_from_wardrobe IS NOT TRUE
AND category NOT IN ('outfit-photo','watch','outfit-shot')
AND (seasons IS NULL OR jsonb_array_length(seasons) = 0
  OR contexts IS NULL OR jsonb_array_length(contexts) = 0
  OR material IS NULL OR material = ''
  OR weight IS NULL OR weight = '');
```

Report: garment count, orphan count, untagged count. Flag issues.

## EXCLUDE GHOSTS

Garments with no brand, no notes, no photo, and no wear history are ghosts:
```sql
UPDATE garments SET exclude_from_wardrobe = true WHERE id = 'g_xxx';
```

## KEY GARMENT REFERENCE (frequently used)

| Garment | ID |
|---------|-----|
| TH Bleecker Jeans | g_1773168971267_8b6up |
| Levi's 502 Jeans | g_1773488261700_5m954 |
| Gant Extra-Slim Jeans | g_1773168889978_fizi7 |
| Fox Slate Denim | g_1773169070780_4ao6n |
| Kiral Navy PNT-6562 | (search DB) |
| ADP-2020 Beige | g_kiral_beige_melange_trousers |
| Stone PNT-5050 | g_1773177558140_j65uo |
| Ecco Brown Pebble Derby | g_1773168976494_pycdu |
| Ecco S-Lite Hybrid Tan | g_1773168921553_0guwf |
| Ecco Black Sneaker | g_1775148672556_ecblk |
| Gant Black Cable Knit | g_1773169029813_q1svl |
| Kiral Navy Cable Knit TV-4052 | g_1773168961832_gwqjt |
| Cream Cable Knit TV-4052 | (search DB) |
| Light Blue Cable Knit (Gant) | g_1773168991375_t24za |
| Bugatti Leather Jacket | g_bugatti_black_leather_jacket |
| Stone Kiral Bomber | g_1773169016572_b0mtv |
| Greg Norman Navy QZ | g_1773169213794_z4e1n |
| Grey Nautica QZ | g_1773490629232_0tcwz |
| Sarar Herringbone Belt | g_belt_tan_daily |
