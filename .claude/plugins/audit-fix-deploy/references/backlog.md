# Backlog — watch-advisor2

Prioritized list of improvements and known issues. Implement during Phase 3 of audit-fix-deploy.

## Priority 1 — Critical Infrastructure

### Supabase keep-alive cron
Supabase free tier pauses after 7 days inactivity. Create `netlify/functions/supabase-keepalive.js` with schedule `0 6 */5 * *`.

### Retired watch flag
When a watch is traded, history entries break the rotation engine. Add `retired: true` + `retiredDate` to watchSeed.js. Filter retired watches from scoring but keep in history display.

Watches to mark retired:
- SBGW267 (traded March 2026)
- Sinn 613 UTC (traded Feb 2025)
- Rolex Date 15203 (traded Feb 2025)

## Priority 2 — Scoring & Context

### Eid/Family context support
Add `"eid-celebration"` and `"family-event"` as valid contexts in:
- `src/config/scoringWeights.js`
- WatchDashboard context selector
- OnCallPlanner context options
- History logging payload

Scoring rules: brown shoes + navy trousers → 0.6 (not 0.0). Formality target: 6–8.

### Context-aware shoe rule relaxation
In `scoring.js` → `strapShoeScore()`: if eid-celebration or family-event context → return 0.6 instead of 0.0 for brown strap + dark trousers.

### Tailor flag badge UI
Add visible warning badge for garments needing tailoring. Exclude from clinic/formal contexts.

## Priority 3 — Data Quality

### Orphaned history garmentIds patch tool
Add button in AuditPanel to patch history entries with empty/null garmentIds.

### History entry quality enforcement
Block save if garmentIds empty, context null, or score non-numeric.

### Payload schema versioning
Add `payload_version: "v1"` to every new history INSERT. Backfill existing entries.

## Priority 4 — Observability

### Claude model version from app_config
Read model from DB on cold start instead of hardcoding. Change model without deploy.

### Token usage logging
Log input/output tokens after every `callClaude()`. Show monthly cost in DebugConsole.

### Skill snapshot endpoint
Create `netlify/functions/skill-snapshot.js` for health checks and audit verification.

### Storage quota check on boot
Check IndexedDB storage usage. Warn if >70% — mobile browsers evict silently.

## Priority 5 — Future

### Outfit quality trend endpoint
Weekly average scores for last 12 weeks. Plot in DebugConsole.

### No-wear push notification
If no outfit logged for 7 days, send push reminder via push-brief.js.

### Wardrobe health score
Per-category wear rate. Warn if any category >25 items and <30% wear rate.

## Classifier Weak Spots (Known)
- Belts from camera roll: pixel classifier can't detect — falls to Claude Vision
- Selfie/outfit photos: filename keyword only (selfie|mirror|ootd|outfit|IMG_)
- Flat-lay pants: fixed via `botF > topF + 0.08` zone bias
