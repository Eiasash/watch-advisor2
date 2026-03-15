-- Add weight and fit columns to garments table.
-- These are tagged by bulk-tag.js but were previously dropped silently
-- (not in schema, not in push/pull mappings).
-- weight: ultralight|light|medium|heavy
-- fit: slim|regular|relaxed|oversized|null (null for shoes/accessories)

ALTER TABLE public.garments
  ADD COLUMN IF NOT EXISTS weight text,
  ADD COLUMN IF NOT EXISTS fit    text;
