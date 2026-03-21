-- Stamp 6 legacy history entries (today-*/dash-* IDs) with legacy:true and payload_version:v1
-- These entries predate March 2026 garmentIds tracking and cannot be reconstructed.
-- Stamping them prevents skill-snapshot from counting them as orphaned.

UPDATE history
SET payload = jsonb_set(
  jsonb_set(
    payload,
    '{legacy}',
    'true'::jsonb
  ),
  '{payload_version}',
  '"v1"'::jsonb
)
WHERE id IN (
  'dash-1773006908290',
  'today-1772908305255',
  'today-1772970627677',
  'today-1773032645000',
  'today-1773207408927',
  'today-1773580800000'
);
