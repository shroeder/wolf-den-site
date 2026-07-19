-- Marks a stored pet sprite as orientation-checked (faced right). Lets the one-time "fix orientation"
-- repair run in resumable batches (process WHERE oriented_at IS NULL) without re-checking finished ones.
-- New sprites are generated already-right, so they stamp this immediately.
ALTER TABLE mkt_pet_sprite ADD COLUMN IF NOT EXISTS oriented_at TIMESTAMPTZ;
