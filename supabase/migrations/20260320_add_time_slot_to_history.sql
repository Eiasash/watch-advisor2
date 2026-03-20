ALTER TABLE history ADD COLUMN IF NOT EXISTS time_slot TEXT CHECK (time_slot IN ('morning','afternoon','evening','night'));
