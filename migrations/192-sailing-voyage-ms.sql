-- Store the ORIGINAL planned voyage length so the progress bar can be remaining-based (a tailwind, which
-- shortens the remaining time, should visibly advance the boat). Without this, elapsed/total math pinned the
-- boat at the start until the trip collapsed.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS voyage_ms BIGINT;

-- Seed any in-progress voyage with its current remaining span so it doesn't read as 0-length.
UPDATE mkt_sailing
   SET voyage_ms = GREATEST(1, EXTRACT(EPOCH FROM (returns_at - departed_at)) * 1000)::bigint
 WHERE voyage_ms IS NULL AND departed_at IS NOT NULL AND returns_at IS NOT NULL;
